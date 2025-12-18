import { basename, join } from 'path';
import { existsSync, readFileSync } from 'fs';

import { EMPTY, concat, fromAsync, of } from '../rx/index.js';
import { run as runSpec } from '../spec-runner/runner.js';
import printReportV2 from '../spec-runner/report-stdout.js';

import { BuildConfiguration, build, exec } from './builder.js';
import { pkg, readme, esbuild } from './package.js';
import { copyDir, file } from './file.js';
import { eslintTsconfig } from './lint.js';
import { TsconfigJson, tsconfig, parseTsConfig } from './tsc.js';
import { buildDocs } from './docs.js';
import audit from './audit.js';

import { Package, publishNpm } from './npm.js';
import type { ParsedCommandLine } from 'typescript';

let browserRunner: string | undefined;

function collectDependencies(
	deps: Package['dependencies'],
	map: Record<string, string> = {},
) {
	for (const name in deps) map[name] = `/${name}`;
	return map;
}

function getDependencies(rootPkg: Package, pkgJson: Package) {
	const map: Record<string, string> = {};
	if (rootPkg.devDependencies)
		collectDependencies(rootPkg.devDependencies, map);
	if (pkgJson.dependencies) collectDependencies(pkgJson.dependencies, map);
	return map;
}

function generateImportMap(
	rootPkg: Package & { importmap?: Record<string, string> },
	pkgJson: Package,
	_tsc: ParsedCommandLine,
) {
	const map = getDependencies(rootPkg, pkgJson);
	for (const key in map) {
		map[`${key}/`] = `/${key}/`;
	}

	if (rootPkg.importmap) Object.assign(map, rootPkg.importmap);
	//const basePath = (tsc.options.pathsBasePath as string) ?? '';
	/*const cwd = join(process.cwd(), '..');
	const basePath = join(process.cwd(), '../..');
	for (const [path, value] of Object.entries(tsc.options.paths ?? {})) {
		const mapPath = path.endsWith('*')
			? path.slice(0, path.length - 1)
			: path;
		const dest = 
			value[0].endsWith('*')
				? value[0].slice(0, value[0].length - 1)
				: value[0];
		map[mapPath] = join(
			cwd,
			dest
		).slice(basePath.length);
	}

	console.log(cwd, map);*/
	return JSON.stringify({ imports: map });
}

function generateTestImportMap(rootPkg: Package, pkgJson: Package) {
	const map = getDependencies(rootPkg, pkgJson);

	for (const key in map) {
		map[`${key}/`] = `../../node_modules${map[key]}/`;
	}
	map['@cxl/spec'] = '../../node_modules/@cxl/spec/index.bundle.js';

	return JSON.stringify({ imports: map });
}

function generateEsmTestFile(
	dirName: string,
	pkgName: string,
	testFile: string,
	importmap: string,
) {
	return Buffer.from(`<!DOCTYPE html>
<title>${pkgName} Test Suite</title>
<script type="importmap">${importmap}</script>
<script type="module">
	import suite from '${testFile}';
	${(browserRunner ??= readFileSync(
		join(import.meta.dirname, 'spec-browser.js'),
		'utf8',
	))}
	__cxlRunner({ type: 'run', suites: [suite], baselinePath: '../../${dirName}/spec' })
</script>`);
}

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
	// If pkgJson browser points to './index.bundle.js' a bundle file will be created.
	const needsBundle =
		pkgJson.browser === './index.bundle.js' && pkgJson.exports;

	// "main" is used mainly by CDNs, bundlers will prefer to use the "exports" config.
	const pkgMain = isBrowser
		? pkgJson.browser ?? pkgJson.exports?.['.'] ?? './index.bundle.js'
		: './index.js';
	const external = [
		...Object.keys(pkgJson.dependencies ?? {}),
		...Object.keys(pkgJson.peerDependencies ?? {}),
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
	const parsedTsconfig = parseTsConfig(join(cwd, 'tsconfig.json'));

	return build(
		{
			outputDir,
			tasks: [
				file('test-screenshot.html', 'test-screenshot.html').catchError(
					() => EMPTY,
				),
				file('test.html', 'test.html').catchError(() =>
					of({
						path: 'test.html',
						source: generateEsmTestFile(
							appId,
							pkgJson.name,
							'./test.js',
							generateTestImportMap(rootPkg, pkgJson),
						),
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
				fromAsync(async () => {
					try {
						process.chdir(outputDir);
						const report = await runSpec({
							node: !isBrowser,
							mjs: true,
							vfsRoot: '../../',
							entryFile: './test.js',
							importmap: isBrowser
								? generateImportMap(
										rootPkg,
										pkgJson,
										parsedTsconfig,
								  )
								: undefined,
							sources: new Map(),
							log: console.log.bind(console),
						});
						printReportV2(report);
						if (!report.success) throw new Error('Tests failed');
					} finally {
						process.chdir(cwd);
					}
				}).ignoreElements(),
			],
		},
		...(hasScreenshotTests
			? [
					{
						target: 'test',
						outputDir,
						tasks: [
							of({
								path: 'test-screenshot.html',
								source: generateEsmTestFile(
									appId,
									pkgJson.name,
									'./test-screenshot.js',
									generateTestImportMap(rootPkg, pkgJson),
								),
							}),
							concat(
								fromAsync(async () => {
									const { buildDts } = await import(
										'@cxl/3doc/render.js'
									);
									const { renderJson, findExamples } =
										await import(
											'@cxl/3doc/render-summary.js'
										);
									const dts = await buildDts({
										clean: false,
										outputDir,
										noHtml: true,
									});
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
								fromAsync(async () => {
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
								}).ignoreElements(),
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
