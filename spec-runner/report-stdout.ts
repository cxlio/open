import { colors } from '../program/index.js';

import {
	Report,
	TestReport,
	TestResult,
	TestCoverageReport,
} from './report.js';

function printError(name: string, fail: TestResult) {
	const msg = fail.failureMessage;
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

	console.group(
		`${test.name} ${colors[timeColor](
			`(${test.runTime.toFixed(2)} ms)`,
		)} ${out}`,
	);
	failures.forEach(fail => printError(test.name, fail));
	test.tests.forEach(printTest);
	console.groupEnd();

	return failures;
}

function printCoverage(coverage: TestCoverageReport[]) {
	console.log('Coverage Report:');
	for (const cov of coverage) {
		const pct = ((cov.blockCovered / cov.blockTotal) * 100).toFixed(2);
		console.log(
			`${cov.url}: ${pct}% (${cov.blockTotal}/${cov.blockCovered})`,
		);
	}
}

export default function generate(report: Report) {
	if (report.coverage) printCoverage(report.coverage);
	printTest(report.testReport);
}
