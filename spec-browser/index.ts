import type { JsonResult, Result, RunnerCommand, Test } from '../spec';
import type { TestResult } from '../spec-runner/report';
import {
	Alert,
	Component,
	Page,
	Layout,
	T,
	attribute,
	component,
	css,
	get,
	merge,
	styleAttribute,
	tsx,
	theme,
} from '@cxl/ui';

declare global {
	interface Window {
		__cxlRunner: (data: RunnerCommand) => RunnerResult | Promise<RunnerResult>;
	}
}

interface RunnerResult {
	success: boolean;
	message: string;
	data?: RunnerCommand;
}

interface RunnerConfig {
	testFile?: string;
	suites?: Test[];
	baselinePath?: string;
}

theme.globalCss += `
c-t[font=h1] { font-size: 24px; line-height: 24px; margin: 24px 0; }
c-t[font=h2] { font-size: 22px; line-height: 22px; margin: 22px 0; }
c-t[font=h3] { font-size: 20px; line-height: 20px; margin: 20px 0; }
c-t[font=h4] { font-size: 18px; line-height: 18px; margin: 18px 0; }
`;

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

interface BrowserTestResult extends JsonResult {
	level?: number;
}

interface FrameMessage {
	type: 'spec-browser-result';
	result?: BrowserTestResult;
	error?: string;
}

function frameSource(testFile: string, targetPath?: string) {
	const importmap = document.querySelector('script[type="importmap"]')?.textContent;
	const config = JSON.stringify({
		testFile,
		targetPath,
		parentOrigin: location.origin,
	}).replace(/</g, '\\u003c');
	return `<!DOCTYPE html>
<base href="${location.href}">
${importmap ? `<script type="importmap">${importmap}</script>` : ''}
<script type="module">
	const config = ${config};
	window.__cxlRunner = data => parent.__cxlRunner(data);
	try {
		const suite = (await import(config.testFile)).default;
		await suite.run(undefined, config.targetPath);
		parent.postMessage({ type: 'spec-browser-result', result: suite.toJSON() }, config.parentOrigin);
	} catch (e) {
		parent.postMessage({ type: 'spec-browser-result', error: String(e) }, config.parentOrigin);
	}
</script>`;
}

export function runTestFile(testFile: string, targetPath?: string) {
	return new Promise<BrowserTestResult>((resolve, reject) => {
		const frame = document.createElement('iframe');
		frame.style.cssText =
			'position:fixed;inset:0;z-index:-1;width:100vw;height:100vh;border:0;pointer-events:none';
		frame.srcdoc = frameSource(testFile, targetPath);

		const onMessage = (ev: MessageEvent<FrameMessage>) => {
			if (ev.source !== frame.contentWindow) return;
			window.removeEventListener('message', onMessage);
			frame.remove();
			if (ev.data.error) reject(new Error(ev.data.error));
			else if (ev.data.result) resolve(ev.data.result);
			else reject(new Error('Test iframe returned no result'));
		};

		window.addEventListener('message', onMessage);
		document.body.append(frame);
	});
}

const output = tsx(Layout, { type: 'block', center: true });
const page = tsx(
	Page,
	{},
	tsx(
		'style',
		undefined,
		`
.thumb{vertical-align:middle;display:inline-block;overflow:hidden;width:320px;position:relative;vertical-align:top}
body {tab-size:4}
`,
	),
	output,
);

function group(
	testPath: string,
	title: string,
	level: number | undefined,
	children: Node[],
) {
	if (level === undefined) output.append(tsx('p', {}, title), ...children);
	else {
		const link = tsx('a', { href: '#' }, title);
		link.dataset.test = testPath;
		const head = tsx(T, { font: headingFont(level) }, link);
		const ol = tsx('ol', undefined, children);

		if (level > 1) {
			const li = tsx('li', undefined, head);
			li.append(ol);
			output.append(li);
		} else output.append(head, ol);
	}
}

function groupEnd() {}

function headingFont(level: number) {
	switch (level) {
		case 2:
			return 'h2';
		case 3:
			return 'h3';
		case 4:
			return 'h4';
		case 5:
			return 'h5';
		case 6:
			return 'h6';
		default:
			return 'h1';
	}
}

const ENTITIES_REGEX = /[&<>]/g,
	ENTITIES_MAP: Record<string, string> = {
		'&': '&amp;',
		'<': '&lt;',
		'>': '&gt;',
	};

export function escapeHtml(str: string) {
	return str.replace(
		ENTITIES_REGEX,
		e => ENTITIES_MAP[e] || '',
	);
}

function error(msg: string | Error) {
	if (msg instanceof Error) {
		output.append(
			tsx(
				Alert,
				{ color: 'error' },
				msg.message,
				tsx('pre', undefined, msg.stack ?? ''),
			),
		);
	} else output.append(tsx(Alert, { color: 'error' }, msg));
}

function success(r: TestResult): string {
	return r.message ?? '';
}

function failure(r: TestResult): string {
	printError(r);
	return '';
}

function printError(fail: Result) {
	const msg = fail.failureMessage;
	console.error(msg);
	if (fail.stack) console.error(fail.stack);
	error(msg);
}

function printResult(result: Result, baselinePath = 'spec') {
	const div = tsx('div');
	div.append(result.success ? success(result) : failure(result));

	const data = result.data;
	if (data?.type === 'figure') {
		div.append(
			tsx('div', { className: 'thumb', innerHTML: data.html }),
			tsx(ImageDiff, {
				src1: `spec/${data.name}.png`,
				src2: `${baselinePath}/${data.name}.png`,
			}),
		);
	}

	return div;
}

async function onClick(runner: BrowserRunner, ev: Event) {
	if (!(ev.target instanceof HTMLElement)) return;
	const testPath = ev.target.dataset.test;
	if (testPath) {
		ev.stopPropagation();
		ev.preventDefault();

		console.log(`Running test "${testPath}"`);
		await runner.run(testPath);
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
	testFile?: string;
	suites?: Test[];
	baselinePath;

	constructor(config: RunnerConfig) {
		this.testFile = config.testFile;
		this.suites = config.suites;
		this.baselinePath = config.baselinePath;
	}

	async runSuite(suite?: Test | BrowserTestResult, targetPath?: string) {
		let result: Test | BrowserTestResult;
		if (this.testFile) result = await runTestFile(this.testFile, targetPath);
		else {
			if (!suite || !('run' in suite)) throw new Error('Missing test suite');
			await suite.run();
			result = suite;
		}
		this.renderTestReport(result);
	}

	renderTestReport(test: Test | BrowserTestResult, parentPath = '') {
		let failureCount = 0;
		const results = test.results;

		results.forEach(r => {
			if (r.success === false) {
				failureCount++;
			}
		});

		if (
			results.length === 0 &&
			test.tests.length === 0 &&
			test.only.length === 0
		) {
			failureCount++;
			results.push({
				success: false,
				failureMessage: 'No assertions found',
			});
		}

		const testPath = parentPath ? `${parentPath} ${test.name}` : test.name;
		group(
			testPath,
			`${test.name}${
				failureCount > 0 ? ` (${failureCount} failures)` : ''
			}`,
			test.level,
			results.map(r => printResult(r, this.baselinePath)),
		);

		if (test.only.length)
			test.only.forEach(test => this.renderTestReport(test, testPath));
		else test.tests.forEach(test => this.renderTestReport(test, testPath));
		groupEnd();
	}

	async run(targetPath?: string) {
		if (this.testFile) await this.runSuite(undefined, targetPath);
		else await Promise.all(this.suites?.map(suite => this.runSuite(suite)) ?? []);
		if (!page.parentNode) {
			document.body.addEventListener('click', ev => {
				onClick(this, ev).catch(e => console.error(e));
			});
			document.body.appendChild(page);
		}
	}
}

export default BrowserRunner;
