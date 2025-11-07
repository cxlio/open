import type { Result, RunnerCommand, Test } from '../spec';
import type { TestResult } from '../spec-runner/report';

let output = `<style>.thumb{vertical-align:middle;display:inline-block;overflow:hidden;width:320px;position:relative;vertical-align:top}
	dl { display: flex; margin-top:8px;margin-bottom:8px; } dd { margin-left: 16px}
	body {font-family:monospace;font-size:16px;tab-size:4}
	</style>`;
//let baselinePath: string;

function group(testId: number, title: string) {
	output += `<dl><dt><a data-test="${testId}" href="#">${escapeHtml(
		title,
	)}</a></dt><dd>`;
}

function groupEnd() {
	output += '</dd></dl>';
}

const ENTITIES_REGEX = /[&<>]/g,
	ENTITIES_MAP = {
		'&': '&amp;',
		'<': '&lt;',
		'>': '&gt;',
	};

export function escapeHtml(str: string) {
	return (
		str &&
		str.replace(
			ENTITIES_REGEX,
			e => ENTITIES_MAP[e as keyof typeof ENTITIES_MAP] || '',
		)
	);
}

function error(msg: string | Error) {
	output += '<div style="background-color:#ffcdd2;padding:8px">';
	if (msg instanceof Error) {
		output += `
			<p style="white-space:pre">${escapeHtml(msg.message)}</p>
			<pre>${escapeHtml(msg.stack || '')}</pre>
		`;
	} else output += `<p style="white-space:pre-wrap">${escapeHtml(msg)}</p>`;
	output += '</div>';
}

function success(): string {
	return '&check;';
}

function failure(): string {
	return '&times;';
}

function printError(fail: Result) {
	console.error(fail.message);
	if (fail.stack) console.error(fail.stack);
	const msg = fail.message;
	error(msg);
}

function printResult(result: Result) {
	output += result.success ? success() : failure();
	/*const data = result.data;
	if (data?.type === 'figure') {
		require('@cxl/workspace.ui/image-diff.js');
		output += `<div class="thumb">${data.html}</div>
		<cxl-image-diff src1="spec/${data.name}.png" src2="${baselinePath}/${data.name}.png"></cxl-image-diff>`;
	}*/
}

function renderTestReport(test: Test) {
	let failureCount = 0;
	const failures: TestResult[] = [];
	const results = test.results;

	results.forEach(r => {
		if (r.success === false) {
			failureCount++;
			failures.push(r);
		}
	});

	if (
		results.length === 0 &&
		test.tests.length === 0 &&
		test.only.length === 0
	) {
		failureCount++;
		results.push({ success: false, message: 'No assertions found' });
	}

	group(
		test.id,
		`${test.name}${failureCount > 0 ? ` (${failureCount} failures)` : ''}`,
	);

	results.forEach(r => {
		printResult(r);
		if (!r.success) printError(r);
	});
	if (test.only.length)
		test.only.forEach((test: Test) => renderTestReport(test));
	else test.tests.forEach((test: Test) => renderTestReport(test));
	groupEnd();
}

function findTest(tests: Test[], id: number): Test | void {
	for (const test of tests) {
		if (test.id === id) return test;
		const childTest = findTest(test.tests, id);
		if (childTest) return childTest;
	}
}

async function onClick(suite: Test[], ev: Event) {
	const testId = (ev.target as HTMLElement)?.dataset.test;
	if (testId) {
		ev.stopPropagation();
		ev.preventDefault();

		const test = findTest(suite, +testId);

		if (test) {
			console.log(`Running test "${test.name}"`);
			test.results = [];
			await test.run();
			console.log(test.results);
		}
	}
}

declare global {
	interface Window {
		__cxlRunner: (data: RunnerCommand) => void;
	}
}

window.__cxlRunner = data => {
	if (data.type === 'figure')
		return {
			success: true,
			message: 'Screenshot should match baseline',
			data,
		};
	return {
		success: false,
		message: `${data.type} not supported.`,
	};
};

const browserRunner = {
	async runSuite(suite: Test) {
		await suite.run();
		renderTestReport(suite);
	},

	async run(suites: Test[], _baselineDir?: string) {
		//baselinePath = baselineDir;
		await Promise.all(suites.map(suite => this.runSuite(suite)));
		const container = document.createElement('cxl-content');
		container.innerHTML = output;
		container.addEventListener('click', ev => onClick(suites, ev));
		document.body.appendChild(container);
	},
};

export default browserRunner;
