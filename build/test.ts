import { spec, TestApi } from '../spec/index.js';
import {
	mkdir,
	mkdtemp,
	readFile,
	readdir,
	rm,
	writeFile,
} from 'fs/promises';
import { tmpdir } from 'os';
import { join } from 'path';
import { pathToFileURL } from 'url';
import { execFile, execFileSync } from 'child_process';
import { build as esbuild } from 'esbuild-wasm';
import { ESLint } from 'eslint';
import { formatHelp, sh } from '../program/index.js';
import {
	buildParameters,
	buildOutputOptions,
	buildTargets,
	exec,
	formatArtifactSummary,
	formatBuildError,
	formatTargetArtifactSummary,
	type Output,
} from './builder.js';
import {
	getPackageBuildOptions,
	npmDistTagCommand,
	npmMutationOptions,
	npmPublishCommand,
	npmUnpublishCommand,
} from './npm.js';
import {
	getPackageDeclarationEntryPoints,
	getPackageEntryPoints,
} from './package.js';
import {
	enforceCoverageGate,
	generateTestFile,
	runBenchmarks,
} from './spec.js';
import type { Package } from './npm.js';
import { checkBranchClean, checkBranchUpToDate } from './git.js';
import { requiredRootCompilerOptions } from './audit.js';
import { bundleDeclarations } from './tsc.js';
import { file } from './file.js';
import { specConfig } from './eslint-config.js';
import { rx } from './index.js';
import { cachedBuild } from './cache.js';
import * as ts from 'typescript';

async function errorMessage(fn: () => Promise<unknown>) {
	try {
		await fn();
	} catch (e) {
		return e instanceof Error ? e.message : String(e);
	}
	throw new Error('Expected operation to fail');
}

async function lintSpecFixture(source: string) {
	const dir = await mkdtemp(join(tmpdir(), 'cxl-build-eslint-'));
	try {
		const project = join(dir, 'tsconfig.json');
		await writeFile(
			project,
			JSON.stringify({
				compilerOptions: {
					module: 'NodeNext',
					moduleResolution: 'NodeNext',
					strict: true,
				},
				files: ['test.ts'],
			}),
		);
		await writeFile(
			join(dir, 'test.ts'),
			`import { spec } from ${JSON.stringify(join(import.meta.dirname, '../spec/index.js'))};
${source}`,
		);

		const eslint = new ESLint({
			baseConfig: specConfig,
			cwd: dir,
			overrideConfig: {
				languageOptions: { parserOptions: { project } },
			},
			overrideConfigFile: true,
		});
		const [result] = await eslint.lintFiles(['test.ts']);
		return result?.messages ?? [];
	} finally {
		await rm(dir, { recursive: true, force: true });
	}
}

async function createAuditFixture(
	rootTsconfig: object = {
		compilerOptions: requiredRootCompilerOptions,
		files: [],
	},
) {
	const dir = await mkdtemp(join(tmpdir(), 'cxl-build-audit-'));
	const packageDir = join(dir, 'pkg');
	await mkdir(packageDir);
	await writeFile(
		join(dir, 'package.json'),
		JSON.stringify({
			homepage: 'https://example.com/docs/',
			bugs: 'https://example.com/issues',
		}),
	);
	await writeFile(join(dir, 'tsconfig.json'), JSON.stringify(rootTsconfig));
	await writeFile(
		join(packageDir, 'package.json'),
		JSON.stringify({
			name: '@test/pkg',
			version: '1.0.0',
			description: 'test package',
			license: 'GPL-3.0',
			homepage: 'https://example.com/docs/@test/pkg',
			bugs: 'https://example.com/issues',
			repository: {
				type: 'git',
				url: 'https://example.com/repo.git',
			},
			scripts: {
				build: 'cxl-build',
				publish: 'npm run build publish',
				test: 'npm run build -- test',
			},
		}),
	);
	await writeFile(
		join(packageDir, 'tsconfig.json'),
		JSON.stringify({
			extends: '../tsconfig.json',
			compilerOptions: { outDir: '../dist/pkg' },
		}),
	);
	await writeFile(
		join(packageDir, 'tsconfig.test.json'),
		JSON.stringify({ extends: './tsconfig.json' }),
	);
	await writeFile(join(packageDir, 'test.ts'), '');
	return { dir, packageDir };
}

function auditCommand(packageDir: string) {
	const script = `process.chdir(${JSON.stringify(packageDir)}); await import(${JSON.stringify(pathToFileURL(join(import.meta.dirname, 'audit.js')).href)}).then(module => module.audit())`;
	return [process.execPath, ['--input-type=module', '--eval', script]] as const;
}

export default spec('build', s => {
	s.test('eslint config', it => {
		it.should('ban direct returns from spec tests', async a => {
			const messages = await lintSpecFixture(`export default spec('fixture', s => {
	s.test('direct return', a => {
		if (!a) return;
	});
	s.test('nested return', () => {
		const nested = () => {
			return true;
		};
		nested();
		function declared() {
			return true;
		}
		declared();
	});
});
`);
			a.equal(messages.length, 1);
			a.equal(messages[0]?.ruleId, 'local/no-return-in-spec');
		});

		it.should('ban real timers from spec tests', async a => {
			const messages = await lintSpecFixture(`export default spec('fixture', s => {
	s.test('real timers', () => {
		setTimeout(() => undefined, 1);
		function nested() {
			setInterval(() => undefined, 1);
		}
		nested();
		globalThis.setTimeout(() => undefined, 1);
		requestAnimationFrame(() => undefined);
	});
	s.test('virtual timers', a => {
		a.mockSetTimeout();
		setTimeout(() => undefined, 1);
		globalThis.setTimeout(() => undefined, 1);
		a.mockSetInterval();
		setInterval(() => undefined, 1);
		a.mockRequestAnimationFrame();
		requestAnimationFrame(() => undefined);
		a.setTimeout(1000);
	});
	s.test('wrong virtual timer', a => {
		a.mockSetTimeout();
		setInterval(() => undefined, 1);
	});
});
`);
			a.equalValues(
				messages.map(message => message.ruleId),
				[
					'local/no-real-timers-in-spec',
					'local/no-real-timers-in-spec',
					'local/no-real-timers-in-spec',
					'local/no-real-timers-in-spec',
					'local/no-real-timers-in-spec',
				],
			);
		});
	});

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

		it.should('run audit before the default build target', a => {
			a.equalValues(buildTargets(['audit'], ['audit']), ['audit', undefined]);
			a.equalValues(buildTargets(['test', 'audit'], ['test', 'audit']), [
				'audit',
				undefined,
				'test',
			]);
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

	s.test('audit output', it => {
		it.should('report applied fixes in quiet mode', async a => {
			const { dir, packageDir } = await createAuditFixture();
			try {
				const [command, args] = auditCommand(packageDir);
				const output = execFileSync(
					command,
					args,
					{ encoding: 'utf8' },
				);

				a.equal(
					output.trim(),
					[
						'audit fixed: pkg/package',
						'pkg/package: fixed: Only "build" and "test" scripts allowed in package.json',
						'pkg/package: fixed: Package "type" must be "module".',
					].join('\n'),
				);
				const pkg = JSON.parse(
					await readFile(join(packageDir, 'package.json'), 'utf8'),
				) as Package;
				a.equal(Object.keys(pkg.scripts ?? {}).join(','), 'build,test');
			} finally {
				await rm(dir, { recursive: true, force: true });
			}
		});

		it.should('require the root tsconfig not to extend another config', async a => {
			const { dir, packageDir } = await createAuditFixture({
				extends: './other.json',
				compilerOptions: {
					target: 'es2022',
					...requiredRootCompilerOptions,
				},
				files: [],
			});
			try {
				const [command, args] = auditCommand(packageDir);
				execFileSync(command, args);
				const rootTsconfig = JSON.parse(
					await readFile(join(dir, 'tsconfig.json'), 'utf8'),
				) as { extends?: string; compilerOptions?: { target?: string } };
				a.equal(rootTsconfig.extends, undefined);
				a.equal(rootTsconfig.compilerOptions?.target, 'es2022');
			} finally {
				await rm(dir, { recursive: true, force: true });
			}
		});

		it.should('require canonical root compiler options', async a => {
			const { dir, packageDir } = await createAuditFixture({
				compilerOptions: {
					strict: false,
					module: 'esnext',
					types: ['node'],
					target: 'es2022',
				},
			});
			try {
				const [command, args] = auditCommand(packageDir);
				execFileSync(command, args);
				const rootTsconfig = JSON.parse(
					await readFile(join(dir, 'tsconfig.json'), 'utf8'),
				) as { compilerOptions?: Record<string, unknown> };
				a.equalValues(rootTsconfig.compilerOptions, {
					target: 'es2022',
					...requiredRootCompilerOptions,
				});
			} finally {
				await rm(dir, { recursive: true, force: true });
			}
		});

		it.should('require package tsconfig inheritance', async a => {
			const { dir, packageDir } = await createAuditFixture();
			try {
				await writeFile(
					join(packageDir, 'tsconfig.json'),
					JSON.stringify({
						extends: './other.json',
						compilerOptions: {
							outDir: './wrong',
							strict: false,
							module: 'esnext',
							types: ['node'],
							lib: ['dom'],
						},
						files: ['index.ts'],
					}),
				);
				const [command, args] = auditCommand(packageDir);
				execFileSync(command, args);
				const tsconfig = JSON.parse(
					await readFile(join(packageDir, 'tsconfig.json'), 'utf8'),
				) as {
					extends?: string;
					compilerOptions?: Record<string, unknown>;
					files?: string[];
				};
				a.equal(tsconfig.extends, '../tsconfig.json');
				a.equalValues(tsconfig.compilerOptions, {
					outDir: '../dist/pkg',
					types: ['node'],
					lib: ['dom'],
				});
				a.equalValues(tsconfig.files, ['index.ts']);
			} finally {
				await rm(dir, { recursive: true, force: true });
			}
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

	s.test('file', it => {
		it.should('copy a filesystem file', async a => {
			const dir = await mkdtemp(join(tmpdir(), 'cxl-build-file-'));
			try {
				const sourcePath = join(dir, 'source.txt');
				await writeFile(sourcePath, 'source content');
				const output = await file(sourcePath, 'copy.txt');
				a.equal(output?.path, 'copy.txt');
				a.equal(output?.source.toString(), 'source content');
				const defaultOutput = await file(sourcePath);
				a.equal(defaultOutput?.path, sourcePath);
				a.equal(defaultOutput?.source.toString(), 'source content');
			} finally {
				await rm(dir, { recursive: true, force: true });
			}
		});

		it.should('generate a string', async a => {
			const outputs: Output[] = [];
			await file(() => 'generated content', 'generated.txt').tap(output =>
				outputs.push(output),
			);
			a.equal(outputs.length, 1);
			a.equal(outputs[0]?.path, 'generated.txt');
			a.equal(outputs[0]?.source.toString(), 'generated content');
			a.ok(Buffer.isBuffer(outputs[0]?.source));
		});

		it.should('generate a Buffer', async a => {
			const source = Buffer.from([1, 2, 3]);
			const output = await file(() => source, 'generated.bin');
			a.equal(output?.path, 'generated.bin');
			a.equal(output?.source, source);
		});

		it.should('generate asynchronously', async a => {
			const output = await file(
				async () => Promise.resolve('async content'),
				'generated.json',
			);
			a.equal(output?.path, 'generated.json');
			a.equal(output?.source.toString(), 'async content');
		});

		it.should('defer generation until each subscription', async a => {
			let calls = 0;
			const task = file(() => String(++calls), 'lazy.txt');
			a.equal(calls, 0);
			a.equal((await task)?.source.toString(), '1');
			a.equal((await task)?.source.toString(), '2');
		});

		it.should('propagate generator errors', async a => {
			a.equal(
				await errorMessage(async () => {
					await file(() => {
						throw new Error('sync failure');
					}, 'sync.txt');
				}),
				'sync failure',
			);
			a.equal(
				await errorMessage(async () => {
					await file(
						() => Promise.reject(new Error('async failure')),
						'async.txt',
					);
				}),
				'async failure',
			);
		});

		it.should('compose tasks with the exported rx namespace', async a => {
			const outputs: Output[] = [];
			await rx
				.concat(
					file(() => 'first', 'first.txt'),
					rx.of({
						path: 'second.txt',
						source: Buffer.from('second'),
					}),
					rx.EMPTY,
				)
				.tap(output => outputs.push(output));
			a.equalValues(
				outputs.map(output => output.path),
				['first.txt', 'second.txt'],
			);
		});
	});

	s.test('build cache', it => {
		it.should('reuse outputs until inputs change or outputs disappear', async a => {
			const dir = await mkdtemp(join(tmpdir(), 'cxl-build-cache-'));
			try {
				const input = join(dir, 'input.js');
				const outputDir = join(dir, 'package');
				const output = join(outputDir, 'index.js');
				const options = {
					manifest: join(dir, 'cache.json'),
					inputs: [input],
					key: JSON.stringify({ recipe: 1 }),
					outputDir,
				};
				let builds = 0;
				const run = () =>
					cachedBuild(options, async () => {
						builds++;
						await mkdir(outputDir, { recursive: true });
						await writeFile(output, String(builds));
						return [output];
					});

				await writeFile(input, 'first');
				a.ok(await run());
				a.ok(!(await run()));
				a.equal(builds, 1);

				await writeFile(input, 'second');
				a.ok(await run());
				await rm(output);
				a.ok(await run());
				options.key = JSON.stringify({ recipe: 2 });
				a.ok(await run());
				a.equal(builds, 4);
			} finally {
				await rm(dir, { recursive: true, force: true });
			}
		});

		it.should('not update the manifest when a build fails', async a => {
			const dir = await mkdtemp(join(tmpdir(), 'cxl-build-cache-'));
			try {
				const input = join(dir, 'input.js');
				const outputDir = join(dir, 'package');
				const output = join(outputDir, 'index.js');
				const manifest = join(dir, 'cache.json');
				const options = {
					manifest,
					inputs: [input],
					key: JSON.stringify({ recipe: 1 }),
					outputDir,
				};
				await writeFile(input, 'first');
				await cachedBuild(options, async () => {
					await mkdir(outputDir, { recursive: true });
					await writeFile(output, 'first');
					return [output];
				});
				const previous = await readFile(manifest, 'utf8');

				await writeFile(input, 'second');
				a.equal(
					await errorMessage(() =>
						cachedBuild(options, async () => {
							throw new Error('failed');
						}),
					),
					'failed',
				);
				a.equal(await readFile(manifest, 'utf8'), previous);
			} finally {
				await rm(dir, { recursive: true, force: true });
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
		it.should('expose generated files as the public Task type', async a => {
			const dir = await mkdtemp(join(tmpdir(), 'cxl-build-consumer-'));
			try {
				const consumer = join(dir, 'consumer.ts');
				const packageDir = join(dir, 'package');
				const entry = join(dir, 'index.d.ts');
				const rxEntry = join(dir, 'rx.d.ts');
				await mkdir(packageDir);
				await writeFile(
					rxEntry,
					`export { Observable, concat, of, EMPTY } from ${JSON.stringify(join(import.meta.dirname, '../rx/index.js'))};
`,
				);
				await writeFile(
					entry,
					`export * from ${JSON.stringify(join(import.meta.dirname, 'file.js'))};
export { type Output, type Task } from ${JSON.stringify(join(import.meta.dirname, 'builder.js'))};
export * as rx from './rx.js';
`,
				);
				await writeFile(
					consumer,
					`import { file, rx, type Output, type Task } from '@cxl/build';
const generated: Task = file(async () => 'content', 'generated.txt');
generated.subscribe((output: Output) => output.source.toString());
const composed: Task = rx.concat(
	generated,
	rx.of({ path: 'other.txt', source: Buffer.from('other') }),
	rx.EMPTY,
);
void composed;
`,
				);
				const declarationPath = join(packageDir, 'index.d.ts');
				await writeFile(
					declarationPath,
					await bundleDeclarations(entry, []),
				);
				const declaration = await readFile(declarationPath, 'utf8');
				const sourceFile = ts.createSourceFile(
					declarationPath,
					declaration,
					ts.ScriptTarget.Latest,
					true,
					ts.ScriptKind.TS,
				);
				const fileDeclarations = sourceFile.statements.filter(
					(statement): statement is ts.FunctionDeclaration =>
						ts.isFunctionDeclaration(statement) &&
						statement.name?.text === 'file',
				);
				a.equal(fileDeclarations.length, 2);
				for (const statement of fileDeclarations) {
					a.equal(statement.type?.getText(sourceFile), 'Task');
					const text = statement.getText(sourceFile);
					a.ok(!text.includes('Observable'));
					a.ok(!text.includes('__subscribe'));
				}
				const program = ts.createProgram([consumer], {
					lib: ['lib.es2023.d.ts'],
					module: ts.ModuleKind.ESNext,
					moduleResolution: ts.ModuleResolutionKind.Bundler,
					noEmit: true,
					paths: { '@cxl/build': [declarationPath] },
					skipLibCheck: false,
					strict: true,
					types: ['node'],
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
			} finally {
				await rm(dir, { recursive: true, force: true });
			}
		});

		it.test('internal public type graph', async graph => {
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
			graph.afterAll(() => rm(dir, { recursive: true, force: true }));
			{
				await mkdir(packageDir, { recursive: true });
				await mkdir(externalDir, { recursive: true });
				await mkdir(internalTypesDir, { recursive: true });
				await mkdir(aliasSourceDir, { recursive: true });
				await mkdir(aliasOutputDir, { recursive: true });
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
							moduleResolution: 'bundler',
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
							moduleResolution: 'bundler',
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

				graph.test('bundles internal types', async bundled => {
				const entry = join(packageDir, 'index.d.ts');
				await writeFile(
					entry,
					await bundleDeclarations(
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
				bundled.test('preserves public types', async a => {
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
						lib: ['lib.es2023.d.ts'],
						module: ts.ModuleKind.ESNext,
						moduleResolution: ts.ModuleResolutionKind.Bundler,
						noEmit: true,
						strict: true,
						skipLibCheck: false,
						types: ['node'],
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
					a.test('handles empty declarations', async a => {
						const emptyEntry = join(packageDir, 'empty.d.ts');
						await writeFile(emptyEntry, '');
						a.equal(
							(await bundleDeclarations(emptyEntry, [])).trim(),
							'export {};',
						);
					});
				});
			});
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

		it.should('package wildcard entries only from project outputs', async a => {
			const dir = await mkdtemp(join(tmpdir(), 'cxl-build-package-'));
			const outputDir = join(dir, 'dist');
			const packageDir = join(outputDir, 'package');
			try {
				await mkdir(outputDir);
				const index = join(outputDir, 'index.js');
				const button = join(outputDir, 'button.js');
				await writeFile(index, 'export const index = true;');
				await writeFile(button, 'export const button = true;');
				await writeFile(
					join(outputDir, 'test.js'),
					'export const test = true;',
				);
				await esbuild({
					bundle: true,
					entryPoints: getPackageEntryPoints(outputDir, {
						...pkg,
						exports: {
							'.': './index.js',
							'./*.js': './*.js',
						},
					}, [index, button]),
					format: 'esm',
					outdir: packageDir,
				});
				a.equalValues((await readdir(packageDir)).sort(), [
					'button.js',
					'index.js',
				]);
			} finally {
				await rm(dir, { recursive: true, force: true });
			}
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
		it.test('repository verification', async checks => {
			const baseDir = await mkdtemp(join(tmpdir(), 'cxl-build-git-'));
			const remoteDir = join(baseDir, 'remote.git');
			const dir = join(baseDir, 'project');
			const otherDir = join(baseDir, 'other');
			checks.afterAll(() =>
				rm(baseDir, { recursive: true, force: true }),
			);
			{
				await sh(`git init --bare ${remoteDir}`);
				await sh('git symbolic-ref HEAD refs/heads/main', {
					cwd: remoteDir,
				});
				checks.test('initializes a local repository', async local => {
					await sh(`git init -b main ${dir}`);
					await writeFile(join(dir, 'file.txt'), 'initial');
					await sh(
						'git add file.txt && git -c user.email=build@example.com -c user.name=Build commit -m initial',
						{ cwd: dir },
					);
					local.test('accepts synchronized repositories', async synchronized => {
						await sh(`git remote add origin ${remoteDir}`, { cwd: dir });
						await sh('git push -u origin main', { cwd: dir });

						await checkBranchClean('main', dir);
						await checkBranchUpToDate('main', dir);

						synchronized.test('rejects dirty repositories', async a => {
							await writeFile(join(dir, 'file.txt'), 'dirty');
							a.equal(
								await errorMessage(() => checkBranchClean('main', dir)),
								'Not a clean repository',
							);
							await sh('git checkout -- file.txt', { cwd: dir });
							a.test('rejects unsynchronized repositories', async a => {
								await sh(`git clone ${remoteDir} ${otherDir}`);
								await writeFile(join(otherDir, 'file.txt'), 'remote change');
								await sh(
									'git add file.txt && git -c user.email=build@example.com -c user.name=Build commit -m changed',
									{ cwd: otherDir },
								);
								await sh('git push origin main', { cwd: otherDir });
								a.equal(
									await errorMessage(() => checkBranchUpToDate('main', dir)),
									'Branch has not been merged with origin',
								);
							});
						});
					});
				});
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

	s.test('test target report', async a => {
		const rootDir = await mkdtemp(join(tmpdir(), 'cxl-build-test-'));
		const packageDir = join(rootDir, 'package');
		const outputDir = join(packageDir, 'dist');
		try {
			await mkdir(outputDir, { recursive: true });
			await writeFile(join(rootDir, 'package.json'), '{"name":"root"}');
			await writeFile(
				join(packageDir, 'package.json'),
				'{"name":"fixture","type":"module"}',
			);
			await writeFile(
				join(outputDir, 'test.js'),
				`import { spec } from ${JSON.stringify(pathToFileURL(join(import.meta.dirname, '../spec/index.js')).href)};
export default spec('fixture', s => s.test('passes', a => a.ok(true)));
`,
			);
			const options = {
				appId: 'fixture',
				outputDir,
				node: true,
				ignoreCoverage: true,
			};
			const script = `await import(${JSON.stringify(pathToFileURL(join(import.meta.dirname, 'spec.js')).href)}).then(module => module.runTests(${JSON.stringify(options)}))`;
			await new Promise<void>((resolve, reject) => {
				execFile(
					process.execPath,
					['--input-type=module', '--eval', script],
					{ cwd: packageDir },
					error => (error ? reject(error) : resolve()),
				);
			});
			const report = JSON.parse(
				await readFile(join(outputDir, 'test-report.json'), 'utf8'),
			) as { summary: { failureCount: number; testTotal: number } };
			a.equalValues(report.summary, { failureCount: 0, testTotal: 2 });
			const document = await readFile(
				join(outputDir, 'test-report.html'),
				'utf8',
			);
			a.ok(document.includes('Specification: fixture'));
			a.ok(document.includes('<c-page><c-layout'));
		} finally {
			await rm(rootDir, { recursive: true, force: true });
		}
	});
});
