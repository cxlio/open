import { spec } from '../spec/index.js';
import browserRunner from './runner-puppeteer.js';
import { Coverage, generateReport } from './report.js';

const suite = {
	name: 'suite',
	failureCount: 0,
	testCount: 1,
	results: [
		{
			success: true,
			failureMessage: '',
		},
	],
	tests: [],
	only: [],
	runTime: 0,
	timeout: 1000,
};

export default spec('tester', s => {
	s.test('browser-runner', a => {
		a.ok(browserRunner);
	});

	s.test('coverage', it => {
		const coverage: Coverage = [
			{
				url: 'index.js',
				functions: [
					{
						functionName: '',
						isBlockCoverage: true,
						ranges: [
							{ startOffset: 0, endOffset: 75, count: 1 },
							{ startOffset: 75, endOffset: 100, count: 0 },
						],
					},
					{
						functionName: 'unused',
						isBlockCoverage: true,
						ranges: [{ startOffset: 100, endOffset: 120, count: 0 }],
					},
				],
			},
			{
				url: 'test.js',
				functions: [
					{
						functionName: '',
						isBlockCoverage: true,
						ranges: [{ startOffset: 0, endOffset: 100, count: 1 }],
					},
				],
			},
		];

		it.should('exclude test entry from coverage summary', async a => {
			const report = await generateReport(suite, coverage, {
				entryFile: './test.js',
				expectedCoverageFiles: [
					{
						url: 'index.js',
						functions: [],
					},
					{
						url: 'missing.js',
						functions: [
							{
								functionName: '',
								isBlockCoverage: true,
								ranges: [
									{ startOffset: 0, endOffset: 80, count: 0 },
								],
							},
						],
					},
					{
						url: 'test.js',
						functions: [
							{
								functionName: '',
								isBlockCoverage: true,
								ranges: [
									{ startOffset: 0, endOffset: 100, count: 0 },
								],
							},
						],
					},
				],
			});

			a.equal(report.coverage?.length, 2);
			a.equal(report.coverage?.[0]?.url, 'index.js');
			a.equal(report.coverage?.[1]?.url, 'missing.js');
			a.equal(report.summary.coverage?.blockCoveragePct, 37.5);
			a.equal(report.summary.coverage?.functionCoveragePct, 33.33333333333333);
		});
	});
});
