import { spec, TestApi } from '../spec/index.js';
import { mkdir, mkdtemp, rm, writeFile } from 'fs/promises';
import { tmpdir } from 'os';
import { join } from 'path';
import { pathToFileURL } from 'url';
import { build as esbuild } from 'esbuild-wasm';
import { formatHelp, sh } from '../program/index.js';
import {
	buildParameters,
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
	npmMutationOptions,
	npmPublishCommand,
	npmUnpublishCommand,
} from './npm.js';
import { getPackageDeclarationEntryPoints } from './package.js';
import {
	enforceCoverageGate,
	generateTestFile,
	runBenchmarks,
} from './spec.js';
import type { Package } from './npm.js';
import { checkBranchClean, checkBranchUpToDate } from './git.js';
import { bundleDeclarations } from './tsc.js';
import * as ts from 'typescript';

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
		it.should('parse build options', a => {
			a.equal(buildOutputOptions(['test']).verbose, false);
			a.equal(buildOutputOptions(['test', '--verbose']).verbose, true);
			a.equal(
				buildOutputOptions(['test', '--grep', 'declaration bundle']).grep,
				'declaration bundle',
			);
		});

		it.should('exclude build options from targets', a => {
			a.equalValues(
				buildTargets(
					['test', '--verbose', '--grep', 'declaration bundle'],
					['test'],
				),
				[undefined, 'test'],
			);
		});

		it.should('generate build help', a => {
			a.equal(
				formatHelp(buildParameters),
				[
					'  -h, --help       Show help.',
					'  --verbose        Print detailed build output.',
					'  --grep <string>  Run only tests whose full name matches the pattern.',
				].join('\n'),
			);
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

	s.test('npm test integration', it => {
		it.should('forward focused test options', async a => {
			const output = await sh('npm test -- --grep parseArgv', {
				cwd: join(import.meta.dirname, '../../program'),
			});
			a.ok(output.includes('cli.js test --grep parseArgv'));
			a.ok(/tests: passed \([1-9]\d*\)/.test(output));
			a.ok(!output.includes('Unknown cli config'));
			a.ok(!output.includes('Unknown build'));
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

		it.should('pass when gate is one point below coverage', a => {
			enforceCoverageGate(coverage, { blocks: 74 });
			a.ok(true);
		});

		it.should('fail when gate is over one point below coverage', a => {
			a.throws(() => enforceCoverageGate(coverage, { blocks: 73.99 }), {
				message:
					'Coverage gate failed: blocks gate 73.99% is more than 1% below actual 75.00%',
			});
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

	s.test('declaration bundle', it => {
		it.should('bundle the internal public type graph', async a => {
			const dir = await mkdtemp(join(tmpdir(), 'cxl-build-dts-'));
			const packageDir = join(dir, 'package');
			const externalDir = join(dir, 'node_modules', 'external');
			const internalTypesDir = join(
				dir,
				'node_modules',
				'internal-types',
			);
			const aliasSourceDir = join(dir, 'alias-source');
			const aliasOutputDir = join(dir, 'alias-output');
			try {
				await mkdir(packageDir, { recursive: true });
				await mkdir(externalDir, { recursive: true });
				await mkdir(internalTypesDir, { recursive: true });
				await mkdir(aliasSourceDir, { recursive: true });
				await mkdir(aliasOutputDir, { recursive: true });
				const javascriptEntry = join(dir, 'index.ts');
				const javascriptDependency = join(dir, 'b.ts');
				await writeFile(
					javascriptEntry,
					"export { value as bundledValue } from './b.js';\n",
				);
				await writeFile(javascriptDependency, 'export const value = 42;\n');
				await esbuild({
					bundle: true,
					entryPoints: [javascriptEntry],
					format: 'esm',
					outfile: join(packageDir, 'index.js'),
					platform: 'node',
				});
				await rm(javascriptDependency);
				const bundled = await import(
					pathToFileURL(join(packageDir, 'index.js')).href
				);
				a.equal(bundled.bundledValue, 42);
				await writeFile(
					join(packageDir, 'index.d.ts'),
					`import type { Public as Imported } from './b.js';
import type * as Internal from './b.js';
import type { External } from 'external';
import Legacy from './legacy.js';
declare module './b.js' { interface Registry { augmented: true; } }
export { Public as Renamed } from './b.js';
export * from './cycle-a.js';
export interface Result { value: Imported; detail: Internal.Helpers.Detail; instance: Internal.PublicClass; registry: import('./b.js').Registry; legacy: Legacy.Options; hidden: import('internal-types').Hidden; aliased: import('alias/value.js').Aliased; external: External; }
export default function (): Imported;
`,
				);
				await writeFile(
					join(packageDir, 'b.d.ts'),
					`interface Private { source: 'b'; }
export interface Public extends Private { public: true; cycle?: import('./cycle-a.js').CycleA; }
export interface Registry { base: true; }
export namespace Helpers { interface Detail { detail: true; } }
export class PublicClass { value: Public; }
`,
				);
				await writeFile(
					join(packageDir, 'cycle-a.d.ts'),
					`import type { CycleB } from './cycle-b.js';
interface Private { source: 'a'; }
export interface CycleA { next?: CycleB; private: Private; }
export { CycleB as RenamedCycle } from './cycle-b.js';
`,
				);
				await writeFile(
					join(packageDir, 'cycle-b.d.ts'),
					`import type { CycleA } from './cycle-a.js';
interface Private { source: 'cycle-b'; }
export interface CycleB { next?: CycleA; private: Private; }
`,
				);
				await writeFile(
					join(packageDir, 'legacy.d.ts'),
					`declare function Legacy(): void;
declare namespace Legacy { interface Options { legacy: true; } }
export = Legacy;
`,
				);
				await writeFile(
					join(externalDir, 'package.json'),
					JSON.stringify({ name: 'external', types: 'index.d.ts' }),
				);
				await writeFile(
					join(externalDir, 'index.d.ts'),
					'export interface External { external: true; }\n',
				);
				await writeFile(
					join(internalTypesDir, 'package.json'),
					JSON.stringify({
						name: 'internal-types',
						types: 'index.d.ts',
					}),
				);
				await writeFile(
					join(internalTypesDir, 'index.d.ts'),
					'export interface Hidden { hidden: true; }\n',
				);
				await writeFile(
					join(dir, 'tsconfig.json'),
					JSON.stringify({
						compilerOptions: {
							allowSyntheticDefaultImports: true,
							module: 'esnext',
							moduleResolution: 'node',
							paths: { 'alias/*': ['./alias-source/*'] },
						},
						files: [],
						references: [{ path: './alias-source' }],
					}),
				);
				await writeFile(
					join(aliasSourceDir, 'tsconfig.json'),
					JSON.stringify({
						compilerOptions: {
							composite: true,
							declaration: true,
							module: 'esnext',
							moduleResolution: 'node',
							outDir: '../alias-output',
						},
						files: ['value.ts'],
					}),
				);
				await writeFile(
					join(aliasSourceDir, 'value.ts'),
					'export interface Aliased { aliased: true; }\n',
				);
				await writeFile(
					join(aliasOutputDir, 'value.d.ts'),
					'export interface Aliased { aliased: true; }\n',
				);

				const entry = join(packageDir, 'index.d.ts');
				await writeFile(
					entry,
					bundleDeclarations(
						entry,
						['external'],
						join(dir, 'tsconfig.json'),
					),
				);
				await rm(internalTypesDir, { recursive: true });
				await rm(aliasSourceDir, { recursive: true });
				await rm(aliasOutputDir, { recursive: true });
				await rm(join(packageDir, 'b.d.ts'));
				await rm(join(packageDir, 'cycle-a.d.ts'));
				await rm(join(packageDir, 'cycle-b.d.ts'));
				await rm(join(packageDir, 'legacy.d.ts'));
				const consumer = join(dir, 'consumer.ts');
				await writeFile(
					consumer,
					`import create, { type Result, type Renamed, type CycleA, type RenamedCycle } from './package/index.js';
type IsAny<T> = 0 extends 1 & T ? true : false;
type AssertNotAny<T extends false> = T;
type Assert<T extends true> = T;
type Equal<A, B> = (<T>() => T extends A ? 1 : 2) extends <T>() => T extends B ? 1 : 2 ? true : false;
declare const result: Result;
const renamed: Renamed = create();
const cycle: CycleA | RenamedCycle = {} as CycleA;
type ResultTypesStayTyped = AssertNotAny<IsAny<Result[keyof Result]>>;
type ImportedTypeStaysTyped = Assert<Equal<typeof result.value['public'], true>>;
type NamespaceTypeStaysTyped = Assert<Equal<typeof result.detail['detail'], true>>;
type ClassTypeStaysTyped = Assert<Equal<typeof result.instance.value['public'], true>>;
type AugmentationStaysTyped = Assert<Equal<typeof result.registry['augmented'], true>>;
type ExportEqualsStaysTyped = Assert<Equal<typeof result.legacy['legacy'], true>>;
type PackageImportStaysTyped = Assert<Equal<typeof result.hidden['hidden'], true>>;
type PathAliasStaysTyped = Assert<Equal<typeof result.aliased['aliased'], true>>;
type ExternalImportStaysTyped = Assert<Equal<typeof result.external['external'], true>>;
type RenamedExportStaysTyped = Assert<Equal<typeof renamed['source'], 'b'>>;
type CycleStaysTyped = Assert<Equal<CycleA['private']['source'], 'a'>>;
void renamed;
void cycle;
void result;
`,
				);
				const program = ts.createProgram([consumer], {
					module: ts.ModuleKind.ESNext,
					moduleResolution: ts.ModuleResolutionKind.Node10,
					noEmit: true,
					strict: true,
					skipLibCheck: false,
				});
				a.equalValues(
					ts.getPreEmitDiagnostics(program).map(diagnostic =>
						ts.flattenDiagnosticMessageText(
							diagnostic.messageText,
							'\n',
						),
					),
					[],
				);
				const emptyEntry = join(packageDir, 'empty.d.ts');
				await writeFile(emptyEntry, '');
				a.equal(
					bundleDeclarations(emptyEntry, []).trim(),
					'export {};',
				);
			} finally {
				await rm(dir, { recursive: true, force: true });
			}
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

		it.should('derive declarations only for public package entries', a => {
			a.equalValues(
				getPackageDeclarationEntryPoints('/dist/pkg', {
					...pkg,
						exports: {
						'.': './index.js',
						'./*.js': './*.js',
						'./worker.js': './worker.mjs',
					},
				}, [
					'/dist/pkg/index.d.ts',
					'/dist/pkg/cli.d.ts',
					'/dist/pkg/feature/editor.d.ts',
					'/dist/pkg/worker.d.mts',
				]),
				[
					{ in: '/dist/pkg/index.d.ts', out: 'index.d.ts' },
					{ in: '/dist/pkg/cli.d.ts', out: 'cli.d.ts' },
					{
						in: '/dist/pkg/feature/editor.d.ts',
						out: 'feature/editor.d.ts',
					},
					{ in: '/dist/pkg/worker.d.mts', out: 'worker.d.mts' },
				],
			);
			a.equalValues(getPackageDeclarationEntryPoints('/dist/pkg', pkg), [
				{ in: '/dist/pkg/index.d.ts', out: 'index.d.ts' },
			]);
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

		it.should('only inherit output in verbose mode', a => {
			a.equalValues(npmMutationOptions(false, '/package'), {
				cwd: '/package',
			});
			a.equalValues(npmMutationOptions(true, '/package'), {
				cwd: '/package',
				stdio: 'inherit',
			});
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
