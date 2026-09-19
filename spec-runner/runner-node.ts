import { resolve, dirname } from 'path';
import * as inspector from 'inspector';

import type {
	Test,
	JsonResult,
	Result,
	RunnerCommand,
} from '@cxl/spec';
import type { SpecRunner } from './index.js';

import { generateReport } from './report.js';
import { writeSpecificationDocument } from './specification-file.js';
import { ProxyManager } from './runner-puppeteer.js';
import {
	getNodeBenchmarkEnvironment,
	processBenchmarks,
} from './benchmark.js';
import { registerImportMap } from './importmap.js';

type RunnerBridge = (command: RunnerCommand) => Promise<Result> | Result;

declare global {
	var __cxlRunner: RunnerBridge | undefined;
}

function post(
	session: inspector.Session,
	msg: 'Profiler.takePreciseCoverage',
): Promise<inspector.Profiler.TakePreciseCoverageReturnType>;
function post(session: inspector.Session, msg: string, params?: object): Promise<void>;
function post(session: inspector.Session, msg: string, params = {}) {
	return new Promise<unknown>((resolve, reject) => {
		session.post(msg, params, (err, result) =>
			err ? reject(err) : resolve(result),
		);
	});
}

async function recordCoverage(
	session: inspector.Session,
	cb: () => Promise<JsonResult>,
	rootPath: string,
) {
	await post(session, 'Profiler.enable');
	await post(session, 'Profiler.startPreciseCoverage', { detailed: true });
	const result = await cb();
	const coverage = await post(session, 'Profiler.takePreciseCoverage');
	await post(session, 'Profiler.stopPreciseCoverage');
	await post(session, 'Profiler.disable');

	return {
		coverage: coverage.result.flatMap(n => {
			if (!n.url || n.url.startsWith('node:')) return [];
			if (n.url.startsWith('file:///')) {
				const rel = n.url.slice(7);
				if (!rel.startsWith(rootPath)) return [];
				n.url = rel.slice(rootPath.length + 1);
			}
			return [n];
		}),
		result,
	};
}

export default async function runNode(app: SpecRunner) {
	const proxies = new ProxyManager(message => app.log(message));

	async function runSuite() {
		const stdout = process.stdout.write;
		const stderr = process.stderr.write;
		const previousRunner = globalThis.__cxlRunner;
		const importMap = registerImportMap(
			app.importmap,
			resolve(app.vfsRoot ?? '.'),
		);
		const ignoreOutput = () => true;
		globalThis.__cxlRunner = command => {
			if (command.type === 'proxy' || command.type === 'proxyService')
				return proxies.register(command);
			if (command.type === 'proxyRelease')
				return proxies.release(command.registrationId);
			return {
				success: false,
				failureMessage: `Feature not supported: ${command.type}`,
			};
		};
		if (!app.verbose) {
			process.stdout.write = ignoreOutput;
			process.stderr.write = ignoreOutput;
		}
		try {
			const module: { default: Test } = await import(suitePath);
			const suite = module.default;
			return await suite.run(app.grep).then(() => suite);
		} finally {
			importMap?.deregister();
			process.stdout.write = stdout;
			process.stderr.write = stderr;
			try {
				await proxies.close();
			} finally {
				globalThis.__cxlRunner = previousRunner;
			}
		}
	}

	async function writeDocument(suite: JsonResult) {
		await writeSpecificationDocument(app.documentPath, suite, {
			baselinePath: app.baselinePath,
		});
		if (app.documentPath) app.onGeneratedFile?.(app.documentPath);
	}

	async function processSuite(suite: JsonResult) {
		return processBenchmarks(
			suite,
			getNodeBenchmarkEnvironment(),
			app.baselinePath,
			!!app.updateBaselines,
			app.onGeneratedFile,
		);
	}

	const entryFile = app.entryFile;
	const session = new inspector.Session();
	const suitePath = resolve(entryFile);
	if (app.verbose) {
		app.log(`Runner: Node ${process.version}`);
		app.log(`Suite: ${suitePath}`);
	}

	if (app.inspect) {
		inspector.open();
		console.log(`Waiting for debugger (${inspector.url()})`);
		inspector.waitForDebugger();
	}

	session.connect();

	if (app.ignoreCoverage) {
		const suite = await runSuite();
		const benchmark = await processSuite(suite);
		await writeDocument(suite);
		const report = await generateReport(suite);
		report.benchmark = benchmark;
		return report;
	} else {
		const { result, coverage } = await recordCoverage(
			session,
			runSuite,
			dirname(suitePath),
		);
		if (process.argv.includes('--inspect')) {
			console.log('Press any key to continue');
			await new Promise(res => process.stdin.once('data', res));
		}
		const benchmark = await processSuite(result);
		await writeDocument(result);
		const report = await generateReport(result, coverage, {
			entryFile: app.entryFile,
			expectedCoverageFiles: app.expectedCoverageFiles,
		});
		report.benchmark = benchmark;
		return report;
	}
}
