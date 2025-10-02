import { join } from 'path';
import { readFileSync } from 'fs';

import { EMPTY, fromAsync } from '../rx/index.js';
import { run as runSpec } from '../spec-runner/runner.js';
import printReportV2 from '../spec-runner/report-stdout.js';

import { BuildConfiguration, build, exec } from './builder.js';
import { pkg, readme, esbuild } from './package.js';
import { copyDir, file } from './file.js';
import { eslint } from './lint.js';
import { tsconfig } from './tsc.js';

import { Package, publishNpm } from './npm.js';

export function buildLibrary(...extra: BuildConfiguration[]) {
	const cwd = process.cwd();
	const tsconfigFile = JSON.parse(
		readFileSync(cwd + '/tsconfig.json', 'utf8'),
	);
	const outputDir = tsconfigFile?.compilerOptions?.outDir;
	const pkgDir = join(outputDir, 'package');
	const pkgJson = JSON.parse(readFileSync('package.json', 'utf8')) as Package;
	const rootPkg = JSON.parse(
		readFileSync('../package.json', 'utf8'),
	) as Package;
	const isBrowser = !!pkgJson.browser;
	let importmap: string | undefined = undefined;

	if (isBrowser && rootPkg.devDependencies) {
		const map: Record<string, string> = {};
		for (const name in rootPkg.devDependencies) map[name] = `/${name}`;
		importmap = JSON.stringify({ imports: map });
	}

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
							mjs: isBrowser,
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
				pkg('index.bundle.js'),
				copyDir(outputDir, pkgDir, '*.d.ts'),
				esbuild({
					entryPoints: [
						{
							out: 'index.bundle',
							in: join(outputDir, 'index.js'),
						},
					],
					platform: isBrowser ? 'browser' : 'node',
					outdir: pkgDir,
					packages: isBrowser ? undefined : 'external',
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
