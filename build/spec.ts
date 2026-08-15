import { existsSync, readFileSync } from 'fs';
import { writeFile } from 'fs/promises';
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
import { parseGrep } from '../spec-runner/grep.js';
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
	if (gate.blocks !== undefined) {
		if (coverage.blockCoveragePct < gate.blocks)
			failures.push(
				`blocks ${formatCoverage(coverage.blockCoveragePct)} < ${formatCoverage(gate.blocks)}`,
			);
		else if (coverage.blockCoveragePct - gate.blocks > 1)
			failures.push(
				`blocks gate ${formatCoverage(gate.blocks)} is more than 1% below actual ${formatCoverage(coverage.blockCoveragePct)}`,
			);
	}

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
<script type="text/plain" id="spec-browser-runner">
	${(browserRunner ??= readFileSync(
		join(import.meta.dirname, 'spec-browser.js'),
		'utf8',
	))}
	new BrowserRunner({
		testFile: new URL('${testFile}', import.meta.url).href,
		baselinePath: '../../${dirName}/spec',
	}).run()
</script>
<script type="module">
	const params = new URLSearchParams(location.hash.slice(1));
	const testFile = params.get('__cxlSpecBrowserFile');
	if (testFile) {
		window.__cxlRunner = data => parent.__cxlRunner(data);
		try {
			const suite = (await import(testFile)).default;
			await suite.run(
				undefined,
				params.get('__cxlSpecBrowserTarget') || undefined,
			);
			parent.postMessage(
				{ type: 'spec-browser-result', result: suite.toJSON() },
				location.origin,
			);
		} catch (e) {
			parent.postMessage(
				{ type: 'spec-browser-result', error: String(e) },
				location.origin,
			);
		}
	} else {
		const source = document.querySelector('#spec-browser-runner')?.textContent;
		if (!source) throw new Error('Missing browser runner');
		const script = document.createElement('script');
		script.type = 'module';
		script.textContent = source;
		document.head.append(script);
	}
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
	grep,
}: {
	appId: string;
	outputDir: string;
	node?: boolean;
	entryFile?: string;
	ignoreCoverage?: boolean;
	grep?: string;
}) {
	return fromAsync(async () => {
		const { run: runSpec } = await import('../spec-runner/runner.js');
		const { default: printReportV2 } =
			await import('../spec-runner/report-stdout.js');

		const cwd = process.cwd();
		const pkgJson = await readJson<Package>('package.json');
		const rootPkg = await readJson<Package>('../package.json');
		const ignoreTestCoverage = ignoreCoverage || !!grep;
		const expectedCoverageFiles = ignoreTestCoverage
			? undefined
			: getExpectedCoverageFiles(outputDir);
		try {
			process.chdir(outputDir);
			const report = await runSpec({
				node,
				mjs: true,
				vfsRoot: '../../',
				entryFile,
				expectedCoverageFiles,
				ignoreCoverage: ignoreTestCoverage,
				grep: parseGrep(grep),
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
			if (!ignoreTestCoverage)
				enforceCoverageGate(
					report.summary.coverage,
					getPackageBuildOptions(rootPkg, pkgJson).coverage,
				);
		} finally {
			process.chdir(cwd);
		}
	}).ignoreElements();
}

export function runBenchmarks({
	appId,
	outputDir,
}: {
	appId: string;
	outputDir: string;
}) {
	return fromAsync(async () => {
		if (!existsSync(resolve(outputDir, 'test-benchmark.js'))) return;
		const { run: runSpec } = await import('../spec-runner/runner.js');
		const { default: printReport } =
			await import('../spec-runner/report-stdout.js');

		const cwd = process.cwd();
		const pkgJson = await readJson<Package>('package.json');
		const rootPkg = await readJson<Package>('../package.json');
		try {
			process.chdir(outputDir);
			const report = await runSpec({
				node: false,
				mjs: true,
				vfsRoot: '../../',
				entryFile: './test-benchmark.js',
				ignoreCoverage: true,
				updateBaselines: false,
				baselinePath: `../../${appId}/spec`,
				reportPath: 'benchmark-report.json',
				importmap: generateImportMap(rootPkg, pkgJson),
				sources: new Map(),
				log: console.log.bind(console),
			});
			printReport(report, buildOutputOptions());
			await writeFile('benchmark-report.json', JSON.stringify(report, null, 2));
			if (!report.success) throw new Error('Benchmarks failed');
		} finally {
			process.chdir(cwd);
		}
	}).ignoreElements();
}
