import { readFileSync } from 'fs';
import { extname, join, relative, resolve } from 'path';
import * as ts from 'typescript';
import { getPackageBuildOptions } from './npm.js';
import { fromAsync, of } from '../rx/index.js';
import { readJson } from '../program/index.js';
import { buildOutputOptions } from './builder.js';
import { getDependencies } from './package.js';
import { parseTsConfig } from './tsc.js';
import type {
	CoverageSummary,
	TestCoverage,
} from '../spec-runner/report.js';
import type { Package } from './npm.js';

let browserRunner: string | undefined;

interface CoverageGate {
	blocks?: number;
}

function formatCoverage(value: number) {
	return `${value.toFixed(2)}%`;
}

export function enforceCoverageGate(
	coverage: CoverageSummary | undefined,
	gate: CoverageGate | undefined,
) {
	if (!gate) return;
	if (!coverage) throw new Error('Coverage gate failed: missing coverage');

	const failures: string[] = [];
	if (
		gate.blocks !== undefined &&
		coverage.blockCoveragePct < gate.blocks
	)
		failures.push(
			`blocks ${formatCoverage(coverage.blockCoveragePct)} < ${formatCoverage(gate.blocks)}`,
		);

	if (failures.length)
		throw new Error(`Coverage gate failed: ${failures.join(', ')}`);
}

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
		map[key] = `../../node_modules${map[key]}/index.js`;
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

function jsCoverageFile(path: string) {
	return extname(path) === '.js';
}

function getExpectedCoverageFiles(outputDir: string): TestCoverage[] {
	const parsed = parseTsConfig('tsconfig.json');
	const root = resolve(outputDir, '../../');
	const files = new Map<string, TestCoverage>();

	for (const fileName of parsed.fileNames) {
		for (const outFile of ts.getOutputFileNames(parsed, fileName, false)) {
			if (jsCoverageFile(outFile)) {
				const url = `/${relative(root, outFile).replace(/\\/g, '/')}`;
				const len = readFileSync(outFile, 'utf8').length;
				files.set(url, {
					url,
					functions: [
						{
							functionName: '',
							isBlockCoverage: true,
							ranges: [{ startOffset: 0, endOffset: len, count: 0 }],
						},
					],
				});
			}
		}
	}

	return [...files.values()].sort((a, b) => a.url.localeCompare(b.url));
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
		const { run: runSpec } = await import('../spec-runner/runner.js');
		const { default: printReportV2 } =
			await import('../spec-runner/report-stdout.js');

		const cwd = process.cwd();
		const pkgJson = await readJson<Package>('package.json');
		const rootPkg = await readJson<Package>('../package.json');
		const expectedCoverageFiles = getExpectedCoverageFiles(outputDir);
		try {
			process.chdir(outputDir);
			const report = await runSpec({
				node,
				mjs: true,
				vfsRoot: '../../',
				entryFile,
				expectedCoverageFiles,
				ignoreCoverage,
				baselinePath: `../../${appId}/spec`,
				reportPath: 'test-report.json',
				importmap: node
					? undefined
					: generateImportMap(rootPkg, pkgJson),
				sources: new Map(),
				log: console.log.bind(console),
			});
			printReportV2(report, buildOutputOptions());
			if (!report.success) throw new Error('Tests failed');
			if (!ignoreCoverage)
				enforceCoverageGate(
					report.summary.coverage,
					getPackageBuildOptions(rootPkg, pkgJson).coverage,
				);
		} finally {
			process.chdir(cwd);
		}
	}).ignoreElements();
}
