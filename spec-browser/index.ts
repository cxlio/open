import type { JsonResult, Result, RunnerCommand, Test } from '../spec';
import {
	Component,
	Page,
	Layout,
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
.specification { max-width: 960px; margin: 48px auto; }
.specification-header { border-bottom: 2px solid var(--cxl-color-outline, #777); margin-bottom: 32px; padding-bottom: 16px; }
.specification-header h1 { margin: 0 0 8px; }
.specification-summary { color: var(--cxl-color-on-surface-variant, #555); margin: 0; }
.specification-section { border-left: 2px solid var(--cxl-color-outline-variant, #ddd); margin: 24px 0; padding-left: 20px; }
.specification-section h2, .specification-section h3, .specification-section h4, .specification-section h5, .specification-section h6 { margin: 0 0 12px; }
.specification-section a { color: inherit; text-decoration: none; }
.specification-section a:hover { text-decoration: underline; }
.specification-evidence { margin: 0; padding-left: 28px; }
.specification-evidence > li { border-top: 1px solid var(--cxl-color-outline-variant, #ddd); padding: 10px 0; }
.specification-evidence > li::marker { color: var(--cxl-color-primary, #1769aa); font-weight: 700; }
.specification-evidence .failure { color: var(--cxl-color-error, #b3261e); }
.specification-evidence pre { overflow: auto; white-space: pre-wrap; }
.specification-assertions { margin-top: 12px; }
.specification-assertions > summary { cursor: pointer; color: var(--cxl-color-on-surface-variant, #555); }
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

const FRAME_FILE_PARAMETER = '__cxlSpecBrowserFile';
const FRAME_TARGET_PARAMETER = '__cxlSpecBrowserTarget';

export function runTestFile(testFile: string, targetPath?: string) {
	return new Promise<BrowserTestResult>((resolve, reject) => {
		const frame = document.createElement('iframe');
		frame.style.cssText =
			'position:fixed;inset:0;z-index:-1;width:100vw;height:100vh;border:0;pointer-events:none';
		const frameUrl =
			location.pathname === '/'
				? new URL('./test.html', document.baseURI)
				: new URL(location.href);
		const params = new URLSearchParams([[FRAME_FILE_PARAMETER, testFile]]);
		if (targetPath)
			params.set(FRAME_TARGET_PARAMETER, targetPath);
		frameUrl.hash = params.toString();
		frame.src = frameUrl.href;

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
output.className = 'specification';
const page = tsx(
	Page,
	{},
	tsx(
		'style',
		undefined,
		`.thumb{display:inline-block;overflow:hidden;width:320px;position:relative;vertical-align:top} body {tab-size:4}`,
	),
	output,
);

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

function printResult(result: Result, baselinePath = 'spec') {
	const div = tsx('div', {
		className: result.success ? 'success' : 'failure',
	});
	div.append(result.success ? result.message ?? '' : result.failureMessage);
	if (!result.success && result.stack)
		div.append(tsx('pre', undefined, result.stack));

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
		this.renderSpecification(result);
	}

	renderSpecification(test: Test | BrowserTestResult) {
		const summary = this.getSummary(test);
		output.append(
			tsx(
				'header',
				{ className: 'specification-header' },
				tsx('h1', undefined, `Specification: ${test.name}`),
				tsx(
					'p',
					{ className: 'specification-summary' },
					`${summary.tests} requirements · ${summary.failures} failures`,
				),
			),
		);
		this.renderTestReport(test, '', 1, output);
	}

	getSummary(test: Test | BrowserTestResult): {
		tests: number;
		failures: number;
	} {
		const children = test.only.length ? test.only : test.tests;
		return children.reduce(
			(summary, child) => {
				const childSummary = this.getSummary(child);
				return {
					tests: summary.tests + childSummary.tests,
					failures: summary.failures + childSummary.failures,
				};
			},
			{
				tests: 1,
				failures: test.results.filter(result => !result.success).length,
			},
		);
	}

	renderTestReport(
		test: Test | BrowserTestResult,
		parentPath: string,
		depth: number,
		parent: Element,
	) {
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
		const section = tsx('section', { className: 'specification-section' });
		const link = tsx(
			'a',
			{ href: '#' },
			`${test.name}${failureCount > 0 ? ` (${failureCount} failures)` : ''}`,
		);
		link.dataset.test = testPath;
		section.append(tsx(headingTag(depth), undefined, link));
		const evidence = results.filter(result => result.data?.type === 'figure');
		if (evidence.length)
			section.append(
				tsx(
					'ol',
					{ className: 'specification-evidence' },
					...evidence.map(result =>
						tsx('li', undefined, printResult(result, this.baselinePath)),
					),
				),
			);
		const assertions = results.filter(result => result.data?.type !== 'figure');
		if (assertions.length) {
			const failures = assertions.filter(result => !result.success).length;
			section.append(
				tsx(
					'details',
					{
						className: 'specification-assertions',
						open: failures > 0,
					},
					tsx(
						'summary',
						undefined,
						`${assertions.length} assertions${failures ? ` · ${failures} failures` : ''}`,
					),
					tsx(
						'ol',
						{ className: 'specification-evidence' },
						...assertions.map(result =>
							tsx('li', undefined, printResult(result, this.baselinePath)),
						),
					),
				),
			);
		}
		parent.append(section);

		if (test.only.length)
			test.only.forEach(child =>
				this.renderTestReport(child, testPath, depth + 1, section),
			);
		else
			test.tests.forEach(child =>
				this.renderTestReport(child, testPath, depth + 1, section),
			);
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

function headingTag(depth: number) {
	switch (Math.min(depth + 1, 6)) {
		case 3:
			return 'h3';
		case 4:
			return 'h4';
		case 5:
			return 'h5';
		case 6:
			return 'h6';
		default:
			return 'h2';
	}
}

export default BrowserRunner;
