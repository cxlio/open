import { spec, TestApi } from '../spec/index.js';
import {
	buildOutputOptions,
	buildTargets,
	exec,
	formatArtifactSummary,
	formatBuildError,
	formatTargetArtifactSummary,
} from './builder.js';
import { getPackageBuildOptions } from './npm.js';
import { enforceCoverageGate, generateTestFile } from './spec.js';
import type { Package } from './npm.js';

export default spec('build', s => {
	s.test('output', it => {
		it.should('parse verbose option', a => {
			a.equal(buildOutputOptions(['test']).verbose, false);
			a.equal(buildOutputOptions(['test', '--verbose']).verbose, true);
		});

		it.should('exclude verbose flag from targets', a => {
			a.equalValues(buildTargets(['test', '--verbose']), [
				undefined,
				'test',
			]);
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
});
