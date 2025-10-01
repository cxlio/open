import { resolve } from 'path';
import * as inspector from 'inspector';

import type { Test, Result } from '@cxl/spec';
import type { SpecRunner } from './index.js';

import { Coverage, generateReport } from './report.js';

function post(session: inspector.Session, msg: string, params = {}) {
	return new Promise((resolve, reject) => {
		session.post(msg, params, (err, result) =>
			err ? reject(err) : resolve(result),
		);
	});
}

/* eslint @typescript-eslint/no-require-imports: off */
async function recordCoverage(
	session: inspector.Session,
	cb: () => Promise<Result[]>,
): Promise<Coverage> {
	await post(session, 'Profiler.enable');
	await post(session, 'Profiler.startPreciseCoverage', { detailed: true });
	await cb();
	const coverage = await post(session, 'Profiler.takePreciseCoverage');
	await post(session, 'Profiler.stopPreciseCoverage');
	await post(session, 'Profiler.disable');
	return (coverage as { result: Coverage }).result;
}

function runSuite(suitePath: string) {
	const suite = require(suitePath).default as Test;
	return suite.run().then(() => suite);
}

export default async function runNode(app: SpecRunner) {
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

	let result!: Test;

	if (app.ignoreCoverage) {
		const suite = await runSuite(suitePath);
		return generateReport(suite);
	} else {
		const coverage = await recordCoverage(session, () => {
			const suite = (result = require(suitePath).default as Test);
			return suite.run();
		});
		if (process.argv.includes('--inspect')) {
			console.log('Press any key to continue');
			await new Promise(res => process.stdin.once('data', res));
		}
		return generateReport(result, coverage);
	}
}
