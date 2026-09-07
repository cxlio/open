import { basename, dirname, join, resolve } from 'path';
import { existsSync } from 'fs';
import { mkdir, readdir, rm, writeFile } from 'fs/promises';

import { EMPTY, concat, fromAsync } from '../rx/index.js';

import {
	build,
	buildOutputOptions,
	buildTargets,
	type BuildConfiguration,
} from './builder.js';
import {
	buildEsbuild,
	esbuildVersion,
	getPackageBundleEntryPoints,
	getPackageDeclarationEntryPoints,
	getPackageEntryPoints,
	getPackageExternal,
	getPackagePlatform,
	getPackageTestPlatform,
	pkg,
	readme,
} from './package.js';
import { file } from './file.js';
import { eslintTestTsconfig, eslintTsconfig } from './lint.js';
import {
	bundleDeclarations,
	getProjectOutputFiles,
	tscVersion,
	tsconfig,
	type TsconfigJson,
} from './tsc.js';
import { buildDocs } from './docs.js';
import { generateTestFile, runBenchmarks, runTests } from './spec.js';
import { audit, auditDependencies } from './audit.js';
import { readJson } from '../program/index.js';

import {
	getPackageTsconfigs,
	publishNpm,
	type Package,
} from './npm.js';
import { cachedBuild } from './cache.js';

const PackageCacheVersion = 1;

export function getLintTsconfigs(rootPkg: Package, pkg: Package) {
	return getPackageTsconfigs(rootPkg, pkg);
}

async function packageFiles(dir: string): Promise<string[]> {
	if (!existsSync(dir)) return [];
	const entries = await readdir(dir, { withFileTypes: true });
	const files = await Promise.all(
		entries.map(entry => {
			const path = join(dir, entry.name);
			return entry.isDirectory() ? packageFiles(path) : [path];
		}),
	);
	return files.flat();
}

async function removePackageFiles(dir: string, pattern: RegExp) {
	const files = await packageFiles(dir);
	await Promise.all(
		files.filter(file => pattern.test(file)).map(file => rm(file)),
	);
}

export async function buildLibrary(...extra: BuildConfiguration[]) {
	const selectedTargets = buildTargets();
	const auditedBeforeBuild =
		selectedTargets.includes('audit') || selectedTargets.includes('package');
	if (auditedBeforeBuild) await audit();

	const cwd = process.cwd();
	const { grep } = buildOutputOptions();
	const tsconfigFile = await readJson<TsconfigJson>(cwd + '/tsconfig.json');
	const outputDir = tsconfigFile.compilerOptions?.outDir;
	if (!outputDir) throw new Error('Invalid tsconfig file');

	const appId = basename(outputDir);
	const pkgDir = join(outputDir, 'package');
	const pkgJson = await readJson<Package>('package.json');
	const rootPkg = await readJson<Package>('../package.json');
	const configuredTsconfigs = getLintTsconfigs(rootPkg, pkgJson);
	const lintTasks = () => [
		eslintTsconfig(tsconfigFile),
		...configuredTsconfigs.map(path => eslintTsconfig(path)),
	];

	const isBrowser = !!pkgJson.browser;
	const platform = getPackagePlatform(pkgJson);
	const testPlatform = getPackageTestPlatform(pkgJson);
	// "main" is used mainly by CDNs, bundlers will prefer to use the "exports" config.
	const pkgMain = isBrowser
		? (pkgJson.browser ?? pkgJson.exports?.['.'] ?? './index.bundle.js')
		: './index.js';

	// If pkgJson browser points to './index.bundle.js' a bundle file will be created.
	const needsBundle =
		pkgJson.browser === './index.bundle.js' &&
		pkgJson.exports &&
		pkgJson.exports['.'] !== pkgJson.browser;

	const external = getPackageExternal(pkgJson);
	const hasScreenshotTests = existsSync('./test-screenshot.ts');
	const { declarationFiles, javascriptFiles } = getProjectOutputFiles();
	const bundleEntryPoint = getPackageBundleEntryPoints(outputDir, pkgJson);
	const entryPoints = getPackageEntryPoints(
		outputDir,
		pkgJson,
		javascriptFiles,
	);
	const declarationEntryPoints = getPackageDeclarationEntryPoints(
		outputDir,
		pkgJson,
		declarationFiles,
	);
	const cacheDir = join(outputDir, '.package-cache');
	const tsconfigInputs = [
		'tsconfig.json',
		'../tsconfig.json',
	];
	const declarationBuild = fromAsync(() =>
		cachedBuild(
			{
				manifest: join(cacheDir, 'declarations.json'),
				inputs: [...declarationFiles, ...tsconfigInputs],
				key: JSON.stringify({
					version: PackageCacheVersion,
					typescript: tscVersion,
					entryPoints: declarationEntryPoints,
					external,
				}),
				outputDir: pkgDir,
			},
			async () => {
				await removePackageFiles(pkgDir, /\.d\.(?:ts|mts|cts)$/);
				return Promise.all(
					declarationEntryPoints.map(async entry => {
						const output = resolve(pkgDir, entry.out);
						await mkdir(dirname(output), { recursive: true });
						await writeFile(
							output,
							await bundleDeclarations(entry.in, external),
						);
						return output;
					}),
				);
			},
		),
	).ignoreElements();
	const javascriptBuild = fromAsync(() =>
		cachedBuild(
			{
				manifest: join(cacheDir, 'javascript.json'),
				inputs: [...javascriptFiles, ...tsconfigInputs],
				key: JSON.stringify({
					version: PackageCacheVersion,
					esbuild: esbuildVersion,
					entryPoints,
					bundleEntryPoint: needsBundle ? bundleEntryPoint : undefined,
					external,
					platform,
				}),
				outputDir: pkgDir,
			},
			async () => {
				await removePackageFiles(
					pkgDir,
					/\.(?:[cm]?js|css)(?:\.map)?$/,
				);
				const builds = [
					buildEsbuild({
						entryPoints,
						platform,
						outdir: pkgDir,
						external,
						metafile: true,
					}),
				];
				if (needsBundle)
					builds.push(
						buildEsbuild({
							entryPoints: bundleEntryPoint,
							platform,
							outdir: pkgDir,
							external,
							metafile: true,
						}),
					);
				const results = await Promise.all(builds);
				const outputs: string[] = [];
				for (const result of results) {
					if (!result.metafile) throw new Error('Missing esbuild metafile');
					for (const output of Object.keys(result.metafile.outputs))
						outputs.push(resolve(output));
				}
				return outputs;
			},
		),
	).ignoreElements();

	return build(
		{
			outputDir,
			tasks: [
				file('test-screenshot.html', 'test-screenshot.html').catchError(
					() => EMPTY,
				),
				file('test.html', 'test.html').catchError(() =>
					generateTestFile({
						appId,
						pkgJson,
						rootPkg,
					}),
				),
				tsconfig('tsconfig.test.json'),
				eslintTestTsconfig(),
				pkg('index.js'),
			],
		},
		{
			target: 'test',
			outputDir,
			tasks: [
				runTests({
					appId,
					outputDir,
					node: testPlatform === 'node',
					grep,
				}),
			],
		},
		{
			target: 'benchmark',
			outputDir,
			tasks: [
				runBenchmarks({
					appId,
					outputDir,
					node: testPlatform === 'node',
				}),
			],
		},
		...(hasScreenshotTests
			? [
					{
						target: 'test',
						outputDir,
						tasks: [
							generateTestFile({
								appId,
								pkgJson,
								rootPkg,
								testFile: './test-screenshot.js',
								outFile: 'test-screenshot.html',
							}),
							concat(
								fromAsync(async () => {
									const { buildDts } =
										await import('@cxl/3doc/render.js');
									const { renderJson, findExamples } =
										await import('@cxl/3doc/render-summary.js');
									const summary = renderJson(
										await buildDts(
											{
												clean: false,
												outputDir,
												noHtml: true,
											},
											pkgJson,
										),
									);
									const examples = summary.index.flatMap(n =>
										findExamples(n),
									);
									return {
										path: 'test-screenshot.json',
										source: Buffer.from(
											JSON.stringify({
												index: summary.index,
												examples,
											}),
										),
									};
								}),
								runTests({
									appId,
									outputDir,
									entryFile: './test-screenshot.js',
									ignoreCoverage: true,
									grep,
								}),
							),
						],
					},
				]
			: []),
		{
			target: 'audit',
			outputDir,
			tasks: auditedBeforeBuild ? [] : [fromAsync(audit).ignoreElements()],
		},

		{
			target: 'docs',
			outputDir: `../docs/${pkgJson.name}`,
			tasks: [
				buildDocs({
					outputDir: `../docs/${pkgJson.name}`,
				}),
			],
		},
		{
			target: 'lint',
			outputDir: '.',
			tasks: lintTasks(),
		},
		{
			target: 'package',
			outputDir: '.',
			tasks: [
				readme(),
				...lintTasks(),
				fromAsync(auditDependencies).ignoreElements(),
				...(auditedBeforeBuild ? [] : [fromAsync(audit).ignoreElements()]),
			],
		},
		{
			target: 'package',
			outputDir: pkgDir,
			tasks: [
				file('README.md', 'README.md'),
				file('LICENSE.md', 'LICENSE.md').catchError(() => EMPTY),
				pkg(pkgMain),
				declarationBuild,
				javascriptBuild,
			],
		},
		{
			target: 'publish',
			outputDir,
			tasks: [
				fromAsync(async () => {
					await publishNpm('.', pkgDir);
				}).ignoreElements(),
			],
		},
		...extra,
	);
}
