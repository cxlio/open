import { spec } from '../spec/index.js';
import type { BenchmarkData, JsonResult } from '../spec/index.js';
import browserRunner, { ProxyManager } from './runner-puppeteer.js';
import { type Coverage, generateReport } from './report.js';
import { processBenchmarks } from './benchmark.js';
import { run } from './runner.js';
import {
	renderSpecificationDocument,
	specificationCss,
} from './specification.js';
import { mkdtemp, readFile, rm, writeFile } from 'fs/promises';
import { execFile } from 'child_process';
import { createServer } from 'http';
import { tmpdir } from 'os';
import { join } from 'path';

function assertPortAvailable(port: number) {
	const server = createServer();
	return new Promise<void>((resolve, reject) => {
		server.once('error', reject);
		server.listen(port, '127.0.0.1', () => {
			server.close(error => (error ? reject(error) : resolve()));
		});
	});
}

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

function runFailingCli(args: string[]) {
	return new Promise<{ stdout: string; stderr: string }>(resolve => {
		execFile(
			process.execPath,
			[join(import.meta.dirname, 'index.js'), ...args],
			{ cwd: import.meta.dirname },
			(_error, stdout, stderr) => resolve({ stdout, stderr }),
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

function expectedCoverage(files: string[]) {
	return Promise.all(
		files.map(async file => ({
			url: `/spec-runner/${file}`,
			functions: [
				{
					functionName: '',
					isBlockCoverage: true,
					ranges: [
						{
							startOffset: 0,
							endOffset: (await readFile(file, 'utf8')).length,
							count: 0,
						},
					],
				},
			],
		})),
	);
}

export default spec('tester', s => {
	s.test('service worker module import', async a => {
		const files = ['service-worker.js', 'service-worker-dependency.js'];
		const expectedCoverageFiles = await expectedCoverage(files);
		const report = await browserRunner({
			entryFile: './test-service-worker-fixture.js',
			expectedCoverageFiles,
			ignoreCoverage: false,
			mjs: true,
			node: false,
			updateBaselines: false,
			reportPath: 'test-report.json',
			vfsRoot: '..',
			sources: new Map(),
			log: () => {},
		});
		a.ok(report.success);
		a.equal(report.summary.coverage?.fileTotal, 2);
		for (const coverage of report.coverage ?? [])
			a.ok(coverage.blockCovered > 0, coverage.url);
	});

	s.test('shared worker dynamic import', async a => {
		const files = ['shared-worker.js', 'shared-worker-dependency.js'];
		const expectedCoverageFiles = await expectedCoverage(files);
		const report = await browserRunner({
			entryFile: './test-shared-worker-fixture.js',
			expectedCoverageFiles,
			ignoreCoverage: false,
			mjs: true,
			node: false,
			updateBaselines: false,
			reportPath: 'test-report.json',
			vfsRoot: '..',
			sources: new Map(),
			log: () => {},
		});
		a.ok(report.success);
		a.equal(report.summary.coverage?.fileTotal, 2);
		for (const coverage of report.coverage ?? [])
			a.ok(coverage.blockCovered > 0, coverage.url);
	});

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
				'--documentPath',
				join(dir, 'report.html'),
			];
			const stdout = await runCli(args);
			a.equal(
				stdout.trim(),
				`generated: ${join(dir, 'report.html')}\ntests: passed (2)\ngenerated: ${join(dir, 'report.json')}`,
			);
			const document = await readFile(join(dir, 'report.html'), 'utf8');
			a.ok(document.includes('<c-page><c-layout'));
			a.ok(document.includes('Specification: console fixture'));
			const verboseStdout = await runCli([...args, '--verbose']);
			a.equal(verboseStdout.includes('browser console output'), true);
		} finally {
			await rm(dir, { recursive: true, force: true });
		}
	});

	s.test('node console output', async a => {
		const dir = await mkdtemp(join(tmpdir(), 'cxl-spec-runner-'));
		try {
			const fixturePath = join(dir, 'console-fixture.mjs');
			const specUrl = new URL('../spec/index.js', import.meta.url).href;
			await writeFile(
				fixturePath,
				`import { execFileSync } from 'node:child_process';
import { spec } from ${JSON.stringify(specUrl)};
console.log('node console output');
try {
	execFileSync(process.execPath, ['--eval', 'process.stderr.write("node child stderr\\\\n"); process.exit(1)']);
} catch {}
export default spec('console fixture', s => s.test('passes', a => a.ok(true)));`,
			);
			const args = [
				fixturePath,
				'--node',
				'--ignoreCoverage',
				'--reportPath',
				join(dir, 'report.json'),
			];
			const output = await runFailingCli(args);
			a.equal(output.stdout.includes('node console output'), false);
			a.equal(output.stderr.includes('node child stderr'), false);
			const verbose = await runFailingCli([...args, '--verbose']);
			a.equal(verbose.stdout.includes('node console output'), true);
			a.equal(verbose.stderr.includes('node child stderr'), true);
		} finally {
			await rm(dir, { recursive: true, force: true });
		}
	});

	s.test('failure pagination', async a => {
		const dir = await mkdtemp(join(tmpdir(), 'cxl-spec-runner-'));
		try {
			const fixturePath = join(dir, 'failure-fixture.mjs');
			const specUrl = new URL('../spec/index.js', import.meta.url).href;
			await writeFile(
				fixturePath,
				`import { spec } from ${JSON.stringify(specUrl)};
export default spec('failure fixture', s => {
	const count = process.argv.includes('--fiveFailures') ? 5 : 7;
	for (let i = 1; i <= count; i++) s.test(\`case \${i}\`, a => a.ok(false, \`failure \${i}\`));
});`,
			);
			const args = [
				fixturePath,
				'--node',
				'--ignoreCoverage',
				'--reportPath',
				join(dir, 'report.json'),
				'--documentPath',
				join(dir, 'report.html'),
			];
			const firstPage = await runFailingCli(args);
			a.ok(firstPage.stderr.includes('tests: failed (7)'));
			a.ok(firstPage.stderr.includes('case 1: failure 1'));
			a.ok(firstPage.stderr.includes('case 5: failure 5'));
			a.equal(firstPage.stderr.includes('failure 6'), false);
			a.ok(
				firstPage.stderr.includes(
					'Showing failures 1–5 of 7. Use --failurePage 2 or --allFailures.',
				),
			);

			const secondPage = await runFailingCli([
				...args,
				'--failurePage',
				'2',
			]);
			a.equal(secondPage.stderr.includes('failure 5'), false);
			a.ok(
				secondPage.stderr.includes('case 6: failure 6'),
				secondPage.stderr,
			);
			a.ok(
				secondPage.stderr.includes('case 7: failure 7'),
				secondPage.stderr,
			);

			const allFailures = await runFailingCli([...args, '--allFailures']);
			a.ok(allFailures.stderr.includes('failure 1'), allFailures.stderr);
			a.ok(allFailures.stderr.includes('failure 7'), allFailures.stderr);
			a.equal(allFailures.stderr.includes('Showing failures'), false);

			const fiveFailures = await runFailingCli([
				...args,
				'--fiveFailures',
			]);
			a.ok(fiveFailures.stderr.includes('failure 5'));
			a.equal(fiveFailures.stderr.includes('Showing failures'), false);

			const verbose = await runFailingCli([...args, '--verbose']);
			a.equal(verbose.stderr.includes('failure 6'), false);
			a.ok(verbose.stderr.includes('Showing failures 1–5 of 7.'));

			const invalidPage = await runFailingCli([
				...args,
				'--failurePage',
				'0',
			]);
			a.ok(
				invalidPage.stderr.includes(
					'--failurePage must be a positive integer.',
				),
			);
		} finally {
			await rm(dir, { recursive: true, force: true });
		}
	});

	s.test('static specification document', a => {
		const document = renderSpecificationDocument({
			name: 'Payments <script>',
			results: [],
			tests: [
				{
					name: 'Card checkout',
					level: 1,
					results: [],
					tests: [
						{
							name: 'A customer can pay securely.',
							level: 0,
							results: [
								{
									success: true,
									message: 'Payment accepted',
									failureMessage: 'Payment rejected',
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
				},
				{
					name: 'Receipt',
					results: [
						{
							success: false,
							failureMessage: 'Screenshot <changed>',
							data: {
								type: 'figure',
								name: 'receipt',
								html: '<button>Pay</button>',
								domId: 'receipt',
								actual: 'actual.png',
								baseline: 'baseline.png',
							},
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
		});

		a.ok(document.startsWith('<!doctype html>'));
		a.ok(document.includes('<c-page><c-layout type="block" center'));
		a.ok(document.includes(specificationCss));
		a.ok(document.includes('margin: 0 auto'));
		a.ok(
			document.includes(
				'<p class="specification-kicker">Specification</p><h1>Payments &lt;script&gt;</h1>',
			),
		);
		a.equal(document.includes('<h2>Payments &lt;script&gt;</h2>'), false);
		a.ok(document.includes('<h2>Card checkout</h2>'));
		a.ok(
			document.includes(
				'<p class="specification-prose">A customer can pay securely.</p>',
			),
		);
		a.ok(document.includes('Screenshot &lt;changed&gt;'));
		a.ok(document.includes('src="actual.png"'));
		a.ok(document.includes('src="baseline.png"'));
		a.equal(document.includes('<script>'), false);
		a.ok(document.includes('Payments &lt;script&gt;'));
	});

	s.test('browser-runner', a => {
		a.ok(browserRunner);
	});

	s.test('proxy manager', it => {
		it.should('register and release routes', async a => {
			const manager = new ProxyManager(() => undefined);
			const result = await manager.register({
				type: 'proxy',
				route: '/api',
				target: 'http://127.0.0.1:8123',
				ownerId: 1,
				registrationId: 1,
			});
			a.equal(result.success, true);
			a.equalValues(manager.find('/api/clang'), [
				'/api',
				'http://127.0.0.1:8123',
			]);
			await manager.register({
				type: 'proxy',
				route: '/api/clang',
				target: 'http://127.0.0.1:8124',
				ownerId: 1,
				registrationId: 2,
			});
			a.equalValues(manager.find('/api/clang/parse'), [
				'/api/clang',
				'http://127.0.0.1:8124',
			]);
			await manager.release(1);
			a.equalValues(manager.find('/api/clang'), [
				'/api/clang',
				'http://127.0.0.1:8124',
			]);
			await manager.release(2);
			a.equal(manager.find('/api/clang'), undefined);
		});

		it.should('start and stop managed services', async a => {
			const manager = new ProxyManager(() => undefined);
			const result = await manager.register({
				type: 'proxyService',
				route: '/api',
				server: {
					target: 'http://127.0.0.1:8123',
					command: process.execPath,
					args: ['--eval', 'setInterval(() => undefined, 1000)'],
				},
				ownerId: 1,
				registrationId: 1,
			});
			a.equal(result.success, true);
			a.equalValues(manager.find('/api/clang'), [
				'/api',
				'http://127.0.0.1:8123',
			]);
			a.equal((await manager.release(1)).success, true);
			a.equal(manager.find('/api/clang'), undefined);
		});

		it.should('report spawn failures', async a => {
			const manager = new ProxyManager(() => undefined);
			const command = join(tmpdir(), 'missing-cxl-proxy-command');
			const result = await manager.register({
				type: 'proxyService',
				route: '/api',
				server: {
					target: 'http://127.0.0.1:8123',
					command,
				},
				ownerId: 1,
				registrationId: 1,
			});
			a.equal(result.success, false);
			a.ok(result.failureMessage.includes(command));
			a.equal(manager.find('/api'), undefined);
		});
	});

	s.test('managed proxy browser execution', async a => {
		a.setTimeout(60000);
		const report = await run({
			node: false,
			mjs: true,
			entryFile: './test-proxy-fixture.js',
			vfsRoot: '../',
			ignoreCoverage: true,
			updateBaselines: false,
			reportPath: 'proxy-report.json',
			sources: new Map(),
			log: console.log.bind(console),
		});
		a.equal(report.success, true, JSON.stringify(report));
		await assertPortAvailable(43123);
	});

	s.test('managed proxy node execution', async a => {
		const dir = await mkdtemp(join(tmpdir(), 'cxl-spec-runner-'));
		try {
			const fixturePath = join(dir, 'proxy-fixture.mjs');
			const specUrl = new URL('../spec/index.js', import.meta.url).href;
			const serverPath = join(import.meta.dirname, 'test-proxy-server.js');
			await writeFile(
				fixturePath,
				`import { spec } from ${JSON.stringify(specUrl)};
export default spec('managed proxy fixture', async s => {
	await s.proxy('/managed', {
		target: 'http://127.0.0.1:43123',
		command: ${JSON.stringify(process.execPath)},
		args: [${JSON.stringify(serverPath)}],
	});
	await new Promise(resolve => setTimeout(resolve, 200));
	s.test('starts service', async a => {
		const response = await fetch('http://127.0.0.1:43123/hello?value=1');
		a.equal(await response.text(), 'GET /hello?value=1 ');
	});
});`,
			);
			const report = await run({
				node: true,
				mjs: true,
				entryFile: fixturePath,
				ignoreCoverage: true,
				updateBaselines: false,
				reportPath: join(dir, 'proxy-report.json'),
				sources: new Map(),
				log: console.log.bind(console),
			});
			a.equal(report.success, true, JSON.stringify(report));
			await assertPortAvailable(43123);
		} finally {
			await rm(dir, { recursive: true, force: true });
		}
	});

	s.test('managed proxy process failures include output', async a => {
		a.setTimeout(60000);
		const report = await run({
			node: false,
			mjs: true,
			entryFile: './test-proxy-failure-fixture.js',
			vfsRoot: '../',
			ignoreCoverage: true,
			updateBaselines: false,
			reportPath: 'proxy-failure-report.json',
			sources: new Map(),
			log: console.log.bind(console),
		});
		const output = JSON.stringify(report);
		a.equal(report.success, false);
		a.ok(output.includes('service stdout'));
		a.ok(output.includes('service stderr'));
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
						ranges: [
							{ startOffset: 100, endOffset: 120, count: 0 },
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
									{
										startOffset: 0,
										endOffset: 100,
										count: 0,
									},
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
			a.equal(
				report.summary.coverage?.functionCoveragePct,
				33.33333333333333,
			);
		});

		it.should('deduplicate equivalent expected coverage paths', async a => {
			const report = await generateReport(suite, coverage, {
				entryFile: './test.js',
				expectedCoverageFiles: [
					{
						url: '/dist/project-server/index.js',
						functions: [],
					},
				],
			});

			a.equal(report.coverage?.length, 1);
			a.equal(report.coverage?.[0]?.url, 'index.js');
			a.equal(report.summary.coverage?.blockCoveragePct, 62.5);
		});

		it.should('exclude files outside expected coverage', async a => {
			const report = await generateReport(
				suite,
				[
					...coverage,
					{
						url: 'shared.js',
						functions: [
							{
								functionName: '',
								isBlockCoverage: true,
								ranges: [
									{ startOffset: 0, endOffset: 100, count: 1 },
								],
							},
						],
					},
				],
				{
					entryFile: './test.js',
					expectedCoverageFiles: [{ url: 'index.js', functions: [] }],
				},
			);

			a.equal(report.coverage?.length, 1);
			a.equal(report.coverage?.[0]?.url, 'index.js');
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

	s.test('node benchmark execution', async a => {
		const dir = await mkdtemp(join(tmpdir(), 'cxl-benchmark-node-'));
		try {
			const report = await run({
				node: true,
				mjs: true,
				entryFile: './test-benchmark-node-fixture.js',
				ignoreCoverage: true,
				updateBaselines: false,
				baselinePath: dir,
				reportPath: 'benchmark-report.json',
				sources: new Map(),
				log: console.log.bind(console),
			});
			a.equal(report.success, true);
			a.equal(Object.keys(report.benchmark?.benchmarks ?? {}).length, 1);
			a.ok(report.benchmark?.fingerprint.browser.startsWith('Node/'));
			a.ok((await readFile(join(dir, 'benchmark.json'), 'utf8')).length > 0);
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
