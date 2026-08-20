import { spec } from '../spec/index.js';
import type {
	BenchmarkData,
	JsonResult,
} from '../spec/index.js';
import browserRunner from './runner-puppeteer.js';
import { Coverage, generateReport } from './report.js';
import { processBenchmarks } from './benchmark.js';
import { run } from './runner.js';
import { mkdtemp, readFile, rm } from 'fs/promises';
import { execFile } from 'child_process';
import { tmpdir } from 'os';
import { join } from 'path';

function runCli(args: string[]) {
	return new Promise<string>((resolve, reject) => {
		execFile(
			process.execPath,
			[join(import.meta.dirname, 'index.js'), ...args],
			{ cwd: import.meta.dirname },
			(error, stdout) => (error ? reject(error) : resolve(stdout)),
		);
	});
}

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

const benchmarkOptions = {
	warmup: 0,
	sampleTime: 1,
	samples: 3,
	maxRegression: 10,
};

function benchmarkSuite(median: number, sampleTime = 1): JsonResult {
	const data: BenchmarkData = {
		type: 'benchmark',
		iterations: 10,
		values: [median, median, median],
		median,
		mad: 0,
		p75: median,
		p95: median,
		operationsPerSecond: 1000 / median,
		options: { ...benchmarkOptions, sampleTime },
	};
	return {
		name: 'suite',
		results: [],
		tests: [
			{
				name: 'case',
				results: [
					{
						success: true,
						failureMessage: 'Benchmark completed',
						data,
					},
				],
				tests: [],
				only: [],
				runTime: 0,
				timeout: 1000,
			},
		],
		only: [],
		runTime: 0,
		timeout: 1000,
	};
}

const environment = {
	browser: 'Chrome/1',
	platform: 'test',
	architecture: 'arm64',
	cpu: 'cpu-a',
	gpu: 'gpu-a',
	profile: 'default',
};

export default spec('tester', s => {
	s.test('browser console output', async a => {
		const dir = await mkdtemp(join(tmpdir(), 'cxl-spec-runner-'));
		try {
			const args = [
				'./test-console-fixture.js',
				'--ignoreCoverage',
				'--vfsRoot',
				'..',
				'--reportPath',
				join(dir, 'report.json'),
			];
			const stdout = await runCli(args);
			a.equal(stdout.trim(), 'tests: passed (2)');
			const verboseStdout = await runCli([...args, '--verbose']);
			a.equal(verboseStdout.includes('browser console output'), true);
		} finally {
			await rm(dir, { recursive: true, force: true });
		}
	});

	s.test('browser-runner', a => {
		a.ok(browserRunner);
	});

	s.test('browser binary static-file execution', async a => {
		a.setTimeout(60000);
		const report = await run({
			node: false,
			mjs: true,
			entryFile: './test-binary-fixture.js',
			vfsRoot: '../../',
			ignoreCoverage: true,
			updateBaselines: false,
			reportPath: 'binary-report.json',
			sources: new Map(),
			log: console.log.bind(console),
		});
		a.equal(report.success, true);
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

	s.test('benchmark baselines', async a => {
		const dir = await mkdtemp(join(tmpdir(), 'cxl-benchmark-'));
		try {
			await processBenchmarks(benchmarkSuite(1), environment, dir);
			await processBenchmarks(
				benchmarkSuite(2),
				{ ...environment, cpu: 'cpu-b' },
				dir,
			);
			const baseline = JSON.parse(
				await readFile(join(dir, 'benchmark.json'), 'utf8'),
			) as { environments: Record<string, unknown> };
			a.equal(Object.keys(baseline.environments).length, 2);

			const regressionSuite = benchmarkSuite(2);
			const regression = await processBenchmarks(
				regressionSuite,
				environment,
				dir,
			);
			a.equal(
				regression?.benchmarks['suite > case']?.comparison.status,
				'regressed',
			);
			a.equal(regressionSuite.tests[0]?.results[0]?.success, false);

			const incompatible = await processBenchmarks(
				benchmarkSuite(1, 2),
				environment,
				dir,
			);
			a.equal(
				incompatible?.benchmarks['suite > case']?.comparison.status,
				'incompatible',
			);
		} finally {
			await rm(dir, { recursive: true, force: true });
		}
	});

	s.test('browser benchmark execution', async a => {
		a.setTimeout(60000);
		const dir = await mkdtemp(join(tmpdir(), 'cxl-benchmark-browser-'));
		try {
			const report = await run({
				node: false,
				mjs: true,
				entryFile: './test-benchmark-fixture.js',
				vfsRoot: '../',
				ignoreCoverage: true,
				updateBaselines: false,
				baselinePath: dir,
				reportPath: 'benchmark-report.json',
				sources: new Map(),
				log: console.log.bind(console),
			});
			a.equal(report.success, true);
			a.equal(Object.keys(report.benchmark?.benchmarks ?? {}).length, 2);
		} finally {
			await rm(dir, { recursive: true, force: true });
		}
	});

	s.test('browser drag execution', async a => {
		a.setTimeout(60000);
		const report = await run({
			node: false,
			mjs: true,
			entryFile: './test-drag-fixture.js',
			vfsRoot: '../',
			ignoreCoverage: true,
			updateBaselines: false,
			reportPath: 'drag-report.json',
			sources: new Map(),
			log: console.log.bind(console),
		});
		a.equal(report.success, true);
	});

	s.test('browser keyboard execution', async a => {
		a.setTimeout(60000);
		const report = await run({
			node: false,
			mjs: true,
			entryFile: './test-keyboard-fixture.js',
			vfsRoot: '../',
			ignoreCoverage: true,
			updateBaselines: false,
			reportPath: 'keyboard-report.json',
			sources: new Map(),
			log: console.log.bind(console),
		});
		a.equal(report.success, true);
	});
});
