#!/usr/bin/env node
import { writeFile } from 'fs/promises';
import { spawn, execSync } from 'child_process';

import {
	Logger,
	ParametersResult,
	program,
	parseArgv,
} from '../program/index.js';

import runNode from './runner-node.js';
import runPuppeteer from './runner-puppeteer.js';
import printReportV2 from './report-stdout.js';

export type SpecRunnerOptions = ParametersResult<typeof parameters>;

export type SpecRunner = Omit<SpecRunnerOptions, '$'> & {
	entryFile: string;
	log: Logger;
};

const parameters = {
	node: { type: 'boolean', help: 'Run tests in node mode.' },
	firefox: {
		help: 'Run tests in firefox through puppeteer.',
	},
	baselinePath: { type: 'string', help: 'Baseline Path' },
	updateBaselines: { help: 'Update baselines' },
	ignoreCoverage: { help: 'Disable coverage report.' },
	mjs: { help: 'Enable ES modules mode' },
	inspect: { help: 'Enable node debugger' },
	disableSecurity: { help: 'Disable Browser Security' },
	browserUrl: { type: 'string', help: 'Browser runner initial URL' },
	vfsRoot: { type: 'string', help: 'Start a Virtual File Server' },
	startServer: {
		type: 'string',
		help: 'Start a server application while the tests are running',
	},
	reportPath: {
		type: 'string',
		help: '',
	},
} as const;

function startServer(cmd: string) {
	const [bin, ...args] = cmd.split(' ');
	const proc = spawn(bin, args);
	proc.stdout?.on('data', data => console.log(data.toString()));
	proc.stderr?.on('data', data => console.error(data.toString()));
	return proc;
}

const start = program({}, async ({ log }) => {
	const args = parseArgv(parameters);
	const config = {
		entryFile: args.$[0] || './test.js',
		updateBaselines: false,
		ignoreCoverage: false,
		amd: false,
		mjs: false,
		node: false,
		firefox: false,
		log,
		reportPath: 'test-report.json',
		...args,
	};

	const server = config.startServer && startServer(config.startServer);
	if (server) {
		log(`"${args.startServer}" started. PID: ${server.pid}`);
	}

	const report = await (args.node ? runNode(config) : runPuppeteer(config));

	try {
		if (server && !server.killed) {
			log(`Attempting to kill ${server.pid} "${args.startServer}"`);
			execSync(`kill -9 ${server.pid}`);
			server.kill();
		}
	} catch (e) {
		log(`Could not kill "${args.startServer}"`);
	}

	if (report) {
		printReportV2(report);
		await writeFile(config.reportPath, JSON.stringify(report));
	}

	if (!report.success) {
		process.exitCode = 1;
		log('Tests failed.');
	}
});

export default start;

if (import.meta.main) start();
