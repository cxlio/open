import { resolve, dirname } from 'path';
import * as inspector from 'inspector';

import type { Test, JsonResult } from '../spec/index.js';
import type { SpecRunner } from './index.js';

import { generateReport } from './report.js';
import { writeSpecificationDocument } from './specification-file.js';

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
	async function runSuite() {
		const stdout = process.stdout.write;
		const stderr = process.stderr.write;
		const ignoreOutput = () => true;
		if (!app.verbose) {
			process.stdout.write = ignoreOutput;
			process.stderr.write = ignoreOutput;
		}
		try {
			const module: { default: Test } = await import(suitePath);
			const suite = module.default;
			return await suite.run(app.grep).then(() => suite);
		} finally {
			process.stdout.write = stdout;
			process.stderr.write = stderr;
		}
	}

	async function writeDocument(suite: JsonResult) {
		await writeSpecificationDocument(app.documentPath, suite, {
			baselinePath: app.baselinePath,
		});
		if (app.documentPath) app.onGeneratedFile?.(app.documentPath);
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
		await writeDocument(suite);
		return generateReport(suite);
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
		await writeDocument(result);
		return generateReport(result, coverage, {
			entryFile: app.entryFile,
			expectedCoverageFiles: app.expectedCoverageFiles,
		});
	}
}
