import type { Result, RunnerCommand, Test } from '../spec';
import type { TestResult } from '../spec-runner/report';
import {
	Component,
	attribute,
	component,
	css,
	get,
	merge,
	styleAttribute,
	tsx,
} from '@cxl/ui';

declare global {
	interface Window {
		__cxlRunner: (data: RunnerCommand) => void;
	}
}

interface RunnerConfig {
	suites: Test[];
	baselinePath?: string;
}

window.__cxlRunner = data => {
	if (data.type === 'figure')
		return {
			success: true,
			message: 'Screenshot should match baseline',
			data,
		};

	if (data.type === 'run') {
		new BrowserRunner(data).run().catch(e => console.error(e));
		return {
			success: true,
			message: '',
			data,
		};
	}

	return {
		success: false,
		message: `${data.type} not supported.`,
	};
};

let output = `<style>.thumb{vertical-align:middle;display:inline-block;overflow:hidden;width:320px;position:relative;vertical-align:top}
	dl { display: flex; margin-top:8px;margin-bottom:8px; } dd { margin-left: 16px}
	body {font-family:monospace;font-size:16px;tab-size:4}
	</style>`;

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
	return str.replace(
		ENTITIES_REGEX,
		e => ENTITIES_MAP[e as keyof typeof ENTITIES_MAP] || '',
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

function printResult(result: Result, baselinePath = 'spec') {
	output += result.success ? success() : failure();
	const data = result.data;
	if (data?.type === 'figure') {
		//require('@cxl/workspace.ui/image-diff.js');
		output += `<div class="thumb">${data.html}</div>
		<spec-image-diff src1="spec/${data.name}.png" src2="${baselinePath}/${data.name}.png"></cxl-image-diff>`;
	}
}

function findTest(tests: Test[], id: number): Test | void {
	for (const test of tests) {
		if (test.id === id) return test;
		const childTest = findTest(test.tests, id);
		if (childTest) return childTest;
	}
}

async function onClick(suite: Test[], ev: Event) {
	const testId = (ev.target as HTMLElement).dataset.test;
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

export interface ImageDiffResult {
	imageA: ImageData;
	imageB: ImageData;
	diffBytes: number;
	size: number;
	diff: ImageData;
}

export function loadImage(src: string) {
	return new Promise<HTMLImageElement>((resolve, reject) => {
		const img = new Image();
		img.src = src;
		img.addEventListener('load', () => resolve(img));
		img.addEventListener('error', () => reject(img));
	});
}
/*export async function loadImage(src: string) {
	const result = new Image();
	result.src = src;
	console.log(src);
	await result.decode();
	return result;
}*/

export async function imageData(srcA: string) {
	const A = await loadImage(srcA);
	const canvasEl = tsx('canvas');
	const ctx = canvasEl.getContext('2d');
	if (!ctx) throw new Error('Could not create context');

	const w = (canvasEl.width = A.width);
	const h = (canvasEl.height = A.height);
	ctx.drawImage(A, 0, 0);
	return ctx.getImageData(0, 0, w, h);
}

export function image(src: string) {
	const result = new Image();
	result.src = src;
	return result;
}

export async function imageDataDiff(A: ImageData, B: ImageData) {
	const w = Math.max(A.width, B.width);
	const h = Math.max(A.height, B.height);
	const size = w * h * 4;

	const diff = new Uint8ClampedArray(size);
	let diffBytes = 0;

	for (let i = 0; i < size; i += 4) {
		const match =
			A.data[i] === B.data[i] &&
			A.data[i + 1] === B.data[i + 1] &&
			A.data[i + 2] === B.data[i + 2] &&
			A.data[i + 3] === B.data[i + 3];
		if (!match) diffBytes += 4;
		diff[i] = diff[i + 3] = match ? 0 : 0xff;
	}

	return {
		imageA: A,
		imageB: B,
		diffBytes,
		size,
		diff: new ImageData(diff, w, h),
	};
}

export async function imageDiff(srcA: string, srcB: string) {
	const [A, B] = await Promise.all([imageData(srcA), imageData(srcB)]);
	return imageDataDiff(A, B);
}

export class ImageDiff extends Component {
	src1?: string;

	src2?: string;

	ratio = 1;

	hidediff = false;

	value: ImageDiffResult | undefined;
}

component(ImageDiff, {
	tagName: 'spec-image-diff',
	init: [
		attribute('src1'),
		attribute('src2'),
		attribute('ratio'),
		styleAttribute('hidediff'),
	],
	augment: [
		css(`
	:host {
		display: inline-block;
		position: relative;
		fontSize: 0;
	}
	.absolute {
		position: absolute;
		top: 0;
		left: 0;
		width: '100%';
		height: '100%';
	}
	:host([hidediff]) .diff { opacity: 0 },
`),
		$ => {
			const C = document.createElement('canvas');
			C.className = 'absolute diff';
			C.ariaLabel = 'rendered diff';
			const A = tsx('img', { alt: 'source a', className: 'absolute' });
			const B = tsx('img', { alt: 'source b', className: 'absolute' });
			const ctx = C.getContext('2d');

			function render() {
				if (!ctx) throw new Error('No rendering context');
				if (!$.src1 || !$.src2) return;

				A.src = $.src2;
				B.src = $.src1;
				imageDiff($.src1, $.src2).then(
					({ diff }) => {
						$.style.width = `${(C.width = diff.width)}px`;
						$.style.height = `${(C.height = diff.height)}px`;
						ctx.putImageData(diff, 0, 0);
					},
					e => console.error(e),
				);
			}

			$.shadowRoot?.append(B, A, C);

			return merge(
				merge(get($, 'src1'), get($, 'src2')).raf(render),
				get($, 'ratio').raf(val => (A.style.opacity = val.toString())),
			);
		},
	],
});

class BrowserRunner {
	suites;
	baselinePath;

	constructor(config: RunnerConfig) {
		this.suites = config.suites;
		this.baselinePath = config.baselinePath;
	}

	async runSuite(suite: Test) {
		await suite.run();
		this.renderTestReport(suite);
	}

	renderTestReport(test: Test) {
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
			`${test.name}${
				failureCount > 0 ? ` (${failureCount} failures)` : ''
			}`,
		);

		results.forEach(r => {
			printResult(r, this.baselinePath);
			if (!r.success) printError(r);
		});
		if (test.only.length)
			test.only.forEach((test: Test) => this.renderTestReport(test));
		else test.tests.forEach((test: Test) => this.renderTestReport(test));
		groupEnd();
	}

	async run() {
		await Promise.all(this.suites.map(suite => this.runSuite(suite)));
		const container = document.createElement('cxl-content');
		container.innerHTML = output;
		container.addEventListener('click', ev => {
			onClick(this.suites, ev).catch(e => console.error(e));
		});
		document.body.appendChild(container);
	}
}

export default BrowserRunner;
