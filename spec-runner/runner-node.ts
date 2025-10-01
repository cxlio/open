import { resolve } from 'path';
import * as inspector from 'inspector';

import type { Test } from '../spec/index.js';
import type { SpecRunner } from './index.js';

import { Coverage, generateReport } from './report.js';

function post(session: inspector.Session, msg: string, params = {}) {
	return new Promise((resolve, reject) => {
		session.post(msg, params, (err, result) =>
			err ? reject(err) : resolve(result),
		);
	});
}

async function recordCoverage(session: inspector.Session, cb: Function) {
	await post(session, 'Profiler.enable');
	await post(session, 'Profiler.startPreciseCoverage', { detailed: true });
	const result = await cb();
	const coverage = await post(session, 'Profiler.takePreciseCoverage');
	await post(session, 'Profiler.stopPreciseCoverage');
	await post(session, 'Profiler.disable');
	return {
		coverage: (coverage as { result: Coverage }).result,
		result,
	};
}

export default async function runNode(app: SpecRunner) {
	async function runSuite() {
		const suite = (await import(entryFile)).default as Test;
		return suite.run().then(() => suite);
	}

	const entryFile = app.entryFile;
	const session = new inspector.Session();
	app.log(`Node ${process.version}`);
	const suitePath = resolve(entryFile);
	app.log(`Suite: ${suitePath}`);

	if (app.inspect) {
		inspector.open();
		console.log(`Waiting for debugger (${inspector.url()})`);
		inspector.waitForDebugger();
	}

	session.connect();

	if (app.ignoreCoverage) {
		const suite = await runSuite();
		return generateReport(suite);
	} else {
		const { result, coverage } = await recordCoverage(session, runSuite);
		if (process.argv.includes('--inspect')) {
			console.log('Press any key to continue');
			await new Promise(res => process.stdin.once('data', res));
		}
		return generateReport(result, coverage);
	}
}
