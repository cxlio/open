import { basename, join } from 'path';
import { existsSync, readFileSync } from 'fs';

import { EMPTY, concat, fromAsync } from '../rx/index.js';

import { BuildConfiguration, build, exec } from './builder.js';
import { pkg, readme, esbuild } from './package.js';
import { file, copyDir } from './file.js';
import { eslintTsconfig } from './lint.js';
import { TsconfigJson, tsconfig } from './tsc.js';
import { buildDocs } from './docs.js';
import { generateTestFile, runTests } from './spec.js';
import { audit } from './audit.js';

import { Package, publishNpm } from './npm.js';

export function buildLibrary(...extra: BuildConfiguration[]) {
	const cwd = process.cwd();
	const tsconfigFile = JSON.parse(
		readFileSync(cwd + '/tsconfig.json', 'utf8'),
	) as TsconfigJson;
	const outputDir = tsconfigFile.compilerOptions?.outDir;
	if (!outputDir) throw new Error('Invalid tsconfig file');

	const appId = basename(outputDir);
	const pkgDir = join(outputDir, 'package');
	const pkgJson = JSON.parse(readFileSync('package.json', 'utf8')) as Package;
	const rootPkg = JSON.parse(
		readFileSync('../package.json', 'utf8'),
	) as Package;

	const isBrowser = !!pkgJson.browser;
	// "main" is used mainly by CDNs, bundlers will prefer to use the "exports" config.
	const pkgMain = isBrowser
		? (pkgJson.browser ?? pkgJson.exports?.['.'] ?? './index.bundle.js')
		: './index.js';

	// If pkgJson browser points to './index.bundle.js' a bundle file will be created.
	const needsBundle =
		pkgJson.browser === './index.bundle.js' &&
		pkgJson.exports &&
		pkgJson.exports['.'] !== pkgJson.browser;

	const external = [
		...Object.keys(pkgJson.dependencies ?? {}),
		...Object.keys(pkgJson.peerDependencies ?? {}),
		...Object.keys(pkgJson.bundledDependencies ?? {}),
	];
	const hasScreenshotTests = existsSync('./test-screenshot.ts');
	const bundleEntryPoint = [
		{
			out: isBrowser ? 'index.bundle' : 'index',
			in: join(outputDir, 'index.js'),
		},
	];
	const entryPoints = pkgJson.exports
		? Object.values(pkgJson.exports).flatMap(val => {
				return val ? [join(outputDir, val)] : [];
			})
		: bundleEntryPoint;

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
					node: !isBrowser,
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
							}),
							concat(
								fromAsync(async () => {
									const { buildDts } =
										await import('@cxl/3doc/render.js');
									const { renderJson, findExamples } =
										await import('@cxl/3doc/render-summary.js');
									const dts = await buildDts(
										{
											clean: false,
											outputDir,
											noHtml: true,
										},
										pkgJson,
									);
									const summary = renderJson(dts);
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
								}),
								/*fromAsync(async () => {
									try {
										process.chdir(outputDir);
										const report = await runSpec({
											node: false,
											mjs: true,
											vfsRoot: '../../',
											ignoreCoverage: true,
											baselinePath: `../../${appId}/spec`,
											entryFile: './test-screenshot.js',
											importmap: generateImportMap(
												rootPkg,
												pkgJson,
												parsedTsconfig,
											),
											sources: new Map(),
											log: console.log.bind(console),
										});
										printReportV2(report);
										if (!report.success)
											throw new Error('Tests failed');
									} finally {
										process.chdir(cwd);
									}
								}).ignoreElements(),*/
							),
						],
					},
				]
			: []),
		{
			target: 'audit',
			outputDir,
			tasks: [fromAsync(audit).ignoreElements()],
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
			tasks: [eslintTsconfig(tsconfigFile)],
		},
		{
			target: 'package',
			outputDir: '.',
			tasks: [
				readme(),
				eslintTsconfig(tsconfigFile),
				exec(`rm -rf ${pkgDir}`),
			],
		},
		{
			target: 'package',
			outputDir: pkgDir,
			tasks: [
				file('README.md', 'README.md'),
				file('LICENSE.md', 'LICENSE.md').catchError(() => EMPTY),
				pkg(pkgMain),
				copyDir(outputDir, pkgDir, '*.d.ts'),
				esbuild({
					entryPoints,
					platform: isBrowser ? 'browser' : 'node',
					outdir: pkgDir,
					external,
				}),
				/*esbuild({
					entryPoints: dtsEntryPoints,
					platform: isBrowser ? 'browser' : 'node',
					outdir: pkgDir,
					external,
				}),*/
				...(needsBundle
					? [
							esbuild({
								entryPoints: bundleEntryPoint,
								platform: 'browser',
								outdir: pkgDir,
								external,
							}),
						]
					: []),
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
