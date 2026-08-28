#!/usr/bin/env node
import { spawn, execSync } from 'child_process';

import {
	Logger,
	ParametersResult,
	program,
	parseArgv,
} from '../program/index.js';

import { run } from './runner.js';
import { parseGrep } from './grep.js';

import printReportV2 from './report-stdout.js';
import { writeReport, type TestCoverage } from './report.js';

export {
	escapeSpecificationHtml,
	renderSpecificationDocument,
	specificationCss,
	specificationCount,
	specificationFigureSources,
	specificationHeading,
	specificationResults,
	summarizeSpecification,
} from './specification.js';

export type SpecRunnerOptions = ParametersResult<typeof parameters>;

export type SpecRunner = Omit<SpecRunnerOptions, '$' | 'grep'> & {
	entryFile: string;
	expectedCoverageFiles?: TestCoverage[];
	importmap?: string;
	reportPath: string;
	documentPath?: string;
	grep?: RegExp;
	onGeneratedFile?: (path: string) => void;
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
	documentPath: {
		type: 'string',
		help: 'Path to write the static HTML specification (default: "test-report.html").',
	},
	grep: {
		type: 'string',
		help: 'Run only tests whose full name matches the pattern.',
	},
	verbose: {
		help: 'Print detailed test output.',
	},
	failurePage: {
		type: 'number',
		help: 'Page of test failures to print.',
	},
	allFailures: {
		help: 'Print all test failures.',
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
	if (
		args.failurePage !== undefined &&
		(!Number.isInteger(args.failurePage) || args.failurePage < 1)
	)
		throw new Error('--failurePage must be a positive integer.');
	const { $, grep: grepPattern, ...rest } = args;
	const config: SpecRunner = {
		entryFile: $[0] || './test.js',
		updateBaselines: false,
		ignoreCoverage: false,
		mjs: true,
		node: false,
		log,
		reportPath: 'test-report.json',
		documentPath: 'test-report.html',
		sources: new Map(),
		onGeneratedFile: path => console.log(`generated: ${path}`),
		...rest,
		grep: parseGrep(grepPattern),
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
	} catch {
		log(`Could not kill "${args.startServer}"`);
	}

	printReportV2(report, {
		verbose: !!config.verbose,
		failurePage: config.failurePage,
		allFailures: config.allFailures,
	});
	await writeReport(config.reportPath, report);
	config.onGeneratedFile?.(config.reportPath);

	if (!report.success) {
		process.exitCode = 1;
		log('Tests failed.');
	}
});

export default start;

if (import.meta.main) await start();
