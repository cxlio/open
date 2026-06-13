import { colors } from '../program/index.js';

import {
	Report,
	TestReport,
	TestResult,
	TestCoverageReport,
} from './report.js';

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

function collectFailures(
	test: TestReport,
	parentPath: string,
	out: { path: string; message: string; stack?: string }[],
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
	const failures: { path: string; message: string; stack?: string }[] = [];
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

export default function (report: Report) {
	if (report.coverage) printCoverage(report.coverage);
	printTest(report.testReport);
	const failures = printFailureSummary(report);
	if (!failures) printSuccessSummary();
}
