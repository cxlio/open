import { spec, TestApi } from '../spec/index.js';
import { mkdtemp, rm, writeFile } from 'fs/promises';
import { tmpdir } from 'os';
import { join } from 'path';
import { sh } from '../program/index.js';
import {
	buildOutputOptions,
	buildTargets,
	exec,
	formatArtifactSummary,
	formatBuildError,
	formatTargetArtifactSummary,
} from './builder.js';
import {
	getPackageBuildOptions,
	npmDistTagCommand,
	npmPublishCommand,
	npmUnpublishCommand,
} from './npm.js';
import {
	enforceCoverageGate,
	generateTestFile,
	runBenchmarks,
} from './spec.js';
import type { Package } from './npm.js';
import { checkBranchClean, checkBranchUpToDate } from './git.js';

async function errorMessage(fn: () => Promise<unknown>) {
	try {
		await fn();
	} catch (e) {
		return e instanceof Error ? e.message : String(e);
	}
	throw new Error('Expected operation to fail');
}

export default spec('build', s => {
	s.test('output', it => {
		it.should('parse verbose option', a => {
			a.equal(buildOutputOptions(['test']).verbose, false);
			a.equal(buildOutputOptions(['test', '--verbose']).verbose, true);
		});

		it.should('exclude verbose flag from targets', a => {
			a.equalValues(buildTargets(['test', '--verbose'], ['test']), [
				undefined,
				'test',
			]);
		});

		it.should('reject unknown target', a => {
			a.throws(() => buildTargets(['tset'], ['test']), {
				message: 'Unknown build target "tset". Available targets: test',
			});
		});

		it.should('reject unknown option', a => {
			a.throws(() => buildTargets(['--json'], ['test', 'lint']), {
				message:
					'Unknown build option "--json". Available targets: test, lint',
			});
		});

		it.should('format artifact summary', a => {
			a.equal(
				formatArtifactSummary([
					{ path: 'index.js', size: 1500 },
					{ path: 'index.d.ts', size: 500 },
				]),
				'2 files, 2.00kb',
			);
		});

		it.should('format target artifact summary', a => {
			a.equal(
				formatTargetArtifactSummary('package', [
					{ path: 'package.json', size: 480 },
					{ path: 'index.js', size: 1170 },
				]),
				'package: 2 files, 1.65kb',
			);
		});

		it.should('format build error without stack', a => {
			a.equal(
				formatBuildError(new Error('eslint errors found.')),
				'eslint errors found.',
			);
		});
	});

	s.test('exec', it => {
		it.should('throw error if exec fails', async a => {
			try {
				await exec('exit 1');
			} catch (e) {
				a.ok(e !== undefined);
			}
		});
	});

	s.test('coverage gate', it => {
		const coverage = {
			fileTotal: 1,
			functionTotal: 2,
			functionCovered: 1,
			functionCoveragePct: 50,
			blockTotal: 4,
			blockCovered: 3,
			blockCoveragePct: 75,
		};

		it.should('pass configured thresholds', a => {
			enforceCoverageGate(coverage, { blocks: 75 });
			a.ok(true);
		});

		it.should('fail configured block threshold', a => {
			a.throws(() =>
				enforceCoverageGate(coverage, { blocks: 80 }),
			);
		});

		it.should('require coverage for configured gate', a => {
			a.throws(() =>
				enforceCoverageGate(undefined, { blocks: 80 }),
			);
		});
	});

	s.test('package build options', it => {
		const pkg = {
			name: '@cxl/test',
			version: '1.0.0',
			private: true,
			bugs: '',
			repository: '',
		} satisfies Package;

		it.should('inherit root build options', a => {
			a.equalValues(
				getPackageBuildOptions(
					{
						...pkg,
						build: {
							coverage: { blocks: 80, functions: 70 },
							dependencyUsageFunctions: ['resolveImport'],
							tsconfigs: ['tsconfig.worker.json'],
						},
					},
					pkg,
				),
				{
					coverage: { blocks: 80, functions: 70 },
					dependencyUsageFunctions: ['resolveImport'],
					tsconfigs: ['tsconfig.worker.json'],
				},
			);
		});

		it.should('merge coverage and override arrays', a => {
			a.equalValues(
				getPackageBuildOptions(
					{
						...pkg,
						build: {
							coverage: { blocks: 80, functions: 70 },
							dependencyUsageFunctions: ['resolveImport'],
							tsconfigs: ['tsconfig.worker.json'],
						},
					},
					{
						...pkg,
						build: {
							coverage: { functions: 90 },
							dependencyUsageFunctions: ['customImport'],
						},
					},
				),
				{
					coverage: { blocks: 80, functions: 90 },
					dependencyUsageFunctions: ['customImport'],
					tsconfigs: ['tsconfig.worker.json'],
				},
			);
		});

		it.should('leave coverage undefined when unconfigured', a => {
			a.equal(getPackageBuildOptions(pkg, pkg).coverage, undefined);
		});
	});

	s.test('npm publish authentication', it => {
		it.should('delegate authentication to npm', a => {
			a.equal(
				npmPublishCommand('beta'),
				'npm publish --access=public --tag beta',
			);
			a.equal(
				npmPublishCommand('beta', true),
				'npm publish --access=public --tag beta --dry-run',
			);
			a.equal(
				npmDistTagCommand('@cxl/test', '1.2.3-beta.1', '1-beta'),
				'npm dist-tag add @cxl/test@1.2.3-beta.1 1-beta',
			);
			a.equal(
				npmUnpublishCommand('@cxl/test', '1.2.3-alpha.1'),
				'npm unpublish @cxl/test@1.2.3-alpha.1',
			);
		});
	});

	s.test('npm publish git verification', it => {
		it.should('reject dirty and unsynchronized repositories', async a => {
			const baseDir = await mkdtemp(join(tmpdir(), 'cxl-build-git-'));
			const remoteDir = join(baseDir, 'remote.git');
			const dir = join(baseDir, 'project');
			const otherDir = join(baseDir, 'other');
			try {
				await sh(`git init --bare ${remoteDir}`);
				await sh('git symbolic-ref HEAD refs/heads/main', {
					cwd: remoteDir,
				});
				await sh(`git init -b main ${dir}`);
				await sh('git config user.email build@example.com', { cwd: dir });
				await sh('git config user.name Build', { cwd: dir });
				await writeFile(join(dir, 'file.txt'), 'initial');
				await sh('git add file.txt && git commit -m initial', { cwd: dir });
				await sh(`git remote add origin ${remoteDir}`, { cwd: dir });
				await sh('git push -u origin main', { cwd: dir });

				await checkBranchClean('main', dir);
				await checkBranchUpToDate('main', dir);

				await writeFile(join(dir, 'file.txt'), 'dirty');
				a.equal(
					await errorMessage(() => checkBranchClean('main', dir)),
					'Not a clean repository',
				);
				await sh('git checkout -- file.txt', { cwd: dir });
				await sh(`git clone ${remoteDir} ${otherDir}`);
				await sh('git config user.email build@example.com', {
					cwd: otherDir,
				});
				await sh('git config user.name Build', { cwd: otherDir });
				await writeFile(join(otherDir, 'file.txt'), 'remote change');
				await sh('git add file.txt && git commit -m changed', {
					cwd: otherDir,
				});
				await sh('git push origin main', { cwd: otherDir });
				a.equal(
					await errorMessage(() => checkBranchUpToDate('main', dir)),
					'Branch has not been merged with origin',
				);
			} finally {
				await rm(baseDir, { recursive: true, force: true });
			}
		});
	});

	s.test('test file generation', it => {
		const pkg = {
			name: '@cxl/test',
			version: '1.0.0',
			private: true,
			bugs: '',
			repository: '',
		} satisfies Package;

		it.should('keep screenshot tests separate', async (a: TestApi) => {
			const normal = await generateTestFile({
				appId: 'test',
				pkgJson: pkg,
				rootPkg: pkg,
			});
			const screenshot = await generateTestFile({
				appId: 'test',
				pkgJson: pkg,
				rootPkg: pkg,
				testFile: './test-screenshot.js',
				outFile: 'test-screenshot.html',
			});

			a.assert(normal);
			a.assert(screenshot);
			a.equal(normal.path, 'test.html');
			const normalSource = normal.source.toString();
			a.ok(normalSource.includes("new URL('./test.js'"));
			a.ok(
				normalSource.includes(
					'<script type="text/plain" id="spec-browser-runner">',
				),
			);
			a.ok(normalSource.includes("params.get('__cxlSpecBrowserFile')"));
			a.equal(screenshot.path, 'test-screenshot.html');
			a.ok(
				screenshot.source
					.toString()
					.includes("new URL('./test-screenshot.js'"),
			);
		});
	});

	s.test('benchmark target', async a => {
		await runBenchmarks({
			appId: 'missing-benchmark',
			outputDir: '../dist/missing-benchmark',
		});
		a.ok(true);
	});
});
