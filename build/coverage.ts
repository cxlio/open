import { readFileSync } from 'fs';
import { extname, relative, resolve } from 'path';
import * as ts from 'typescript';
import type { TestCoverage } from '../spec-runner/report.js';
import { getPackageTsconfigs, type Package } from './npm.js';
import { parseTsConfig } from './tsc.js';

export function getExpectedCoverageFiles(
	outputDir: string,
	rootPkg: Package,
	pkgJson: Package,
): TestCoverage[] {
	const root = resolve(outputDir, '../../');
	const files = new Map<string, TestCoverage>();

	for (const tsconfig of [
		'tsconfig.json',
		...getPackageTsconfigs(rootPkg, pkgJson),
	]) {
		const parsed = parseTsConfig(tsconfig);
		for (const fileName of parsed.fileNames) {
			for (const outFile of ts.getOutputFileNames(parsed, fileName, false)) {
				if (extname(outFile) === '.js') {
					const url = `/${relative(root, outFile).replace(/\\/g, '/')}`;
					const len = readFileSync(outFile, 'utf8').length;
					files.set(url, {
						url,
						functions: [
							{
								functionName: '',
								isBlockCoverage: true,
								ranges: [
									{ startOffset: 0, endOffset: len, count: 0 },
								],
							},
						],
					});
				}
			}
		}
	}

	return [...files.values()].sort((a, b) => a.url.localeCompare(b.url));
}
