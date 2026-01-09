import { readFileSync } from 'fs';
import { join } from 'path';

import { run as runSpec } from '../spec-runner/runner.js';
import printReportV2 from '../spec-runner/report-stdout.js';

import { parseTsConfig } from './tsc.js';
import { Package } from './npm.js';
import { fromAsync, of } from '../rx/index.js';
import { getDependencies } from './package.js';

import type { ParsedCommandLine } from 'typescript';

let browserRunner: string | undefined;

export function generateEsmTestFile(
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
	return JSON.stringify({ imports: map });
}

function generateTestImportMap(
	rootPkg: Package & { importmap?: Record<string, string> },
	pkgJson: Package,
) {
	const map = getDependencies(rootPkg, pkgJson);

	for (const key in map) {
		map[`${key}/`] = `../../node_modules${map[key]}/`;
	}
	map['@cxl/spec'] = '../../node_modules/@cxl/spec/index.js';
	if (rootPkg.importmap) Object.assign(map, rootPkg.importmap);

	return JSON.stringify({ imports: map });
}

export function generateTestFile({
	appId,
	pkgJson,
	rootPkg,
	testFile = './test.js',
	outFile = 'test.html',
}: {
	appId: string;
	pkgJson: Package;
	rootPkg: Package;
	testFile?: string;
	outFile?: string;
}) {
	return of({
		path: outFile,
		source: generateEsmTestFile(
			appId,
			pkgJson.name,
			testFile,
			generateTestImportMap(rootPkg, pkgJson),
		),
	});
}

export function runTests({
	appId,
	outputDir,
	node,
	entryFile = './test.js',
	ignoreCoverage,
}: {
	appId: string;
	outputDir: string;
	node?: boolean;
	entryFile?: string;
	ignoreCoverage?: boolean;
}) {
	return fromAsync(async () => {
		const cwd = process.cwd();
		const pkgJson = JSON.parse(
			readFileSync('package.json', 'utf8'),
		) as Package;
		const rootPkg = JSON.parse(
			readFileSync('../package.json', 'utf8'),
		) as Package;
		const parsedTsconfig = parseTsConfig(join(cwd, 'tsconfig.json'));

		try {
			process.chdir(outputDir);
			const report = await runSpec({
				node,
				mjs: true,
				vfsRoot: '../../',
				entryFile,
				ignoreCoverage,
				baselinePath: `../../${appId}/spec`,
				importmap: node
					? undefined
					: generateImportMap(rootPkg, pkgJson, parsedTsconfig),
				sources: new Map(),
				log: console.log.bind(console),
			});
			printReportV2(report);
			if (!report.success) throw new Error('Tests failed');
		} finally {
			process.chdir(cwd);
		}
	}).ignoreElements();
}
