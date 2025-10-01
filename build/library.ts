import { join } from 'path';
import { readFileSync } from 'fs';

import { EMPTY } from '@cxl/rx';

import { BuildConfiguration, build, exec } from './builder.js';
import { pkg, readme, esbuild } from './package.js';
import { file } from './file.js';
import { eslint } from './lint.js';
import { tsconfig } from './tsc.js';

export function buildLibrary(...extra: BuildConfiguration[]) {
	const cwd = process.cwd();
	const tsconfigFile = JSON.parse(
		readFileSync(cwd + '/tsconfig.json', 'utf8'),
	);
	const outputDir = tsconfigFile?.compilerOptions?.outDir;
	const pkgDir = join(outputDir, 'package');

	return build(
		{
			outputDir,
			tasks: [
				file('test-screenshot.html', 'test-screenshot.html').catchError(
					() => EMPTY,
				),
				tsconfig(),
				pkg(),
			],
		},
		{
			target: 'test',
			outputDir,
			tasks: [exec(`node ../spec-runner --mjs`, { cwd: outputDir })],
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
				file(join(outputDir, 'package.json'), 'package.json'),
				esbuild({
					entryPoints: [
						{
							out: 'index.bundle',
							in: join(outputDir, 'index.js'),
						},
					],
					outdir: pkgDir,
				}),
			],
		},
		...extra,
	);
}
