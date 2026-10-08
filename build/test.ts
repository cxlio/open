import { spec, TestApi } from '@cxl/spec';
import {
	cp,
	mkdir,
	mkdtemp,
	readFile,
	readdir,
	rm,
	stat,
	symlink,
	writeFile,
} from 'fs/promises';
import { tmpdir } from 'os';
import { join, resolve } from 'path';
import { pathToFileURL } from 'url';
import { execFile } from 'child_process';
import { promisify } from 'util';
import { createHash } from 'crypto';
import { build as esbuild } from 'esbuild-wasm';
import { ESLint } from 'eslint';
import { formatHelp, sh } from '@cxl/program';
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
	getPackagePlatform,
	getPackageTestPlatform,
} from './package.js';
import {
	enforceCoverageGate,
	generateTestFile,
	runBenchmarks,
} from './spec.js';
import { getExpectedCoverageFiles } from './coverage.js';
import type { Package } from './npm.js';
import { checkBranchClean, checkBranchUpToDate } from './git.js';
import {
	audit,
	auditDependencies,
	requiredRootCompilerOptions,
	usedPackagesFromMetafile,
} from './audit.js';
import { bundleDeclarations, declarationProgram } from './tsc.js';
import { file } from './file.js';
import eslintConfig, { specConfig } from './eslint-config.js';
import { eslintTsconfig } from './lint.js';
import { getLintTsconfigs } from './library.js';
import { rx } from './index.js';
import { cachedBuild } from './cache.js';
import { registerImportMap } from '@cxl/spec-runner/importmap.js';
import * as ts from 'typescript';

const execFileAsync = promisify(execFile);

async function errorMessage(fn: () => Promise<unknown>) {
	try {
		await fn();
	} catch (e) {
		return e instanceof Error ? e.message : String(e);
	}
	throw new Error('Expected operation to fail');
}

function withWorkspaceImportMap(source: string) {
	const root = resolve(import.meta.dirname, '../..');
	const importMap = pathToFileURL(
		join(import.meta.dirname, '../spec-runner/importmap.js'),
	).href;
	const packageFile = join(root, 'package.json');
	return `const [{ registerImportMap }, { readFile }] = await Promise.all([
	import(${JSON.stringify(importMap)}),
	import('node:fs/promises'),
]);
const { importmap } = JSON.parse(await readFile(${JSON.stringify(packageFile)}, 'utf8'));
registerImportMap({ imports: importmap }, ${JSON.stringify(root)});
${source}`;
}

async function checkTypes(file: string, options: ts.CompilerOptions): Promise<string[]> {
	const compiler = pathToFileURL(resolve(import.meta.dirname, '../../node_modules/typescript/lib/typescript.js')).href;
	const { stdout } = await execFileAsync(process.execPath, ['--input-type=module', '--eval', `
import * as ts from ${JSON.stringify(compiler)};
const program = ts.createProgram([${JSON.stringify(file)}], ${JSON.stringify(options)});
process.stdout.write(JSON.stringify(ts.getPreEmitDiagnostics(program).map(diagnostic =>
	ts.flattenDiagnosticMessageText(diagnostic.messageText, '\\n')
)));
`]);
	return JSON.parse(stdout) as string[];
}

async function lintFixture(
	source: string,
	baseConfig = specConfig,
	fileName = 'test.ts',
	packageJson: object = {},
	lib = ['es2025'],
) {
	const dir = await mkdtemp(join(tmpdir(), 'cxl-build-eslint-'));
	try {
		await writeFile(join(dir, 'package.json'), JSON.stringify(packageJson));
		const project = join(dir, 'tsconfig.json');
		await writeFile(
			project,
			JSON.stringify({
				compilerOptions: {
					module: 'NodeNext',
					moduleResolution: 'NodeNext',
					strict: true,
					lib,
					types: [],
				},
				files: [fileName],
			}),
		);
		const sourceFile = join(dir, fileName);
		await mkdir(resolve(sourceFile, '..'), { recursive: true });
		await writeFile(
			sourceFile,
			`import { spec } from ${JSON.stringify(join(import.meta.dirname, '../spec/index.js'))};
${source}`,
		);

		const eslint = new ESLint({
			baseConfig,
			cwd: dir,
			overrideConfig: {
				languageOptions: {
					parserOptions: { project, projectService: false, jsDocParsingMode: 'none' },
				},
			},
			overrideConfigFile: true,
		});
		const [result] = await eslint.lintFiles([fileName]);
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
			build: { platform: 'neutral' },
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

async function runAudit(
	packageDir: string,
	operation: 'audit' | 'auditDependencies' = 'audit',
) {
	const output: string[] = [];
	const log = (message: string) => output.push(message);
	await (operation === 'audit'
		? audit(packageDir, log)
		: auditDependencies(packageDir, log));
	return output.join('\n');
}

const suite = spec({ name: 'build', serial: true }, () => {
	const checks = spec('checks', () => undefined);
	const s = new TestApi(checks);
	const integration = spec({ name: 'CLI integration', serial: true }, () => undefined);
	const cli = new TestApi(integration);
	cli.test('startup build script', async a => {
		const root = resolve(import.meta.dirname, '../..');
		const dir = await mkdtemp(join(tmpdir(), 'cxl-build-startup-'));
		const buildDir = join(dir, 'build');
		a.afterAll(() => rm(dir, { recursive: true, force: true }));
		await mkdir(buildDir);
		await mkdir(join(dir, 'runtime'));
		await mkdir(join(dir, 'spec-browser'));
		await symlink(join(root, 'node_modules'), join(dir, 'node_modules'), 'dir');
		await cp(join(root, 'build/build.sh'), join(buildDir, 'build.sh'));
		await symlink(join(root, 'build/bootstrap.mts'), join(buildDir, 'bootstrap.mts'));
		await writeFile(join(dir, 'package.json'), '{"type":"module"}');
		await writeFile(join(buildDir, 'package.json'), '{"type":"module"}');
		await writeFile(join(buildDir, 'license-test.md'), 'fixture license');
		await writeFile(join(buildDir, 'eslint-config.ts'), 'export default {};');
		await writeFile(join(buildDir, 'cli.ts'), `import { writeFileSync } from 'node:fs';
export async function runCli() {
writeFileSync('../dist/build/package.json', '{"type":"module"}');
console.log(JSON.stringify(process.argv.slice(2)));
}`);
		await writeFile(join(dir, 'runtime/index.ts'), 'export const value: number = 1;');
		await writeFile(join(dir, 'spec-browser/dependency.ts'), 'export const value = "first";');
		await writeFile(join(dir, 'spec-browser/index.ts'), 'export { value } from "./dependency.js";');
		const config = {
			compilerOptions: {
				composite: true,
				strict: true,
				module: 'nodenext',
				target: 'es2025',
				types: ['node'],
			},
		};
		await writeFile(join(dir, 'tsconfig.json'), JSON.stringify(config));
		await writeFile(join(buildDir, 'tsconfig.json'), JSON.stringify({
			extends: '../tsconfig.json',
			compilerOptions: { outDir: '../dist/build' },
			include: ['*.ts'],
			references: [{ path: '../runtime' }],
		}));
		await writeFile(join(dir, 'runtime/tsconfig.json'), JSON.stringify({
			extends: '../tsconfig.json',
			compilerOptions: { outDir: '../dist/runtime' },
			files: ['index.ts'],
		}));
		const run = (...args: string[]) => execFileAsync('sh', ['build.sh', ...args], {
			cwd: buildDir,
		});
		const outputs = [
			'dist/build/cli.js',
			'dist/build/cli.d.ts',
			'dist/runtime/index.js',
			'dist/build/spec-browser.js',
			'dist/build/license-test.md',
			'dist/build/package/license-test.md',
			'dist/build/package/eslint-config.js',
			'dist/build/package/spec-browser.js',
			'dist/build/package/3doc.js',
		].map(path => join(dir, path));
		const timestamps = () => Promise.all(outputs.map(async path => (await stat(path)).mtimeMs));
		a.test('cold build and CLI arguments', async a => {
			a.ok((await run('package', 'two words')).stdout.includes('["package","two words"]'));
			a.equal(await readFile(join(dir, 'dist/build/license-test.md'), 'utf8'), 'fixture license');
			const initial = await timestamps();
			a.test('reuse unchanged compiler, browser, and copied outputs', async a => {
				await run('package');
				a.equalValues(await timestamps(), initial);
				a.test('track referenced sources and transitive browser imports', async a => {
					await writeFile(join(dir, 'runtime/index.ts'), 'export const value: number = 2;');
					await writeFile(join(dir, 'spec-browser/dependency.ts'), 'export const value = "changed";');
					await writeFile(join(buildDir, 'license-test.md'), 'changed license');
					await run('package');
					a.ok((await readFile(join(dir, 'dist/runtime/index.js'), 'utf8')).includes('2'));
					a.ok((await readFile(join(dir, 'dist/build/package/spec-browser.js'), 'utf8')).includes('changed'));
					a.equal(await readFile(join(dir, 'dist/build/package/license-test.md'), 'utf8'), 'changed license');
					a.test('recover missing outputs', async a => {
						await rm(join(dir, 'dist/runtime/index.js'));
						await rm(join(dir, 'dist/build/spec-browser.js'));
						await rm(join(dir, 'dist/build/package/3doc.js'));
						await run('package');
						a.equal((await timestamps()).length, outputs.length);
						a.test('retry failed compilation after restoring the previous source', async a => {
							await writeFile(join(dir, 'runtime/index.ts'), 'export const value: number = "invalid";');
							a.ok((await errorMessage(() => run('package'))).includes('Command failed'));
							a.test('rebuild the restored source', async a => {
								await writeFile(join(dir, 'runtime/index.ts'), 'export const value: number = 2;');
								await run('package');
								a.ok((await readFile(join(dir, 'dist/runtime/index.js'), 'utf8')).includes('2'));
								a.test('track extended configs, added sources, and dependency lockfiles', async a => {
									await writeFile(join(dir, 'base.json'), '{"compilerOptions":{"declarationMap":true}}');
									await writeFile(join(dir, 'tsconfig.json'), JSON.stringify({ ...config, extends: './base.json' }));
									await writeFile(join(buildDir, 'added.ts'), 'export const added = true;');
									await run('package');
									await stat(join(dir, 'dist/build/added.js'));
									await stat(join(dir, 'dist/runtime/index.d.ts.map'));
									a.test('remove deleted sources and disabled declaration maps', async a => {
										await rm(join(buildDir, 'added.ts'));
										await writeFile(join(dir, 'base.json'), '{"compilerOptions":{"declarationMap":false}}');
										await run('package');
										a.ok((await errorMessage(() => stat(join(dir, 'dist/build/added.js')))).includes('ENOENT'));
										a.ok((await errorMessage(() => stat(join(dir, 'dist/runtime/index.d.ts.map')))).includes('ENOENT'));
										a.test('invalidate dependency changes and reuse concurrent warm builds', async a => {
											const before = await timestamps();
											await writeFile(join(dir, 'package-lock.json'), '{"lockfileVersion":3}');
											await run('package');
											a.ok((await timestamps())[0] !== before[0]);
											const warm = await timestamps();
											await Promise.all([run('package'), run('package')]);
											a.equalValues(await timestamps(), warm);
											a.test('reject missing license inputs', async a => {
												await rm(join(buildDir, 'license-test.md'));
												a.ok((await errorMessage(() => run('package'))).includes('Command failed'));
											});
										});
									});
								});
							});
						});
					});
				});
			});
		});
	});

	cli.test('ordinary CLI lint startup', async a => {
		const dir = await mkdtemp(join(tmpdir(), 'cxl-build-lint-startup-'));
		try {
			const hook = join(dir, 'imports.mjs');
			await writeFile(
				hook,
				`import { registerHooks } from 'node:module';
registerHooks({
	load(url, context, nextLoad) {
		if (url.includes('/eslint-plugin-sonarjs/')) console.log('SONARJS_LOADED');
		if (url.includes('/@cxl/3doc/')) console.log('3DOC_LOADED');
		return nextLoad(url, context);
	},
});`,
			);
			const { stdout: output } = await execFileAsync(
				process.execPath,
				['--import', hook, join(import.meta.dirname, 'cli.js')],
				{ cwd: resolve(import.meta.dirname, '../../rx'), encoding: 'utf8' },
			);
			a.ok(!output.includes('SONARJS_LOADED'));
			a.ok(!output.includes('3DOC_LOADED'));
		} finally {
			await rm(dir, { recursive: true, force: true });
		}
	});

	suite.addTest(spec({ name: 'batch CLI builds', serial: true }, async it => {
		const { dir, packageDir } = await createAuditFixture({
			compilerOptions: { ...requiredRootCompilerOptions, types: [] },
			files: [],
		});
		it.afterAll(() => rm(dir, { recursive: true, force: true }));
		await writeFile(join(packageDir, 'types.ts'), 'export interface Value { id: number }');
		await writeFile(
			join(packageDir, 'index.ts'),
			"import type { Value } from './types.js'; export const value: Value = { id: 1 };",
		);
		await writeFile(
			join(packageDir, 'tsconfig.json'),
			JSON.stringify({
				extends: '../tsconfig.json',
				compilerOptions: { outDir: '../dist/pkg' },
				files: ['index.ts', 'types.ts'],
			}),
		);
		await writeFile(
			join(packageDir, 'tsconfig.test.json'),
			JSON.stringify({
				extends: './tsconfig.json',
				include: ['test.ts'],
				references: [{ path: './tsconfig.json' }],
			}),
		);
		await symlink(resolve(import.meta.dirname, '../../node_modules'), join(dir, 'node_modules'), 'dir');
		const second = join(dir, 'second');
		await cp(packageDir, second, { recursive: true });
		await writeFile(join(second, 'index.ts'), "export const value = 'second';");
		await writeFile(
			join(second, 'package.json'),
			JSON.stringify({
				...JSON.parse(await readFile(join(packageDir, 'package.json'), 'utf8')) as Package,
				name: '@test/second',
				homepage: 'https://example.com/docs/@test/second',
			}),
		);
		const run = async (packages = 'pkg,second') => (await execFileAsync(
			process.execPath,
			[join(import.meta.dirname, 'cli.js'), 'package', '--packages', packages],
			{ cwd: dir, encoding: 'utf8' },
		)).stdout;
		it.should('build both packages', async it => {
			it.equal((await run()).match(/^package: /gm)?.length, 2);
			const firstOutput = join(dir, 'dist/pkg/package/index.js');
			const secondOutput = join(dir, 'dist/second/package/index.js');
			const firstSource = await readFile(firstOutput, 'utf8');
			const secondSource = await readFile(secondOutput, 'utf8');
			it.ok(firstSource.includes('id:1'));
			it.ok(secondSource.includes('second'));
			it.test('changed project types and sources', async a => {
				await writeFile(join(packageDir, 'types.ts'), 'export interface Value { id: string }');
				a.ok((await errorMessage(run)).includes('Typescript compilation failed'));
				a.test('build the corrected source', async a => {
					await writeFile(
						join(packageDir, 'index.ts'),
						"import type { Value } from './types.js'; export const value: Value = { id: 'changed' };",
					);
					await run();
					a.ok((await readFile(firstOutput, 'utf8')).includes('changed'));
					a.ok((await readFile(join(dir, 'dist/pkg/package/index.d.ts'), 'utf8')).includes('id: string'));
					a.test('configured lint projects and failure propagation', async a => {
						await writeFile(
							join(dir, 'package.json'),
							JSON.stringify({
								...JSON.parse(await readFile(join(dir, 'package.json'), 'utf8')) as Package,
								build: { lintTsconfigs: ['tsconfig.lint.json'] },
							}),
						);
						await writeFile(
							join(packageDir, 'tsconfig.lint.json'),
							JSON.stringify({ extends: './tsconfig.json', files: ['lint.ts'] }),
						);
						await writeFile(
							join(packageDir, 'lint.ts'),
							'export function choose(value: boolean) { if (value) { return 1; } else { return 1; } }',
						);
						await writeFile(join(second, 'index.ts'), "export const value = 'unbuilt';");
						a.ok((await errorMessage(run)).includes('sonarjs/no-all-duplicated-branches'));
						a.equal(await readFile(secondOutput, 'utf8'), secondSource);
					});
				});
			});
		});
	}));

	s.test('batch CLI rejects empty package directories', async a => {
		a.ok((await errorMessage(() => execFileAsync(
			process.execPath,
			[join(import.meta.dirname, 'cli.js'), '--packages', 'rx,'],
			{ cwd: resolve(import.meta.dirname, '../..'), encoding: 'utf8' },
		))).includes('Package directories must not be empty'));
	});

	suite.addTest(spec({ name: 'eslint config', serial: true }, it => {
		it.should(
			'ban and resolve imports across package boundaries',
			async (a: TestApi) => {
				const messages = await lintFixture(
					`import '../internal.js';
import '../../sibling/import.js';
export { value } from '../../sibling/export.js';
export * from '../../sibling/export-all.js';
void import('../../sibling/dynamic.js');
require('../../sibling/require.js');
void import('@cxl/sibling');`,
					specConfig,
					'source/test.ts',
				);
				const boundaryMessages = messages.filter(
					message =>
						message.ruleId === 'local/no-relative-package-imports',
				);
				a.equal(boundaryMessages.length, 5);

				const nodeMessages = await lintFixture(
					"import '../../sibling/import.js';",
					specConfig,
					'source/test.ts',
					{ build: { platform: 'node' } },
				);
				a.equal(
					nodeMessages.filter(
						message =>
							message.ruleId ===
							'local/no-relative-package-imports',
					).length,
					0,
				);

				const dir = await mkdtemp(
					join(tmpdir(), 'cxl-build-package-import-'),
				);
				const application = join(dir, 'dist/application/index.js');
				try {
					await mkdir(resolve(application, '..'), { recursive: true });
					await mkdir(join(dir, 'dist/sibling'), { recursive: true });
					await writeFile(join(dir, 'package.json'), '{"type":"module"}');
					await writeFile(
						join(dir, 'dist/sibling/index.js'),
						'export const value = true;',
					);
					await writeFile(
						application,
						ts.transpileModule(
							"import { value } from '@test/sibling'; export { value };",
							{ compilerOptions: { module: ts.ModuleKind.ESNext } },
						).outputText,
					);
					const hooks = registerImportMap(
						{ imports: { '@test/sibling': '/dist/sibling/index.js' } },
						dir,
					);
					try {
						const module: { value: boolean } = await import(
							pathToFileURL(application).href
						);
						a.equal(module.value, true);
						const pkg = {
							name: '@test/application',
							version: '1.0.0',
							private: true,
							bugs: '',
							repository: '',
							importmap: {
								'@test/sibling': '/dist/sibling/index.js',
							},
						} satisfies Package;
						const browser = await generateTestFile({
							appId: 'application',
							pkgJson: pkg,
							rootPkg: pkg,
						});
						a.assert(browser);
						a.ok(
							browser.source
								.toString()
								.includes(
									'"@test/sibling":"/dist/sibling/index.js"',
								),
						);
						await execFileAsync(
							process.execPath,
							[
								'--input-type=module',
								'--eval',
								`await import(${JSON.stringify(pathToFileURL(join(import.meta.dirname, 'cli.js')).href)})`,
							],
							{ cwd: dir },
						);
					} finally {
						hooks?.deregister();
					}
				} finally {
					await rm(dir, { recursive: true, force: true });
				}
			},
		);

		it.should('apply recommended rules to test files', async a => {
			const messages = await lintFixture(`export default spec('fixture', s => {
	s.test('empty block', () => {
		if (true) {}
	});
});`);
			const emptyBlocks = messages.filter(
				message => message.ruleId === 'no-empty',
			);
			a.equal(emptyBlocks.length, 1);
		});

		it.should('apply shared source rules to test files', async a => {
			const messages = await lintFixture(`type State = 'ready' | 'done' | never;
class Base {}
class Example extends Base {
	value = 1;
	static shared = 1;
	constructor() {
		super();
	}
}
Array.prototype.extra = () => undefined;
const present: string | undefined = 'value';
present!;
function identity<T = string>(value: T) {
	return value;
}
identity<string>('value');
function check(state: State) {
	switch (state) {
		case 'ready':
			return;
	}
}
void Example;
void check;
`);
			const expected = [
				'@typescript-eslint/member-ordering',
				'no-extend-native',
				'@typescript-eslint/no-useless-constructor',
				'@typescript-eslint/no-redundant-type-constituents',
				'@typescript-eslint/no-non-null-assertion',
				'@typescript-eslint/no-unnecessary-type-arguments',
				'@typescript-eslint/switch-exhaustiveness-check',
			].sort();
			a.equalValues(
				messages
					.map(message => message.ruleId ?? '')
					.filter(ruleId => expected.includes(ruleId))
					.sort(),
				expected,
			);
		});

		it.should(
			'exclude build-only rules and allow screenshot test timeouts',
			async a => {
				const messages = await lintFixture(
					`export default spec('fixture', s => {
	s.test('test-only patterns', a => {
		const unused = 1;
		const value = {} as object;
		a.ok(value);
		a.setTimeout(1000);
	});
});`,
					specConfig,
					'test-screenshot.ts',
				);
				a.equal(messages.length, 0);
			},
		);

		it.should('lint configured tsconfigs', async a => {
			const rootPkg = {
				name: '@test/root',
				version: '1.0.0',
				private: true,
				bugs: '',
				repository: '',
				build: {
					lintTsconfigs: [
						'tsconfig.server.json',
						'tsconfig.lint.json',
						'tsconfig.missing.json',
					],
				},
			} satisfies Package;
			const pkg = {
				...rootPkg,
				name: '@test/pkg',
				build: {
					tsconfigs: [
						'tsconfig.worker.json',
						'tsconfig.server.json',
					],
				},
			} satisfies Package;

			const dir = await mkdtemp(join(tmpdir(), 'cxl-build-eslint-project-'));
			try {
				const compilerOptions = {
					module: 'nodenext',
					moduleResolution: 'nodenext',
					strict: true,
					lib: ['es2025'],
					types: [],
				};
				for (const target of ['worker', 'server', 'lint']) {
					const tsconfig = join(dir, `tsconfig.${target}.json`);
					await writeFile(
						tsconfig,
						JSON.stringify({ compilerOptions, files: [`${target}.ts`] }),
					);
					await writeFile(join(dir, `${target}.ts`), 'Promise.resolve();');
					a.equal(
						await errorMessage(async () => {
							await eslintTsconfig(tsconfig);
						}),
						'eslint errors found.',
					);
				}
				const previousCwd = process.cwd();
				try {
					process.chdir(dir);
					a.equalValues(getLintTsconfigs(rootPkg, pkg), [
						'tsconfig.worker.json',
						'tsconfig.server.json',
						'tsconfig.lint.json',
					]);
				} finally {
					process.chdir(previousCwd);
				}
			} finally {
				await rm(dir, { recursive: true, force: true });
			}
		});

		it.should('reject undeclared properties added to existing objects', async a => {
			const source = `declare const port: MessagePort;
declare const worker: SharedWorker;
Object.assign(port, { errorTarget: worker });
interface Profile { name: string; age?: number }
declare const profile: Profile;
declare const extra: { enabled: boolean };
Object.assign(profile, { name: 'updated' }, extra);
Object.defineProperty(profile, 'enabled', { value: true });
Object.defineProperties(profile, { enabled: { value: true }, name: { value: 'updated' } });
const assign = Object.assign;
assign(profile, { ['enabled']: true });
const { defineProperty } = Object;
defineProperty(profile, 'enabled', { value: true });
declare const union: { name: string } | { age: number };
Object.assign(union, { name: 'updated' });
function generic<T extends Profile>(value: T) { Object.assign(value, { enabled: true }); }
declare const key: unique symbol;
Object.assign(profile, { [key]: true });
Object.defineProperty(profile, key, { value: true });
void generic;
Object.assign(profile, { name: 'updated', age: 1 });
Object.defineProperty(profile, 'age', { value: 1 });
Object.defineProperties(profile, { age: { value: 1 } });
const extended: Profile & { enabled: boolean } = Object.assign({}, profile, { enabled: true });
Object.assign(extended, { enabled: false });
declare const record: Record<string, number>;
Object.assign(record, { count: 1 });
declare const numeric: { [key: number]: string };
Object.assign(numeric, { 1: 'one' });
declare const pattern: { [key: \`data-\${string}\`]: number };
Object.assign(pattern, { 'data-count': 1 });
declare const symbolTarget: { [key]: boolean };
Object.assign(symbolTarget, { [key]: true });
Object.defineProperty(symbolTarget, key, { value: false });
declare const symbolRecord: { [key: symbol]: boolean };
Object.assign(symbolRecord, { [key]: true });
declare const commonUnion: { name: string; age: number } | { name: string };
Object.assign(commonUnion, { name: 'updated' });
function update<T extends Profile>(value: T) { Object.assign(value, { name: 'updated' }); }
declare const dynamic: string;
Object.defineProperty(profile, dynamic, { value: true });
function shadowed(Object: { assign(target: Profile, source: object): void }) { Object.assign(profile, { enabled: true }); }
void [update, shadowed];`;
			for (const config of [eslintConfig, specConfig]) {
				const messages = (await lintFixture(source, config, 'test.ts', {}, ['es2025', 'dom'])).filter(
					message => message.ruleId === 'local/no-undeclared-properties',
				);
				a.equalValues(
					messages.map(message => message.line),
					[4, 8, 9, 10, 12, 14, 16, 17, 19, 20],
				);
				a.ok(messages.every(message => message.severity === 2));
				a.equal(
					messages[0]?.message,
					'Property "errorTarget" is not declared on the target type. Create a new object with an explicit extended type instead.',
				);
			}
		});

		it.should('require Error promise rejection reasons', async a => {
			const messages = await lintFixture(
				`export const invalid = new Promise<void>((_, reject) => reject('failure'));
export const valid = new Promise<void>((_, reject) => reject(new Error('failure')));`,
				eslintConfig,
			);
			const rejectionMessages = messages.filter(
				message =>
					message.ruleId ===
					'@typescript-eslint/prefer-promise-reject-errors',
			);
			a.equal(rejectionMessages.length, 1);
			a.equal(rejectionMessages[0]?.line, 2);
		});

		it.should('require explicit discrimination for closed local types', async a => {
			const messages = await lintFixture(
				`interface Profile { name?: string }
declare const profile: Profile;
void ('name' in profile);
type Result = { value: string } | { error: Error };
declare const result: Result;
void ('value' in result);
interface Item { action?: string }
declare const item: Item;
void ('type' in item);
declare const unknownValue: unknown;
if (unknownValue && typeof unknownValue === 'object') void ('id' in unknownValue);
declare const objectValue: object;
void ('id' in objectValue);
function generic<T>(value: T) {
	if (value && typeof value === 'object') void ('id' in value);
}
declare const record: Record<string, unknown>;
void ('id' in record);
declare const error: Error;
void ('code' in error);
declare const key: string;
void (key in profile);
void generic;`,
				eslintConfig,
			);
			const discriminationMessages = messages.filter(
				message =>
					message.ruleId === 'local/prefer-type-discrimination',
			);
			a.equal(discriminationMessages.length, 3);
			a.equalValues(
				discriminationMessages.map(message => message.line),
				[4, 7, 10],
			);
			a.ok(discriminationMessages.every(message => message.severity === 2));
		});

		it.should('reject wrappers around a single type check', async a => {
			const messages = await lintFixture(
				`class Component {}
interface Target { open?: boolean }
function isComponent(target: Target): target is Component & Target { return target instanceof Component; }
const isString = (value: string | number) => typeof value === 'string';
const isArray = (value: unknown) => Array.isArray(value);
const isNotArray = (value: unknown) => !Array.isArray(value);
const hasName = (value: object) => 'name' in value;
const isNull = (value: string | null) => value === null;
declare function baseGuard(value: unknown): value is number;
const isNumber = (value: unknown) => baseGuard(value);
function isOpen(target: Target) { return target instanceof Component && target.open === true; }
function checked(target: Target) { const valid = true; return valid && target instanceof Component; }
declare const other: unknown;
const unrelated = (value: unknown) => other instanceof Component;
declare function booleanCheck(value: unknown): boolean;
const isBoolean = (value: unknown) => booleanCheck(value);
void [1].filter(value => typeof value === 'number');
const isWrapped = (value: unknown) => (Array.isArray(value));
void [isComponent, isString, isArray, isNotArray, hasName, isNull, isNumber, isOpen, checked, unrelated, isBoolean, isWrapped];`,
				eslintConfig,
			);
			const wrapperMessages = messages.filter(
				message => message.ruleId === 'local/no-trivial-type-guard',
			);
			a.equalValues(
				wrapperMessages.map(message => message.line),
				[4, 5, 6, 7, 8, 9, 11, 19],
			);
		});

		it.should('preserve guards whose declared narrowing differs from the check', async a => {
			const messages = await lintFixture(
				`type KeymapState = 'ready' | 'done';
function isKeymapState(value: string): value is KeymapState { return typeof value === 'string'; }
const isReady = (value: string | number): value is 'ready' => typeof value === 'string';
declare function baseGuard(value: unknown): value is string;
function isState(value: unknown): value is KeymapState { return baseGuard(value); }
class Component { name = '' }
class Button extends Component { disabled = false }
function isButton(value: object): value is Button { return value instanceof Component; }
function hasName(value: object): value is { name: string } { return 'name' in value; }
function isOther(value: string | number, other: string | number): value is string { return typeof other === 'string'; }
function isAnything(value: unknown): value is any { return typeof value === 'string'; }
const isStateExpression = function(value: string): value is KeymapState { return typeof value === 'string'; };
type Key = string & { readonly brand: unique symbol };
function isKey(value: string): value is Key { return typeof value === 'string'; }
void [isKeymapState, isReady, isState, isButton, hasName, isOther, isAnything, isStateExpression, isKey];`,
				eslintConfig,
			);
			a.equalValues(
				messages.filter(message => message.ruleId === 'local/no-trivial-type-guard'),
				[],
			);
		});

		it.should('distinguish nested any from exact predicate types', async a => {
			const messages = await lintFixture(
				`type Value = string | number;
type Box<T> = { value: T };
type AnyArray = any[];
declare function isBox(value: unknown): value is Box<any>;
declare function isTuple(value: unknown): value is [any];
declare function isNested(value: unknown): value is Box<any[]>;
declare function isCallable(value: unknown): value is (input: any) => any;
function isValues<T>(value: T): value is T & Value[] { return Array.isArray(value); }
const isStrings = (value: unknown): value is string[] => Array.isArray(value);
const isStringBox = function(value: unknown): value is { value: string } { return isBox(value); };
function isStringTuple(value: unknown): value is [string] { return isTuple(value); }
function isNestedStrings(value: unknown): value is Box<string[]> { return isNested(value); }
function isStringFunction(value: unknown): value is (input: string) => string { return isCallable(value); }
function isAnyArray<T>(value: T): value is T & AnyArray { return Array.isArray(value); }
function isAnyBox(value: unknown): value is Box<any> { return isBox(value); }
function isAnyTuple(value: unknown): value is [any] { return isTuple(value); }
function isAnyNested(value: unknown): value is Box<any[]> { return isNested(value); }
function isGenericArray<__NarrowedType>(value: __NarrowedType): value is __NarrowedType & any[] { return Array.isArray(value); }
function isAnyFunction(value: unknown): value is (input: any) => any { return isCallable(value); }
void [isValues, isStrings, isStringBox, isStringTuple, isNestedStrings, isStringFunction, isAnyArray, isAnyBox, isAnyTuple, isAnyNested, isGenericArray, isAnyFunction];`,
				eslintConfig,
			);
			a.equalValues(
				messages.filter(message => message.ruleId === 'local/no-trivial-type-guard').map(message => message.line),
				[15, 16, 17, 18, 19, 20],
			);
		});

		it.should('preserve class predicates with nested any', async a => {
			const messages = await lintFixture(
				`declare class HiddenBox<T> { private value: T; }
declare function isHidden(value: unknown): value is HiddenBox<any>;
function isStringHidden(value: unknown): value is HiddenBox<string> { return isHidden(value); }
function isAnyHidden(value: unknown): value is HiddenBox<any> { return isHidden(value); }
void [isStringHidden, isAnyHidden];`,
				eslintConfig,
			);
			a.equalValues(
				messages.filter(message => message.ruleId === 'local/no-trivial-type-guard').map(message => message.line),
				[5],
			);
		});

		it.should('reject guards whose declared narrowing matches the check', async a => {
			const messages = await lintFixture(
				`type Text = string;
function isText(value: string | number): value is Text { return typeof value === 'string'; }
const isReady = (value: 'ready' | number): value is 'ready' => typeof value === 'string';
declare function baseGuard(value: unknown): value is number;
function isNumber(value: unknown): value is number { return baseGuard(value); }
function isNotText(value: string | number): value is number { return !(typeof value === 'string'); }
type Result = { name: string } | { error: Error };
function hasName(value: Result): value is { name: string } { return 'name' in value; }
function isNonNull<T>(value: T): value is NonNullable<T> { return value != null; }
void [isText, isReady, isNumber, isNotText, hasName, isNonNull];`,
				eslintConfig,
			);
			a.equalValues(
				messages.filter(message => message.ruleId === 'local/no-trivial-type-guard').map(message => message.line),
				[3, 4, 6, 7, 9, 10],
			);
		});

		it.should('distinguish direct checks from predicate calls with added logic', async a => {
			const messages = await lintFixture(
				`class Component {}
const isComponent = (value: object) => (value) instanceof Component;
const isString = (value: string | number) => typeof (value) === 'string';
const hasName = (value: object) => 'name' in (value);
const isArray = (value: unknown) => Array.isArray((value));
const isNull = (value: string | null) => (value) === null;
declare function guard(value: unknown, enabled: boolean): value is number;
declare function enabled(): boolean;
const checked = (value: unknown) => guard(value, enabled());
void [isComponent, isString, hasName, isArray, isNull, checked];`,
				eslintConfig,
			);
			a.equalValues(
				messages.filter(message => message.ruleId === 'local/no-trivial-type-guard').map(message => message.line),
				[3, 4, 5, 6, 7],
			);
		});

		it.should('ban direct returns from spec tests', async a => {
			const messages = await lintFixture(`export default spec('fixture', s => {
	s.test('direct return', a => {
		return;
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

		it.should('ban real timers and custom test timeouts', async a => {
			const messages = await lintFixture(`export default spec('fixture', s => {
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
		const unrelated = { setTimeout() {} };
		unrelated.setTimeout();
	});
	s.test('wrong virtual timer', a => {
		a.mockSetTimeout();
		setInterval(() => undefined, 1);
	});
});
`, specConfig, 'test.ts', {}, ['es2025', 'dom']);
			a.equalValues(
				messages.map(message => message.ruleId),
				[
					'local/no-real-timers-in-spec',
					'local/no-real-timers-in-spec',
					'local/no-real-timers-in-spec',
					'local/no-real-timers-in-spec',
					'local/no-test-timeout-in-spec',
					'local/no-real-timers-in-spec',
				],
			);
		});

		it.should('ban timer helpers used by spec tests', async a => {
			const messages = await lintFixture(`const timeout = () =>
	new Promise<void>(resolve => setTimeout(resolve, 1));
const interval = () => setInterval(() => undefined, 1);
const indirect = () => timeout();
const unused = () => setTimeout(() => undefined, 1);
const frame = () => requestAnimationFrame(() => undefined);
declare const imported: () => void;

export default spec('fixture', s => {
	s.test('real timer helpers', async () => {
		await indirect();
		interval();
		frame();
		imported();
	});
	s.test('virtual timer helpers', async a => {
		a.mockSetTimeout();
		await timeout();
		a.mockSetInterval();
		interval();
	});
});
void unused;
`, specConfig, 'test.ts', {}, ['es2025', 'dom']);
			a.equalValues(
				messages.map(message => message.ruleId),
				[
					'local/no-real-timers-in-spec',
					'local/no-real-timers-in-spec',
				],
			);
		});
	}));

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
					'  -h, --help           Show help.',
					'  --verbose            Print detailed build output.',
					'  --grep <string>      Run only tests whose full name matches the pattern.',
					'  --packages <string>  Build comma-separated package directories in one process.',
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
		it.should('collect external packages from real bundle metadata', async a => {
			const dir = await mkdtemp(join(tmpdir(), 'cxl-build-metafile-'));
			try {
				await writeFile(join(dir, 'index.js'),
					"import '@scope/pkg/subpath'; import 'plain/subpath'; import 'node:fs'; import './local.js';");
				await writeFile(join(dir, 'local.js'), 'export {};');
				const result = await esbuild({
					absWorkingDir: dir,
					bundle: true,
					entryPoints: ['index.js'],
					external: ['@scope/pkg', 'plain'],
					metafile: true,
					outfile: 'out.js',
					platform: 'node',
					write: false,
				});
				a.equalValues([...usedPackagesFromMetafile(result.metafile)].sort(),
					['@scope/pkg', 'plain']);
			} finally {
				await rm(dir, { recursive: true, force: true });
			}
		});

		it.should('use supplied metadata without a standalone bundle', async a => {
			const { dir, packageDir } = await createAuditFixture();
			try {
				const packagePath = join(packageDir, 'package.json');
				const pkg = JSON.parse(await readFile(packagePath, 'utf8')) as Package;
				pkg.dependencies = { external: '1.0.0' };
				await writeFile(packagePath, JSON.stringify(pkg));
				const rootPath = join(dir, 'package.json');
				const root = JSON.parse(await readFile(rootPath, 'utf8')) as Package;
				root.devDependencies = { external: '1.0.0' };
				await writeFile(rootPath, JSON.stringify(root));
				const entry = join(packageDir, 'entry.js');
				await writeFile(entry, "import 'external';");
				const { metafile } = await esbuild({
					bundle: true,
					entryPoints: [entry],
					external: ['external'],
					metafile: true,
					write: false,
				});
				await auditDependencies(packageDir, () => {}, metafile);
				await mkdir(join(dir, 'dist', 'pkg'), { recursive: true });
				await writeFile(join(dir, 'dist', 'pkg', 'index.js'), "import 'external';");
				await auditDependencies(packageDir, () => {});
				a.ok(true);
			} finally {
				await rm(dir, { recursive: true, force: true });
			}
		});

		it.should('report applied fixes in quiet mode', async a => {
			const { dir, packageDir } = await createAuditFixture();
			try {
				const output = await runAudit(packageDir);

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

		it.should('separate dependency audit from pre-build audit', async a => {
			const { dir, packageDir } = await createAuditFixture();
			try {
				const packagePath = join(packageDir, 'package.json');
				const pkg = JSON.parse(
					await readFile(packagePath, 'utf8'),
				) as Package;
				pkg.peerDependencies = { external: '*' };
				await writeFile(packagePath, JSON.stringify(pkg));

				await runAudit(packageDir);

				const outputDir = join(dir, 'dist', 'pkg');
				await mkdir(outputDir, { recursive: true });
				await writeFile(join(outputDir, 'index.js'), "import 'external';");
				await runAudit(packageDir, 'auditDependencies');
				a.ok(true);
			} finally {
				await rm(dir, { recursive: true, force: true });
			}
		});

		it.should('require the root tsconfig not to extend another config', async a => {
			const { dir, packageDir } = await createAuditFixture({
				extends: './other.json',
				compilerOptions: requiredRootCompilerOptions,
				files: [],
			});
			try {
				await runAudit(packageDir);
				const rootTsconfig = JSON.parse(
					await readFile(join(dir, 'tsconfig.json'), 'utf8'),
				) as { extends?: string; compilerOptions?: { target?: string } };
				a.equal(rootTsconfig.extends, undefined);
				a.equal(rootTsconfig.compilerOptions?.target, 'es2025');
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
				await runAudit(packageDir);
				const rootTsconfig = JSON.parse(
					await readFile(join(dir, 'tsconfig.json'), 'utf8'),
				) as { compilerOptions?: Record<string, unknown> };
				a.equalValues(rootTsconfig.compilerOptions, {
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
							noFallthroughCasesInSwitch: false,
							types: ['node'],
							lib: ['dom'],
							skipLibCheck: false,
							sourceMap: true,
							libReplacement: true,
						},
						files: ['index.ts'],
					}),
				);
				await runAudit(packageDir);
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
					skipLibCheck: false,
					sourceMap: true,
					libReplacement: true,
				});
				a.equalValues(tsconfig.files, ['index.ts']);
			} finally {
				await rm(dir, { recursive: true, force: true });
			}
		});

		it.should('normalize package environment inheritance', async a => {
			const { dir, packageDir } = await createAuditFixture();
			try {
				const packagePath = join(packageDir, 'package.json');
				const pkg = JSON.parse(await readFile(packagePath, 'utf8')) as Package;
				pkg.build = { platform: 'node' };
				await writeFile(packagePath, JSON.stringify(pkg));
				await writeFile(
					join(packageDir, 'tsconfig.json'),
					JSON.stringify({
						extends: '../tsconfig.server.json',
						compilerOptions: { outDir: './wrong', types: ['node'] },
					}),
				);
				await runAudit(packageDir);
				const tsconfig = JSON.parse(
					await readFile(join(packageDir, 'tsconfig.json'), 'utf8'),
				) as { extends?: string; compilerOptions?: Record<string, unknown> };
				a.equal(tsconfig.extends, '../tsconfig.json');
				a.equalValues(tsconfig.compilerOptions, {
					outDir: '../dist/pkg',
					types: ['node'],
				});
			} finally {
				await rm(dir, { recursive: true, force: true });
			}
		});

		it.should('require a valid package build platform', async a => {
			const { dir, packageDir } = await createAuditFixture();
			try {
				const packagePath = join(packageDir, 'package.json');
				const pkg = JSON.parse(await readFile(packagePath, 'utf8')) as Package;
				pkg.build = { platform: 'invalid' } as unknown as Package['build'];
				await writeFile(packagePath, JSON.stringify(pkg));
				await runAudit(packageDir);
				const fixed = JSON.parse(
					await readFile(packagePath, 'utf8'),
				) as Package;
				a.equal(fixed.build?.platform, 'neutral');
			} finally {
				await rm(dir, { recursive: true, force: true });
			}
		});

		it.should('remove package tsconfig overrides', async a => {
			const { dir, packageDir } = await createAuditFixture();
			try {
				const packagePath = join(packageDir, 'package.json');
				const pkg = JSON.parse(await readFile(packagePath, 'utf8')) as Package;
				pkg.build = {
					platform: 'neutral',
					lintTsconfigs: ['tsconfig.lint.json'],
					tsconfigs: ['tsconfig.worker.json'],
				};
				await writeFile(packagePath, JSON.stringify(pkg));
				await runAudit(packageDir);
				const fixed = JSON.parse(
					await readFile(packagePath, 'utf8'),
				) as Package;
				a.equalValues(fixed.build, { platform: 'neutral' });
				a.ok(!(await readdir(packageDir)).includes('tsconfig.worker.json'));
			} finally {
				await rm(dir, { recursive: true, force: true });
			}
		});

		it.should('enforce browser tsconfig properties', async a => {
			const { dir, packageDir } = await createAuditFixture();
			try {
				const packagePath = join(packageDir, 'package.json');
				const pkg = JSON.parse(await readFile(packagePath, 'utf8')) as Package;
				pkg.browser = './index.bundle.js';
				pkg.build = { platform: 'browser' };
				await writeFile(packagePath, JSON.stringify(pkg));
				await runAudit(packageDir);
				const tsconfig = JSON.parse(
					await readFile(join(packageDir, 'tsconfig.json'), 'utf8'),
				) as { compilerOptions?: Record<string, unknown> };
				a.equalValues(tsconfig.compilerOptions?.lib, [
					'dom',
					'es2025',
					'dom.iterable',
				]);
			} finally {
				await rm(dir, { recursive: true, force: true });
			}
		});

		it.should('enforce node tsconfig properties', async a => {
			const { dir, packageDir } = await createAuditFixture();
			try {
				const packagePath = join(packageDir, 'package.json');
				const pkg = JSON.parse(await readFile(packagePath, 'utf8')) as Package;
				pkg.bin = './index.js';
				pkg.build = { platform: 'node' };
				await writeFile(packagePath, JSON.stringify(pkg));
				await runAudit(packageDir);
				const tsconfig = JSON.parse(
					await readFile(join(packageDir, 'tsconfig.json'), 'utf8'),
				) as { compilerOptions?: Record<string, unknown> };
				a.equalValues(tsconfig.compilerOptions?.types, ['node']);
			} finally {
				await rm(dir, { recursive: true, force: true });
			}
		});

		it.should('create a missing package tsconfig', async a => {
			const { dir, packageDir } = await createAuditFixture();
			try {
				await rm(join(packageDir, 'tsconfig.json'));
				await runAudit(packageDir);
				const tsconfig = JSON.parse(
					await readFile(join(packageDir, 'tsconfig.json'), 'utf8'),
				) as {
					extends?: string;
					compilerOptions?: Record<string, unknown>;
				};
				a.equal(tsconfig.extends, '../tsconfig.json');
				a.equal(tsconfig.compilerOptions?.outDir, '../dist/pkg');
			} finally {
				await rm(dir, { recursive: true, force: true });
			}
		});

		it.should('enforce root-configured worker tsconfig', async a => {
			const { dir, packageDir } = await createAuditFixture();
			try {
				const rootPackagePath = join(dir, 'package.json');
				const rootPkg = JSON.parse(
					await readFile(rootPackagePath, 'utf8'),
				) as Package;
				rootPkg.build = { tsconfigs: ['tsconfig.worker.json'] };
				await writeFile(rootPackagePath, JSON.stringify(rootPkg));
				await writeFile(join(packageDir, 'tsconfig.worker.json'), '{}');
				const packagePath = join(packageDir, 'package.json');
				const pkg = JSON.parse(await readFile(packagePath, 'utf8')) as Package;
				pkg.build = { platform: 'browser' };
				pkg.browser = './index.bundle.js';
				await writeFile(packagePath, JSON.stringify(pkg));
				await runAudit(packageDir);
				const tsconfig = JSON.parse(
					await readFile(join(packageDir, 'tsconfig.worker.json'), 'utf8'),
				) as {
					extends?: string;
					compilerOptions?: Record<string, unknown>;
				};
				a.equal(tsconfig.extends, '../tsconfig.json');
				a.equalValues(tsconfig.compilerOptions?.lib, [
					'es2025',
					'webworker',
					'webworker.asynciterable',
				]);
			} finally {
				await rm(dir, { recursive: true, force: true });
			}
		});

		it.should('preserve Cloudflare worker types without webworker libs', async a => {
			const { dir, packageDir } = await createAuditFixture();
			try {
				const packagePath = join(packageDir, 'package.json');
				const pkg = JSON.parse(await readFile(packagePath, 'utf8')) as Package;
				pkg.build = { platform: 'worker' };
				await writeFile(packagePath, JSON.stringify(pkg));
				await writeFile(
					join(packageDir, 'tsconfig.json'),
					JSON.stringify({
						extends: '../tsconfig.json',
						compilerOptions: {
							outDir: '../dist/pkg',
							types: ['@cloudflare/workers-types'],
						},
					}),
				);
				await runAudit(packageDir);
				const tsconfig = JSON.parse(
					await readFile(join(packageDir, 'tsconfig.json'), 'utf8'),
				) as { compilerOptions?: Record<string, unknown> };
				a.equalValues(tsconfig.compilerOptions?.types, [
					'@cloudflare/workers-types',
				]);
				a.equal(tsconfig.compilerOptions?.lib, undefined);
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
		it.should('reuse legacy fingerprints for missing inputs', async a => {
			const dir = await mkdtemp(join(tmpdir(), 'cxl-build-cache-'));
			try {
				const input = join(dir, 'missing.js');
				const output = join(dir, 'index.js');
				const manifest = join(dir, 'cache.json');
				const hash = createHash('sha256');
				for (const value of ['legacy', input, 'present', 'missing']) {
					hash.update(String(Buffer.byteLength(value)));
					hash.update(':');
					hash.update(value);
				}
				await writeFile(output, 'cached');
				await writeFile(manifest, JSON.stringify({
					fingerprint: hash.digest('hex'),
					inputs: [],
					outputs: ['index.js'],
				}));
				let builds = 0;
				a.ok(!(await cachedBuild({
					manifest,
					inputs: [input],
					key: 'legacy',
					outputDir: dir,
				}, async () => {
					builds++;
					await writeFile(output, 'rebuilt');
					return [output];
				})));
				a.equal(builds, 0);
				a.equal(await readFile(output, 'utf8'), 'cached');
			} finally {
				await rm(dir, { recursive: true, force: true });
			}
		});

		it.should('reuse metadata and rebuild when cached metadata is missing', async a => {
			const dir = await mkdtemp(join(tmpdir(), 'cxl-build-cache-'));
			try {
				const input = join(dir, 'input.js');
				const output = join(dir, 'package', 'index.js');
				const manifest = join(dir, 'cache.json');
				const seen: string[] = [];
				let builds = 0;
				await writeFile(input, 'export {};');
				const run = () => cachedBuild({
					manifest,
					inputs: [input],
					key: 'metadata',
					outputDir: join(dir, 'package'),
					metadata: {
						validate: (value: string | undefined): value is string =>
							typeof value === 'string',
						complete: value => seen.push(value),
					},
				}, async () => {
					builds++;
					await mkdir(join(dir, 'package'), { recursive: true });
					await writeFile(output, 'export {};');
					return { inputs: [], outputs: [output], metadata: `build-${builds}` };
				});
				a.ok(await run());
				a.ok(!(await run()));
				const stored = JSON.parse(await readFile(manifest, 'utf8')) as {
					metadata?: string;
				};
				delete stored.metadata;
				await writeFile(manifest, JSON.stringify(stored));
				a.ok(await run());
				a.equal(builds, 2);
				a.equalValues(seen, ['build-1', 'build-1', 'build-2']);
			} finally {
				await rm(dir, { recursive: true, force: true });
			}
		});

		it.should('invalidate outputs when discovered inputs change', async a => {
			const dir = await mkdtemp(join(tmpdir(), 'cxl-build-cache-'));
			try {
				const input = join(dir, 'input.js');
				const dependency = join(dir, 'dependency.js');
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
						const result = await esbuild({
							absWorkingDir: dir,
							bundle: true,
							entryPoints: ['input.js'],
							format: 'esm',
							metafile: true,
							outfile: 'package/index.js',
						});
						return {
							outputs: Object.keys(result.metafile.outputs).map(path =>
								resolve(dir, path),
							),
							inputs: Object.keys(result.metafile.inputs).map(path =>
								resolve(dir, path),
							),
						};
					});

				await writeFile(input, "export { value } from './dependency.js';");
				await writeFile(dependency, "export const value = 'first';");
				a.ok(await run());
				a.ok(!(await run()));
				await writeFile(dependency, "export const value = 'second';");
				a.ok(await run());
				a.ok((await readFile(output, 'utf8')).includes('second'));
				a.equal(builds, 2);
			} finally {
				await rm(dir, { recursive: true, force: true });
			}
		});

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
				const manifest = await readFile(options.manifest, 'utf8');
				await writeFile(
					options.manifest,
					manifest.replace('\n\t"inputs": [],', ''),
				);
				a.ok(await run());

				await writeFile(input, 'second');
				a.ok(await run());
				await rm(output);
				a.ok(await run());
				options.key = JSON.stringify({ recipe: 2 });
				a.ok(await run());
				a.equal(builds, 5);
			} finally {
				await rm(dir, { recursive: true, force: true });
			}
		});

		it.should('track missing inputs and retry after input read errors', async a => {
			const dir = await mkdtemp(join(tmpdir(), 'cxl-build-cache-'));
			try {
				const input = join(dir, 'input.js');
				const missing = join(dir, 'missing.js');
				const invalid = join(dir, 'invalid.js');
				const outputDir = join(dir, 'package');
				const output = join(outputDir, 'index.js');
				const options = {
					manifest: join(dir, 'cache.json'),
					inputs: [input, missing],
					key: 'missing-input',
					outputDir,
				};
				let builds = 0;
				const run = () => cachedBuild(options, async () => {
					await mkdir(outputDir, { recursive: true });
					await writeFile(output, String(++builds));
					return [output];
				});
				await writeFile(input, 'input');
				a.ok(await run());
				a.ok(!(await run()));
				await writeFile(missing, 'present');
				a.ok(await run());
				await rm(missing);
				a.ok(await run());
				await mkdir(invalid);
				options.inputs.push(invalid);
				a.ok((await errorMessage(run)).includes('EISDIR'));
				a.equal(builds, 3);
				a.equal(await readFile(output, 'utf8'), '3');
				await rm(invalid, { recursive: true });
				await writeFile(invalid, 'valid');
				a.ok(await run());
				a.ok(!(await run()));
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

	suite.addTest(spec({ name: 'coverage files', serial: true }, async a => {
		const rootDir = await mkdtemp(join(tmpdir(), 'cxl-build-coverage-'));
		const packageDir = join(rootDir, 'package');
		const outputDir = join(rootDir, 'dist', 'package');
		const previousCwd = process.cwd();
		try {
			await mkdir(packageDir);
			await mkdir(outputDir, { recursive: true });
			await writeFile(
				join(packageDir, 'tsconfig.json'),
				JSON.stringify({
					compilerOptions: { outDir: outputDir },
					files: ['index.ts', 'duplicate.ts'],
					references: [{ path: '../shared' }],
				}),
			);
			await writeFile(
				join(packageDir, 'tsconfig.worker.json'),
				JSON.stringify({
					compilerOptions: { outDir: outputDir },
					files: ['worker.ts', 'duplicate.ts'],
				}),
			);
			await writeFile(
				join(packageDir, 'tsconfig.lint.json'),
				JSON.stringify({
					compilerOptions: { outDir: outputDir },
					files: ['lint.ts'],
				}),
			);
			await writeFile(
				join(packageDir, 'tsconfig.server.json'),
				JSON.stringify({
					compilerOptions: { outDir: outputDir },
					files: ['server.ts'],
					references: [{ path: './tsconfig.auth.json' }],
				}),
			);
			await writeFile(
				join(packageDir, 'tsconfig.auth.json'),
				JSON.stringify({
					compilerOptions: { outDir: outputDir },
					files: ['auth.ts'],
				}),
			);
			await writeFile(
				join(packageDir, 'tsconfig.test.json'),
				JSON.stringify({
					compilerOptions: { outDir: outputDir },
					files: ['test.ts'],
					references: [
						{ path: '.' },
						{ path: './tsconfig.worker.json' },
						{ path: './tsconfig.server.json' },
						{ path: '../shared' },
					],
				}),
			);
			for (const name of [
				'index',
				'lint',
				'worker',
				'server',
				'auth',
				'duplicate',
				'test',
			]) {
				await writeFile(join(packageDir, `${name}.ts`), 'export {};');
				await writeFile(join(outputDir, `${name}.js`), 'export {};');
			}
			process.chdir(packageDir);
			const rootPkg = {
				name: '@test/package',
				version: '1.0.0',
				private: true,
				bugs: '',
				repository: '',
				build: {
					lintTsconfigs: ['tsconfig.lint.json'],
					tsconfigs: [
						'tsconfig.worker.json',
						'tsconfig.missing.json',
					],
				},
			} satisfies Package;
			const pkg = { ...rootPkg, build: undefined };
			const files = getExpectedCoverageFiles(outputDir, rootPkg, pkg);
			a.equalValues(
				files.map(file => file.url),
				[
					'/dist/package/auth.js',
					'/dist/package/duplicate.js',
					'/dist/package/index.js',
					'/dist/package/server.js',
					'/dist/package/worker.js',
				],
			);
		} finally {
			process.chdir(previousCwd);
			await rm(rootDir, { recursive: true, force: true });
		}
	}));

	suite.addTest(spec({ name: 'declaration bundle', serial: true }, it => {
		it.should('keep each entry point independent when sharing a program', async a => {
			const dir = await mkdtemp(join(tmpdir(), 'cxl-build-declarations-'));
			a.afterAll(() => rm(dir, { recursive: true, force: true }));
			const sources = join(dir, 'dist/pkg');
			const outputs = join(dir, 'package');
			await mkdir(join(sources, 'nested'), { recursive: true });
			await mkdir(outputs);
			await mkdir(join(dir, 'pkg'));
			await mkdir(join(dir, 'common'));
			await mkdir(join(dir, 'dist/common'));
			await writeFile(join(dir, 'package.json'), '{"type":"module"}');
			await writeFile(join(dir, 'common/package.json'), '{"name":"@test/common"}');
			const config = join(dir, 'pkg/tsconfig.json');
			await writeFile(config, '{"compilerOptions":{"outDir":"../dist/pkg","lib":["es2025"],"types":[]},"files":[]}');
			await writeFile(join(dir, 'dist/common/index.d.ts'), 'export interface Common { id: number }');
			const entries = [
				{ name: 'first', path: join(sources, 'nested/first.d.ts') },
				{ name: 'second', path: join(sources, 'second.d.ts') },
			];
			for (const { name, path } of entries)
				await writeFile(path,
					`import type { Common } from '@test/common'; export interface Value { ${name}: Common } export type { Common } from '@test/common';`);
			const program = await declarationProgram(entries.map(entry => entry.path), config);
			for (const { name, path } of entries)
				await writeFile(join(outputs, `${name}.d.ts`),
					await bundleDeclarations(path, [], config, program));
			await rm(join(dir, 'dist'), { recursive: true });
			const consumer = join(dir, 'consumer.ts');
			await writeFile(consumer, `import type { Value as First, Common as FirstCommon } from './package/first.js';
import type { Value as Second, Common as SecondCommon } from './package/second.js';
const common: FirstCommon & SecondCommon = { id: 1 };
const first: First = { first: common };
const second: Second = { second: common };
void first; void second;`);
			a.equalValues(await checkTypes(consumer, {
				strict: true, noEmit: true, types: [], lib: ['lib.es2025.d.ts'],
				module: ts.ModuleKind.NodeNext, moduleResolution: ts.ModuleResolutionKind.NodeNext,
			}), []);
		});
		it.should('expose generated files as the public Task type', async a => {
			const dir = await mkdtemp(join(tmpdir(), 'cxl-build-consumer-'));
			a.afterAll(() => rm(dir, { recursive: true, force: true }));
			{
				const consumer = join(dir, 'consumer.ts');
				const packageDir = join(dir, 'package');
				const entry = join(dir, 'index.d.ts');
				const rxEntry = join(dir, 'rx.d.ts');
				const tsconfig = join(dir, 'tsconfig.json');
				await mkdir(packageDir);
				await writeFile(
					rxEntry,
					`export { Observable, concat, of, EMPTY, type Operator } from ${JSON.stringify(join(import.meta.dirname, '../rx/index.js'))};
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
					tsconfig,
					JSON.stringify({
						compilerOptions: { paths: { '@cxl/rx': [rxEntry] } },
					}),
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
					await bundleDeclarations(entry, [], tsconfig),
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
				a.test('typecheck the public consumer', async a => {
					a.equalValues(await checkTypes(consumer, {
						lib: ['lib.es2023.d.ts'],
						module: ts.ModuleKind.ESNext,
						moduleResolution: ts.ModuleResolutionKind.Bundler,
						noEmit: true,
						paths: { '@cxl/build': [declarationPath] },
						skipLibCheck: false,
						strict: true,
						types: ['node'],
					}), []);
				});
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
					a.equalValues(await checkTypes(consumer, {
						lib: ['lib.es2023.d.ts'],
						module: ts.ModuleKind.ESNext,
						moduleResolution: ts.ModuleResolutionKind.Bundler,
						noEmit: true,
						strict: true,
						skipLibCheck: false,
						types: ['node'],
					}), []);
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
	}));

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

		it.should('use the configured package platform', a => {
			a.equal(
				getPackagePlatform({
					...pkg,
					build: { platform: 'neutral' },
				}),
				'neutral',
			);
			a.equal(
				getPackagePlatform({
					...pkg,
					build: { platform: 'worker' },
				}),
				'browser',
			);
		});

		it.should('use the configured platform for the test runtime', a => {
			a.equal(
				getPackageTestPlatform({
					...pkg,
					build: { platform: 'browser' },
				}),
				'browser',
			);
			a.equal(
				getPackageTestPlatform({
					...pkg,
					build: { platform: 'neutral' },
				}),
				'node',
			);
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

						synchronized.test(
							'treats branch names as git arguments',
							async a => {
								const branch = 'main;touch${IFS}injected';
								await execFileAsync('git', ['branch', branch], { cwd: dir });
								await execFileAsync('git', ['push', 'origin', branch], {
									cwd: dir,
								});

								await checkBranchUpToDate(branch, dir);

								a.ok(!(await readdir(dir)).includes('injected'));
							},
						);

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

		it.should('infer runtime aliases from resolved tsconfig paths', async (
			a: TestApi,
		) => {
			const dir = await mkdtemp(join(tmpdir(), 'cxl-build-importmap-'));
			const packageDir = join(dir, 'package');
			try {
				await mkdir(packageDir);
				await writeFile(
					join(dir, 'tsconfig.base.json'),
					JSON.stringify({
						compilerOptions: {
							paths: {
								'runtime/*': [
									'vendor/node_modules/@cxl/runtime/*',
								],
								'ui/*': ['node_modules/@cxl/ui/*'],
								'ambiguous/*': [
									'node_modules/first/*',
									'node_modules/second/*',
								],
								'types/*': ['node_modules/@types/types/*'],
								'declaration/*': ['node_modules/types/*.d.ts'],
								'source/*': ['./source/*'],
								exact: ['node_modules/exact/index.js'],
							},
						},
					}),
				);
				await writeFile(
					join(packageDir, 'tsconfig.json'),
					JSON.stringify({ extends: '../tsconfig.base.json' }),
				);
				const rootPkg = {
					...pkg,
					importmap: { 'ui/': '/explicit/ui/' },
				};
				const options = { appId: 'fixture', pkgJson: pkg, rootPkg };
				const moduleUrl = pathToFileURL(
					join(import.meta.dirname, 'spec.js'),
				).href;
				const script = withWorkspaceImportMap(
					`const output = await import(${JSON.stringify(moduleUrl)}).then(module => module.generateTestFile(${JSON.stringify(options)}));
if (!output) throw new Error('Missing generated test file');
process.stdout.write(output.source);`,
				);
				const { stdout: source } = await execFileAsync(
					process.execPath,
					['--input-type=module', '--eval', script],
					{ cwd: packageDir, encoding: 'utf8' },
				);
				const match = source.match(
					/<script type="importmap">(.*?)<\/script>/s,
				);
				const json = match?.[1];
				a.assert(json);
				const { imports } = JSON.parse(json) as {
					imports: Record<string, string>;
				};
				a.equal(
					imports['runtime/'],
					'../../vendor/node_modules/@cxl/runtime/',
				);
				a.equal(imports['ui/'], '/explicit/ui/');
				a.ok(!('ambiguous/' in imports));
				a.ok(!('types/' in imports));
				a.ok(!('declaration/' in imports));
				a.ok(!('source/' in imports));
				a.ok(!('exact' in imports));
			} finally {
				await rm(dir, { recursive: true, force: true });
			}
		});
	});

	cli.test('benchmark target', async a => {
		await runBenchmarks({
			appId: 'missing-benchmark',
			outputDir: '../dist/missing-benchmark',
			node: true,
		});

		const rootDir = await mkdtemp(join(tmpdir(), 'cxl-build-benchmark-'));
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
				join(outputDir, 'test-benchmark.js'),
				`import { readdir } from 'fs/promises';
import { spec } from ${JSON.stringify(pathToFileURL(join(import.meta.dirname, '../spec/index.js')).href)};
export default spec('fixture', s => s.test('filesystem discovery', a =>
	a.benchmark(() => readdir(import.meta.dirname), { warmup: 0, sampleTime: 1, samples: 2 })
));
`,
			);
			const options = { appId: 'fixture', outputDir, node: true };
			const script = withWorkspaceImportMap(
				`await import(${JSON.stringify(pathToFileURL(join(import.meta.dirname, 'spec.js')).href)}).then(module => module.runBenchmarks(${JSON.stringify(options)}))`,
			);
			await new Promise<void>((resolve, reject) => {
				execFile(
					process.execPath,
					['--input-type=module', '--eval', script],
					{ cwd: packageDir },
					error => (error ? reject(error) : resolve()),
				);
			});
			const report = JSON.parse(
				await readFile(join(outputDir, 'benchmark-report.json'), 'utf8'),
			) as { benchmark?: { fingerprint: { browser: string } } };
			a.ok(report.benchmark?.fingerprint.browser.startsWith('Node/'));
		} finally {
			await rm(rootDir, { recursive: true, force: true });
		}
	});

	cli.test('browser test alias module identity', async a => {
		const rootDir = await mkdtemp(join(tmpdir(), 'cxl-build-browser-alias-'));
		const packageDir = join(rootDir, 'package');
		const outputDir = join(packageDir, 'dist');
		const runtimeDir = join(rootDir, 'node_modules', 'runtime');
		const scopeDir = join(rootDir, 'node_modules', '@cxl');
		try {
			await mkdir(outputDir, { recursive: true });
			await mkdir(runtimeDir, { recursive: true });
			await mkdir(scopeDir);
			await symlink(
				join(import.meta.dirname, '../spec'),
				join(scopeDir, 'spec'),
				'dir',
			);
			await writeFile(
				join(rootDir, 'package.json'),
				JSON.stringify({
					name: 'root',
					devDependencies: { runtime: '1.0.0' },
				}),
			);
			await writeFile(
				join(packageDir, 'package.json'),
				'{"name":"fixture","type":"module"}',
			);
			await writeFile(
				join(packageDir, 'tsconfig.json'),
				JSON.stringify({
					compilerOptions: {
						paths: {
							'alias/*': ['../node_modules/runtime/*'],
						},
					},
				}),
			);
			await writeFile(
				join(runtimeDir, 'package.json'),
				'{"name":"runtime","type":"module"}',
			);
			await writeFile(join(runtimeDir, 'state.js'), 'export default {};');
			await writeFile(
				join(runtimeDir, 'indirect.js'),
				"import state from './state.js'; export default state;",
			);
			await writeFile(
				join(outputDir, 'test.js'),
				`import { spec } from '../../node_modules/@cxl/spec/index.js';
import direct from 'alias/state.js';
import indirect from 'alias/indirect.js';
import packageState from 'runtime/state.js';
export default spec('fixture', s => s.test('shares module identity', a => {
	a.equal(direct, indirect);
	a.equal(direct, packageState);
}));
`,
			);
			const options = {
				appId: 'fixture',
				outputDir,
				node: false,
				ignoreCoverage: true,
			};
			const script = withWorkspaceImportMap(
				`await import(${JSON.stringify(pathToFileURL(join(import.meta.dirname, 'spec.js')).href)}).then(module => module.runTests(${JSON.stringify(options)}))`,
			);
			await new Promise<void>((resolve, reject) => {
				execFile(
					process.execPath,
					['--input-type=module', '--eval', script],
					{ cwd: packageDir },
					error => (error ? reject(error) : resolve()),
				);
			});
			a.ok(true);
		} finally {
			await rm(rootDir, { recursive: true, force: true });
		}
	});

	cli.test('test target report', async a => {
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
			const script = withWorkspaceImportMap(
				`await import(${JSON.stringify(pathToFileURL(join(import.meta.dirname, 'spec.js')).href)}).then(module => module.runTests(${JSON.stringify(options)}))`,
			);
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

	cli.test('coverage target report', async a => {
		const rootDir = await mkdtemp(join(tmpdir(), 'cxl-build-coverage-target-'));
		const packageDir = join(rootDir, 'package');
		const outputDir = join(rootDir, 'dist', 'package');
		try {
			await mkdir(packageDir);
			await mkdir(outputDir, { recursive: true });
			await writeFile(join(rootDir, 'package.json'), '{"name":"root"}');
			await writeFile(
				join(packageDir, 'package.json'),
				JSON.stringify({
					name: 'fixture',
					type: 'module',
					build: { tsconfigs: ['tsconfig.worker.json'] },
				}),
			);
			for (const [name, files] of [
				['tsconfig.json', ['index.ts']],
				['tsconfig.worker.json', ['worker.ts']],
			] as const) {
				await writeFile(
					join(packageDir, name),
					JSON.stringify({
						compilerOptions: { outDir: outputDir },
						files,
					}),
				);
			}
			await writeFile(join(packageDir, 'index.ts'), 'export const value = true;');
			await writeFile(join(packageDir, 'worker.ts'), 'export const value = true;');
			await writeFile(join(outputDir, 'index.js'), 'export const value = true;');
			await writeFile(join(outputDir, 'worker.js'), 'export const value = true;');
			await writeFile(join(outputDir, 'shared.js'), 'export const value = true;');
			await writeFile(
				join(outputDir, 'test.js'),
				`import { spec } from ${JSON.stringify(pathToFileURL(join(import.meta.dirname, '../spec/index.js')).href)};
import { value as index } from './index.js';
import { value as shared } from './shared.js';
export default spec('fixture', s => s.test('passes', a => {
	a.ok(index);
	a.ok(shared);
}));
`,
			);
			const options = { appId: 'fixture', outputDir, node: true };
			const script = withWorkspaceImportMap(
				`await import(${JSON.stringify(pathToFileURL(join(import.meta.dirname, 'spec.js')).href)}).then(module => module.runTests(${JSON.stringify(options)}))`,
			);
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
			) as { coverage: { url: string }[] };
			a.equalValues(
				report.coverage.map(file => file.url.split('/').at(-1)).sort(),
				['index.js', 'worker.js'],
			);
		} finally {
			await rm(rootDir, { recursive: true, force: true });
		}
	});
	suite.addTest(integration);
	suite.addTest(checks);
});

export default suite;
