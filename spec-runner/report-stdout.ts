import { colors } from '../program/index.js';

import type {
	Report,
	CoverageSummary,
	TestReport,
	TestResult,
	TestCoverageReport,
} from './report.js';

export interface ReportOptions {
	verbose: boolean;
	failurePage?: number;
	allFailures?: boolean;
}

interface FailureSummary {
	path: string;
	message: string;
	stack?: string;
	result: TestResult;
}

interface FailurePage {
	all: FailureSummary[];
	visible: FailureSummary[];
	page: number;
}

const FAILURE_PAGE_SIZE = 5;

function printError(name: string, fail: TestResult) {
	const msg = fail.message ?? fail.failureMessage;
	console.error(name, colors.red(msg));
	if (fail.stack) console.error(fail.stack);
}

function printTest(test: TestReport, visibleFailures: ReadonlySet<TestResult>) {
	let out = '';

	const failures = test.results.filter(result => {
		out += result.success ? colors.green('.') : colors.red('X');
		return result.success === false;
	});
	const timeColor =
		test.runTime > test.timeout
			? 'brightYellow'
			: test.runTime > test.timeout / 2
				? 'yellow'
				: 'gray';
	console[failures.length > 0 ? 'error' : 'log'](
		`${test.name} ${colors[timeColor](
			`(${test.runTime.toFixed(2)} ms)`,
		)} ${out}`,
	);
	console.group();
	failures
		.filter(fail => visibleFailures.has(fail))
		.forEach(fail => printError(test.name, fail));
	test.tests.forEach(child => printTest(child, visibleFailures));
	console.groupEnd();

	return failures;
}

function printCoverage(coverage: TestCoverageReport[]) {
	console.log('Coverage Report:');
	coverage.sort((a, b) => (a.url > b.url ? 1 : -1));
	for (const cov of coverage) {
		const blockPct = cov.blockCoveragePct.toFixed(2);
		const functionPct = cov.functionCoveragePct.toFixed(2);
		console.log(
			`${cov.url}: blocks ${blockPct}% (${cov.blockCovered}/${cov.blockTotal}), functions ${functionPct}% (${cov.functionCovered}/${cov.functionTotal})`,
		);
	}
}

function printCoverageSummary(coverage: CoverageSummary) {
	const blockPct = coverage.blockCoveragePct.toFixed(2);
	const functionPct = coverage.functionCoveragePct.toFixed(2);
	console.log(
		`Average: blocks ${blockPct}% (${coverage.blockCovered}/${coverage.blockTotal}), functions ${functionPct}% (${coverage.functionCovered}/${coverage.functionTotal})`,
	);
}

function collectFailures(
	test: TestReport,
	parentPath: string,
	out: FailureSummary[],
): void {
	const path = parentPath ? `${parentPath} > ${test.name}` : test.name;
	for (const r of test.results) {
		if (!r.success)
			out.push({
				path,
				message: r.message ?? r.failureMessage,
				stack: r.stack,
				result: r,
			});
	}
	for (const child of test.tests) collectFailures(child, path, out);
}

function getFailurePage(report: Report, options: ReportOptions): FailurePage {
	const failures: FailureSummary[] = [];
	collectFailures(report.testReport, '', failures);
	if (options.allFailures || failures.length <= FAILURE_PAGE_SIZE)
		return { all: failures, visible: failures, page: 1 };
	const pageCount = Math.ceil(failures.length / FAILURE_PAGE_SIZE);
	const page = Math.min(options.failurePage ?? 1, pageCount);
	const start = (page - 1) * FAILURE_PAGE_SIZE;
	return {
		all: failures,
		visible: failures.slice(start, start + FAILURE_PAGE_SIZE),
		page,
	};
}

function printPagination(page: FailurePage): void {
	if (page.visible.length === page.all.length) return;
	const first = (page.page - 1) * FAILURE_PAGE_SIZE + 1;
	const last = first + page.visible.length - 1;
	const pageCount = Math.ceil(page.all.length / FAILURE_PAGE_SIZE);
	const targetPage = page.page < pageCount ? page.page + 1 : page.page - 1;
	console.error(
		`Showing failures ${first}–${last} of ${page.all.length}. Use --failurePage ${targetPage} or --allFailures.`,
	);
}

function printFailureSummary(page: FailurePage): number {
	if (!page.all.length) return 0;
	console.error(colors.red(`\nFailures (${page.all.length}):`));
	for (const f of page.visible) {
		console.error(colors.red(`✗ ${f.path}`));
		console.error(`  ${f.message.replace(/\n/g, '\n  ')}`);
	}
	printPagination(page);
	return page.all.length;
}

function printSuccessSummary(): void {
	console.log(colors.green(`\nAll tests passed.`));
}

function printVerboseReport(report: Report, options: ReportOptions) {
	if (report.coverage) {
		printCoverage(report.coverage);
		if (report.summary.coverage)
			printCoverageSummary(report.summary.coverage);
	}
	const page = getFailurePage(report, options);
	printTest(
		report.testReport,
		new Set(page.visible.map(failure => failure.result)),
	);
	const failures = printFailureSummary(page);
	if (!failures) printSuccessSummary();
}

function printDefaultFailures(page: FailurePage): void {
	console.error(`tests: failed (${page.all.length})`);
	for (const failure of page.visible) {
		console.error(`${failure.path}: ${failure.message.replace(/\n/g, ' ')}`);
		if (failure.stack) console.error(failure.stack);
	}
	printPagination(page);
}

function printDefaultReport(report: Report, options: ReportOptions): void {
	const page = getFailurePage(report, options);
	if (page.all.length) {
		printDefaultFailures(page);
		return;
	}
	console.log(`tests: passed (${report.summary.testTotal})`);
}

function formatBenchmarkTime(value: number) {
	if (value < 0.001) return `${(value * 1_000_000).toFixed(2)} ns/op`;
	if (value < 1) return `${(value * 1000).toFixed(2)} µs/op`;
	return `${value.toFixed(2)} ms/op`;
}

function printBenchmarks(report: Report) {
	if (!report.benchmark) return;
	for (const [name, value] of Object.entries(report.benchmark.benchmarks)) {
		const variation = value.median ? (value.mad / value.median) * 100 : 0;
		const change =
			value.comparison.change === undefined
				? ''
				: `, ${value.comparison.change >= 0 ? '+' : ''}${value.comparison.change.toFixed(2)}%`;
		console.log(
			`${name}: ${formatBenchmarkTime(value.median)}, p95 ${formatBenchmarkTime(value.p95)}, ±${variation.toFixed(2)}% (${value.values.length} samples, ${value.comparison.status}${change})`,
		);
	}
}

export default function (report: Report, options: ReportOptions) {
	if (options.verbose) printVerboseReport(report, options);
	else printDefaultReport(report, options);
	printBenchmarks(report);
}
