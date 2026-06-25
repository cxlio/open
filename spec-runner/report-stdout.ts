import { colors } from '../program/index.js';

import {
	Report,
	CoverageSummary,
	TestReport,
	TestResult,
	TestCoverageReport,
} from './report.js';

export interface ReportOptions {
	verbose: boolean;
}

interface FailureSummary {
	path: string;
	message: string;
	stack?: string;
}

function printError(name: string, fail: TestResult) {
	const msg = fail.message ?? fail.failureMessage ?? 'Unknown failure';
	console.error(name, colors.red(msg));
	if (fail.stack) console.error(fail.stack);
}

function printTest(test: TestReport) {
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
	failures.forEach(fail => printError(test.name, fail));
	test.tests.forEach(printTest);
	console.groupEnd();

	return failures;
}

function printCoverage(coverage: TestCoverageReport[]) {
	console.log('Coverage Report:');
	for (const cov of coverage.sort((a, b) => (a.url > b.url ? 1 : -1))) {
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
				message: r.message ?? r.failureMessage ?? 'Unknown failure',
				stack: r.stack,
			});
	}
	for (const child of test.tests) collectFailures(child, path, out);
}

function printFailureSummary(report: Report): number {
	const failures: FailureSummary[] = [];
	collectFailures(report.testReport, '', failures);
	if (!failures.length) return 0;
	console.error(colors.red(`\nFailures (${failures.length}):`));
	for (const f of failures) {
		console.error(colors.red(`✗ ${f.path}`));
		console.error(`  ${f.message.replace(/\n/g, '\n  ')}`);
	}
	return failures.length;
}

function printSuccessSummary(): void {
	console.log(colors.green(`\nAll tests passed.`));
}

function printVerboseReport(report: Report) {
	if (report.coverage) {
		printCoverage(report.coverage);
		if (report.summary.coverage)
			printCoverageSummary(report.summary.coverage);
	}
	printTest(report.testReport);
	const failures = printFailureSummary(report);
	if (!failures) printSuccessSummary();
}

function printDefaultFailures(failures: FailureSummary[]): void {
	console.error(`tests: failed (${failures.length})`);
	for (const failure of failures) {
		console.error(`${failure.path}: ${failure.message.replace(/\n/g, ' ')}`);
		if (failure.stack) console.error(failure.stack);
	}
}

function printDefaultReport(report: Report): void {
	const failures: FailureSummary[] = [];
	collectFailures(report.testReport, '', failures);
	if (failures.length) {
		printDefaultFailures(failures);
		return;
	}
	console.log(`tests: passed (${report.summary.testTotal})`);
}

export default function (report: Report, options: ReportOptions) {
	if (options.verbose) printVerboseReport(report);
	else printDefaultReport(report);
}
