import { existsSync, readFileSync } from 'fs';
import { writeFile } from 'fs/promises';
import { join, relative, resolve } from 'path';
import { getPackageBuildOptions } from './npm.js';
import { fromAsync, of } from '@cxl/rx';
import { readJson } from '@cxl/program';
import { buildOutputOptions } from './builder.js';
import { getDependencies } from './package.js';
import { parseTsConfig } from './tsc.js';
import type { CoverageSummary } from '@cxl/spec-runner/report.js';
import { parseGrep } from '@cxl/spec-runner/grep.js';
import type { Package } from './npm.js';
import { getExpectedCoverageFiles } from './coverage.js';

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
	rootPkg: Package,
	pkgJson: Package,
	importMapRoot: string,
) {
	const map = getDependencies(rootPkg, pkgJson);
	for (const key in map) {
		map[`${key}/`] = formatImportMapPrefix(
			importMapRoot,
			resolve('../node_modules', key),
			true,
		);
	}

	Object.assign(map, generateTsconfigImportMap(importMapRoot, true));
	if (rootPkg.importmap) Object.assign(map, rootPkg.importmap);
	return JSON.stringify({ imports: map });
}

function generateNodeImportMap(rootPkg: Package) {
	return JSON.stringify({ imports: rootPkg.importmap ?? {} });
}

function formatImportMapPrefix(
	importMapRoot: string,
	target: string,
	rooted: boolean,
) {
	const path = relative(importMapRoot, target).replace(/\\/g, '/');
	if (rooted) {
		if (path === '..' || path.startsWith('../')) return '';
		return `/${path}/`;
	}
	return `${path.startsWith('.') ? path : `./${path}`}/`;
}

function getPathsBasePath(options: object) {
	if ('baseUrl' in options && typeof options.baseUrl === 'string')
		return options.baseUrl;
	if ('pathsBasePath' in options && typeof options.pathsBasePath === 'string')
		return options.pathsBasePath;
}

function generateTsconfigImportMap(importMapRoot: string, rooted: boolean) {
	const map: Record<string, string> = {};
	if (!existsSync('tsconfig.json')) return map;
	const { options } = parseTsConfig('tsconfig.json');
	const basePath = getPathsBasePath(options) ?? process.cwd();
	const paths = options.paths;
	for (const [key, targets] of Object.entries(paths ?? {})) {
		if (key.indexOf('*') !== key.length - 1 || !key.endsWith('/*'))
			continue;
		if (targets.length !== 1) continue;
		const target = targets[0]?.replace(/\\/g, '/');
		if (
			!target?.endsWith('/*') ||
			target.indexOf('*') !== target.length - 1
		)
			continue;
		const targetDir = resolve(basePath, target.slice(0, -1));
		const targetParts = targetDir.replace(/\\/g, '/').split('/');
		const nodeModulesIndex = targetParts.lastIndexOf('node_modules');
		const modulePath = targetParts.slice(nodeModulesIndex + 1);
		if (
			nodeModulesIndex === -1 ||
			modulePath.length === 0 ||
			modulePath[0] === '@types'
		)
			continue;
		const prefix = formatImportMapPrefix(importMapRoot, targetDir, rooted);
		if (prefix) map[key.slice(0, -1)] = prefix;
	}
	return map;
}

function generateTestImportMap(
	rootPkg: Package,
	pkgJson: Package,
	outputDir: string,
) {
	const map = getDependencies(rootPkg, pkgJson);
	const nodeModulesDir = resolve('../node_modules');

	for (const key in map) {
		const prefix = formatImportMapPrefix(
			outputDir,
			resolve(nodeModulesDir, key),
			false,
		);
		map[`${key}/`] = prefix;
		map[key] = `${prefix}index.js`;
	}
	map['@cxl/spec'] = `${formatImportMapPrefix(
		outputDir,
		resolve(nodeModulesDir, '@cxl/spec'),
		false,
	)}index.js`;
	Object.assign(map, generateTsconfigImportMap(outputDir, false));
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
	const outputDir = existsSync('tsconfig.json')
		? parseTsConfig('tsconfig.json').options.outDir
		: undefined;
	return of({
		path: outFile,
		source: generateEsmTestFile(
			appId,
			pkgJson.name,
			testFile,
			generateTestImportMap(
				rootPkg,
				pkgJson,
				resolve(outputDir ?? `../dist/${appId}`),
			),
		),
	});
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
		const { run: runSpec } = await import('@cxl/spec-runner/runner.js');
		const { writeReport } = await import('@cxl/spec-runner/report.js');
		const { default: printReportV2 } =
			await import('@cxl/spec-runner/report-stdout.js');

		const cwd = process.cwd();
		const pkgJson = await readJson<Package>('package.json');
		const rootPkg = await readJson<Package>('../package.json');
		const ignoreTestCoverage = ignoreCoverage || !!grep;
		const importmap = node
			? generateNodeImportMap(rootPkg)
			: generateImportMap(rootPkg, pkgJson, resolve(outputDir, '../../'));
		const { verbose } = buildOutputOptions();
		const build = getPackageBuildOptions(rootPkg, pkgJson);
		const expectedCoverageFiles = ignoreTestCoverage
			? undefined
			: getExpectedCoverageFiles(outputDir, rootPkg, pkgJson);
		const reportPath = 'test-report.json';
		const documentPath = 'test-report.html';
		try {
			process.chdir(outputDir);
			const report = await runSpec({
				node,
				verbose,
				mjs: true,
				vfsRoot: '../../',
				entryFile,
				expectedCoverageFiles,
				ignoreCoverage: ignoreTestCoverage,
				grep: parseGrep(grep),
				baselinePath: `../../${appId}/spec`,
				reportPath,
				documentPath,
				importmap,
				sources: new Map(),
				log: console.log.bind(console),
			});
			printReportV2(report, buildOutputOptions());
			await writeReport(reportPath, report);
			if (!report.success) throw new Error('Tests failed');
			if (!ignoreTestCoverage)
				enforceCoverageGate(
					report.summary.coverage,
					build.coverage,
				);
		} finally {
			process.chdir(cwd);
		}
	}).ignoreElements();
}

export function runBenchmarks({
	appId,
	outputDir,
	node,
}: {
	appId: string;
	outputDir: string;
	node: boolean;
}) {
	return fromAsync(async () => {
		if (!existsSync(resolve(outputDir, 'test-benchmark.js'))) return;
		const { run: runSpec } = await import('@cxl/spec-runner/runner.js');
		const { default: printReport } =
			await import('@cxl/spec-runner/report-stdout.js');

		const cwd = process.cwd();
		const pkgJson = await readJson<Package>('package.json');
		const rootPkg = await readJson<Package>('../package.json');
		const importmap = node
			? generateNodeImportMap(rootPkg)
			: generateImportMap(rootPkg, pkgJson, resolve(outputDir, '../../'));
		const { verbose } = buildOutputOptions();
		try {
			process.chdir(outputDir);
			const report = await runSpec({
				node,
				verbose,
				mjs: true,
				vfsRoot: '../../',
				entryFile: './test-benchmark.js',
				ignoreCoverage: true,
				updateBaselines: false,
				baselinePath: `../../${appId}/spec`,
				reportPath: 'benchmark-report.json',
				importmap,
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
