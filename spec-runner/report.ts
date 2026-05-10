import type { JsonResult, FigureData } from '../spec/index.js';

export interface TestResult {
	success: boolean;
	failureMessage: string;
	message?: string;
	stack?: string;
	data?: FigureData;
}

export interface CoverageRange {
	startOffset: number;
	endOffset: number;
	count: number;
}

export interface TestReport {
	name: string;
	failureCount: number;
	testCount: number;
	results: TestResult[];
	tests: TestReport[];
	runTime: number;
	timeout: number;
}

export interface FunctionCoverage {
	functionName: string;
	ranges: CoverageRange[];
	isBlockCoverage: boolean;
}

export type Coverage = TestCoverage[];

export interface CoverageFunctionReport {
	functionName: string;
	blockTotal: number;
	blockCovered: number;
	blockCoveragePct: number;
	covered: boolean;
}

export interface CoverageSummary {
	fileTotal: number;
	functionTotal: number;
	functionCovered: number;
	functionCoveragePct: number;
	blockTotal: number;
	blockCovered: number;
	blockCoveragePct: number;
}

export interface ReportSummary {
	testTotal: number;
	failureCount: number;
	coverage?: CoverageSummary;
}

export interface Report {
	success: boolean;
	summary: ReportSummary;
	testReport: TestReport;
	coverage?: TestCoverageReport[];
}

export interface TestCoverage {
	url: string;
	functions: FunctionCoverage[];
}

export interface TestCoverageReport {
	url: string;
	functions: FunctionCoverage[];
	functionTotal?: number;
	functionCovered?: number;
	blockTotal: number;
	blockCovered: number;
	functionReports: CoverageFunctionReport[];
	functionCoveragePct: number;
	blockCoveragePct: number;
}

function calculateCoverage(coverage: TestCoverage[]) {
	const result: TestCoverageReport[] = [];

	for (const cov of coverage) {
		let functionTotal = 0;
		let functionCovered = 0;
		let blockTotal = 0;
		let blockCovered = 0;
		const functionReports: CoverageFunctionReport[] = [];

		for (const fnCov of cov.functions) {
			let functionBlockTotal = 0;
			let functionBlockCovered = 0;

			for (const range of fnCov.ranges) {
				const len = range.endOffset - range.startOffset;
				functionBlockTotal += len;
				blockTotal += len;
				if (range.count) {
					functionBlockCovered += len;
					blockCovered += len;
				}
			}

			const covered = functionBlockCovered > 0;
			functionTotal++;
			if (covered) functionCovered++;

			functionReports.push({
				functionName: fnCov.functionName,
				blockTotal: functionBlockTotal,
				blockCovered: functionBlockCovered,
				blockCoveragePct: functionBlockTotal
					? (functionBlockCovered / functionBlockTotal) * 100
					: 100,
				covered,
			});
		}

		result.push({
			url: cov.url,
			functions: cov.functions,
			functionReports,
			functionTotal,
			functionCovered,
			blockTotal,
			blockCovered,
			functionCoveragePct: functionTotal
				? (functionCovered / functionTotal) * 100
				: 100,
			blockCoveragePct: blockTotal ? (blockCovered / blockTotal) * 100 : 100,
		});
	}

	return result;
}

async function generateCoverageReport(coverage: Coverage) {
	const filtered: TestCoverage[] = [];
	const ignoreRegex = /\/node_modules\//;
	for (const script of coverage) {
		const url = script.url;
		if (!ignoreRegex.test(url)) {
			filtered.push({
				url: url,
				functions: script.functions,
			});
		}
	}

	return calculateCoverage(filtered);
}

function summarizeCoverage(
	coverage?: TestCoverageReport[],
): CoverageSummary | undefined {
	if (!coverage) return undefined;

	let functionTotal = 0;
	let functionCovered = 0;
	let blockTotal = 0;
	let blockCovered = 0;

	for (const cov of coverage) {
		functionTotal += cov.functionTotal ?? 0;
		functionCovered += cov.functionCovered ?? 0;
		blockTotal += cov.blockTotal;
		blockCovered += cov.blockCovered;
	}

	return {
		fileTotal: coverage.length,
		functionTotal,
		functionCovered,
		functionCoveragePct: functionTotal ? (functionCovered / functionTotal) * 100 : 100,
		blockTotal,
		blockCovered,
		blockCoveragePct: blockTotal ? (blockCovered / blockTotal) * 100 : 100,
	};
}

function renderTestReport(test: JsonResult): TestReport {
	if (test.skipped)
		return {
			name: test.name,
			failureCount: 0,
			testCount: 0,
			results: [],
			tests: [],
			runTime: test.runTime,
			timeout: test.timeout,
		};

	let failureCount = 0;
	let testCount = 1;

	const results: TestResult[] = test.results.map(r => {
		if (r.success === false) failureCount++;

		return {
			message: r.message,
			failureMessage: r.failureMessage,
			success: r.success,
			data: r.data,
			stack: r.stack,
		};
	});

	const tests = (test.only.length ? test.only : test.tests).map(child => {
		const result = renderTestReport(child);
		failureCount += result.failureCount;
		testCount += result.testCount;
		return result;
	});

	if (results.length === 0 && test.tests.length === 0) {
		failureCount++;
		results.push({ success: false, failureMessage: 'No assertions found' });
	}

	return {
		name: test.name,
		failureCount,
		testCount,
		results,
		tests,
		runTime: test.runTime,
		timeout: test.timeout,
	};
}

export async function generateReport(
	suite: JsonResult,
	v8Coverage?: Coverage,
): Promise<Report> {
	const testReport = renderTestReport(suite);
	const coverage = v8Coverage && (await generateCoverageReport(v8Coverage));
	return {
		success: testReport.failureCount === 0,
		summary: {
			testTotal: testReport.testCount,
			failureCount: testReport.failureCount,
			coverage: summarizeCoverage(coverage),
		},
		testReport,
		coverage,
	};
}
