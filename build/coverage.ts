import { existsSync, readFileSync } from 'fs';
import { extname, isAbsolute, relative, resolve, sep } from 'path';
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
	const packageDir = resolve('.');
	const files = new Map<string, TestCoverage>();
	const configs = new Map<string, ts.ParsedCommandLine>();
	const collected = new Set<string>();
	const traversed = new Set<string>();

	function parse(tsconfig: string) {
		const path = resolve(tsconfig);
		let parsed = configs.get(path);
		if (!parsed) {
			parsed = parseTsConfig(path);
			configs.set(path, parsed);
		}
		return { path, parsed };
	}

	function collect(tsconfig: string) {
		const { path, parsed } = parse(tsconfig);
		if (collected.has(path)) return parsed;
		collected.add(path);
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
		return parsed;
	}

	function collectReference(tsconfig: string) {
		const path = resolve(tsconfig);
		const packagePath = relative(packageDir, path);
		if (
			packagePath === '..' ||
			packagePath.startsWith(`..${sep}`) ||
			isAbsolute(packagePath)
		)
			return;
		const parsed = collect(path);
		if (traversed.has(path)) return;
		traversed.add(path);
		for (const reference of parsed.projectReferences ?? [])
			collectReference(ts.resolveProjectReferencePath(reference));
	}

	for (const tsconfig of [
		'tsconfig.json',
		...getPackageTsconfigs(rootPkg, pkgJson),
	])
		collect(tsconfig);

	if (existsSync('tsconfig.test.json')) {
		const { parsed: test } = parse('tsconfig.test.json');
		for (const reference of test.projectReferences ?? [])
			collectReference(ts.resolveProjectReferencePath(reference));
	}

	return [...files.values()].sort((a, b) => a.url.localeCompare(b.url));
}
