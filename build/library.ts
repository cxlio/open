import { basename, join } from 'path';
import { readFileSync } from 'fs';

import { EMPTY, fromAsync, observable } from '../rx/index.js';
import { run as runSpec } from '../spec-runner/runner.js';
import printReportV2 from '../spec-runner/report-stdout.js';

import { BuildConfiguration, build, exec } from './builder.js';
import { pkg, readme, esbuild } from './package.js';
import { copyDir, file } from './file.js';
import { eslint } from './lint.js';
import { tsconfig } from './tsc.js';

import { Package, publishNpm } from './npm.js';

import { buildDocs } from '@cxl/3doc/render.js';

function collectDependencies(
	deps: Package['dependencies'],
	map: Record<string, string> = {},
) {
	for (const name in deps) map[name] = `/${name}`;
	return map;
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
	const pkgMain = pkgJson.exports?.['.'] ?? 'index.bundle.js';
	const external =
		isBrowser && pkgJson.dependencies
			? Object.keys(pkgJson.dependencies)
			: undefined;

	let importmap: string | undefined = undefined;

	if (isBrowser) {
		const map: Record<string, string> = {};

		if (rootPkg.devDependencies)
			collectDependencies(rootPkg.devDependencies, map);
		if (pkgJson.dependencies)
			collectDependencies(pkgJson.dependencies, map);
		importmap = JSON.stringify({ imports: map });
	}

	const entryPoints = pkgJson.exports
		? Object.values(pkgJson.exports).flatMap(val => {
				return val ? [join(outputDir, val)] : [];
		  })
		: [
				{
					out: 'index.bundle',
					in: join(outputDir, 'index.js'),
				},
		  ];

	return build(
		{
			outputDir,
			tasks: [
				file('test-screenshot.html', 'test-screenshot.html').catchError(
					() => EMPTY,
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
							vfsRoot: '..',
							entryFile: './test.js',
							importmap,
							log: console.log.bind(console),
						});
						printReportV2(report);
					} finally {
						process.chdir(cwd);
					}
				}).ignoreElements(),
			],
		},
		{
			target: 'docs',
			outputDir: `../docs/${appId}`,
			tasks: [
				observable(subs => {
					buildDocs(
						{
							$: [],
							clean: true,
							summary: true,
							markdown: true,
							cxlExtensions: true,
							debug: true,
							outputDir: `../docs/${appId}`,
						},
						file => {
							subs.next({
								path: file.name,
								source: Buffer.from(file.content),
							});
						},
					).then(() => subs.complete());
				}),
			],
		},
		{
			target: 'package',
			outputDir: '.',
			tasks: [readme(), eslint() /*, exec(`rm -rf ${pkgDir}`)*/],
		},
		{
			//target: 'package',
			outputDir: '.',
			tasks: [exec(`rm -rf ${pkgDir}`)],
		},
		{
			//target: 'package',
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
					packages: isBrowser ? 'bundle' : 'external',
				}),
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
