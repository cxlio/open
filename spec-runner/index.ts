#!/usr/bin/env node
import { writeFile } from 'fs/promises';
import { spawn, execSync } from 'child_process';

import {
	Logger,
	ParametersResult,
	program,
	parseArgv,
} from '../program/index.js';

import { run } from './runner.js';

import printReportV2 from './report-stdout.js';

export type SpecRunnerOptions = ParametersResult<typeof parameters>;

export type SpecRunner = Omit<SpecRunnerOptions, '$'> & {
	entryFile: string;
	importmap?: string;
	sources: Map<string, Output>;
	log: Logger;
};

export interface Output {
	path: string;
	source: string;
}

// CLI parameters prefixed by --
const parameters = {
	node: {
		type: 'boolean',
		help: 'Run specs using the Node.js runner (no browser).',
	},
	baselinePath: {
		type: 'string',
		help: 'Directory containing baseline files used for comparisons.',
	},
	updateBaselines: {
		help: 'Overwrite baselines with current outputs (updates expected results).',
	},
	ignoreCoverage: { help: 'Skip generating the coverage report.' },
	mjs: { help: 'Treat spec files as ES modules (ESM) when executing.' },
	inspect: { help: 'Enable the Node.js inspector for debugging.' },
	disableSecurity: {
		help: 'Disable browser web security (e.g., CORS) for the browser runner.',
	},
	browserUrl: {
		type: 'string',
		help: 'Initial URL to open in the browser runner.',
	},
	vfsRoot: {
		type: 'string',
		help: 'Root directory to serve via the virtual file server.',
	},
	startServer: {
		type: 'string',
		help: 'Command to start an external server while tests run (e.g. "npm run dev").',
	},
	reportPath: {
		type: 'string',
		help: 'Path to write the JSON test report (default: "test-report.json").',
	},
} as const;

function startServer(cmd: string) {
	const [bin, ...args] = cmd.split(' ');
	if (!bin) return;
	const proc = spawn(bin, args);
	proc.stdout.on('data', (data: Buffer) => console.log(data.toString()));
	proc.stderr.on('data', (data: Buffer) => console.error(data.toString()));
	return proc;
}

const start = program({}, async ({ log }) => {
	const args = parseArgv(parameters);
	const config = {
		entryFile: args.$[0] || './test.js',
		updateBaselines: false,
		ignoreCoverage: false,
		mjs: true,
		node: false,
		log,
		reportPath: 'test-report.json',
		sources: new Map(),
		...args,
	};

	const server = config.startServer && startServer(config.startServer);
	if (server) {
		log(`"${args.startServer}" started. PID: ${server.pid}`);
	}

	const report = await run(config);

	try {
		if (server && !server.killed) {
			log(`Attempting to kill ${server.pid} "${args.startServer}"`);
			execSync(`kill -9 ${server.pid}`);
			server.kill();
		}
	} catch (e) {
		log(`Could not kill "${args.startServer}"`);
	}

	printReportV2(report);
	await writeFile(config.reportPath, JSON.stringify(report));

	if (!report.success) {
		process.exitCode = 1;
		log('Tests failed.');
	}
});

export default start;

if (import.meta.main) await start();
