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
			});

			a.equal(report.coverage?.length, 1);
			a.equal(report.coverage?.[0]?.url, 'index.js');
			a.equal(report.summary.coverage?.blockCoveragePct, 75);
		});
	});
});
