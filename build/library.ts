import { basename, join } from 'path';
import { readFileSync } from 'fs';

import { EMPTY, fromAsync, observable, of } from '../rx/index.js';
import { run as runSpec } from '../spec-runner/runner.js';
import printReportV2 from '../spec-runner/report-stdout.js';

import { BuildConfiguration, build, exec } from './builder.js';
import { pkg, readme, esbuild } from './package.js';
import { copyDir, file } from './file.js';
import { eslint } from './lint.js';
import { tsconfig } from './tsc.js';
import audit from './audit.js';

import { Package, publishNpm } from './npm.js';

let browserRunner: string;

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

function generateImportMap(rootPkg: Package, pkgJson: Package) {
	const map = getDependencies(rootPkg, pkgJson);
	for (const key in map) {
		map[`${key}/`] = `/${key}/`;
	}

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
	browserRunner.run([suite], '../../${dirName}/spec');
</script>`);
}

export function buildLibrary(...extra: BuildConfiguration[]) {
	const cwd = process.cwd();
	const tsconfigFile = JSON.parse(
		readFileSync(cwd + '/tsconfig.json', 'utf8'),
	);
	const outputDir = tsconfigFile?.compilerOptions?.outDir;
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
	const pkgMain =
		pkgJson.browser ?? pkgJson.exports?.['.'] ?? './index.bundle.js';
	const external = [
		...Object.keys(pkgJson.dependencies ?? {}),
		...Object.keys(pkgJson.peerDependencies ?? {}),
	];

	const bundleEntryPoint = [
		{
			out: 'index.bundle',
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
							vfsRoot: '../..',
							entryFile: './test.js',
							importmap: isBrowser
								? generateImportMap(rootPkg, pkgJson)
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
		{
			target: 'audit',
			outputDir,
			tasks: [fromAsync(audit).ignoreElements()],
		},
		{
			target: 'docs',
			outputDir: `../docs/${pkgJson.name}`,
			tasks: [
				observable(subs => {
					import('@cxl/3doc/render.js').then(({ buildDocs }) =>
						buildDocs(
							{
								$: [],
								clean: true,
								summary: true,
								markdown: true,
								cxlExtensions: true,
								outputDir: `../docs/${pkgJson.name}`,
							},
							file => {
								subs.next({
									path: file.name,
									source: Buffer.from(file.content),
								});
							},
						).then(() => subs.complete()),
					);
				}),
			],
		},
		{
			target: 'package',
			outputDir: '.',
			tasks: [readme(), eslint(), exec(`rm -rf ${pkgDir}`)],
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
