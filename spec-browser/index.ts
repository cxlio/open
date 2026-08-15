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
	onVisible,
	styleAttribute,
	tsx,
	theme,
} from '@cxl/ui';

declare global {
	interface Window {
		__cxlRunner: (
			data: RunnerCommand,
		) => RunnerResult | Promise<RunnerResult>;
	}
}

interface RunnerResult {
	success: boolean;
	message: string;
	failureMessage?: string;
	data?: RunnerCommand;
}

interface RunnerConfig {
	testFile?: string;
	suites?: Test[];
	baselinePath?: string;
}

theme.globalCss += `
.specification { box-sizing: border-box; max-width: 840px; margin: 64px auto 96px; padding: 0 32px; width: 100%; }
.specification-header { border-bottom: 1px solid var(--cxl-color-outline-variant, #ddd); margin-bottom: 48px; padding-bottom: 24px; }
.specification-header h1 { font-size: 2.25rem; letter-spacing: -0.025em; line-height: 1.15; margin: 0 0 12px; }
.specification-summary { color: var(--cxl-color-on-surface-variant, #555); font-size: 0.9375rem; margin: 0; }
.specification-section { margin: 32px 0; }
.specification-section .specification-section { margin: 24px 0 0; }
.specification-section h2, .specification-section h3, .specification-section h4, .specification-section h5, .specification-section h6 { line-height: 1.3; margin: 0 0 12px; }
.specification-section h2 { border-bottom: 1px solid var(--cxl-color-outline-variant, #ddd); font-size: 1.5rem; padding-bottom: 10px; }
.specification-section h3 { font-size: 1.25rem; }
.specification-section h4 { font-size: 1.0625rem; }
.specification-section h5, .specification-section h6 { font-size: 1rem; }
.specification-section a { color: inherit; text-decoration: none; }
.specification-section a:hover { text-decoration: underline; }
.specification-prose { line-height: 1.7; margin: 0 0 16px; }
.specification-evidence { margin: 0; padding-left: 28px; }
.specification-evidence > li { border-top: 1px solid var(--cxl-color-outline-variant, #ddd); padding: 10px 0; }
.specification-evidence > li::marker { color: var(--cxl-color-primary, #1769aa); font-weight: 700; }
.specification-evidence .failure { color: var(--cxl-color-error, #b3261e); }
.specification-evidence pre { overflow: auto; white-space: pre-wrap; }
.specification-assertions { margin-top: 12px; }
.specification-assertions > summary { cursor: pointer; color: var(--cxl-color-on-surface-variant, #555); }
.screenshot-evidence { color: var(--cxl-color-on-surface, #222); margin: 0; }
.screenshot-evidence > figcaption { align-items: baseline; display: flex; flex-wrap: wrap; gap: 8px 16px; justify-content: space-between; margin-bottom: 12px; }
.screenshot-evidence-title { font-weight: 700; }
.screenshot-status { color: var(--cxl-color-on-surface-variant, #555); font-size: 0.875rem; }
.failure .screenshot-status { color: var(--cxl-color-error, #b3261e); }
.screenshot-comparison { display: grid; gap: 12px; grid-template-columns: repeat(auto-fit, minmax(min(200px, 100%), 1fr)); }
.screenshot-passing-image { display: block; height: auto; margin: 0 auto; max-width: 100%; }
.screenshot-panel { background: var(--cxl-color-surface-container-low, #f7f7f7); border: 1px solid var(--cxl-color-outline-variant, #ddd); border-radius: 4px; margin: 0; min-width: 0; overflow: hidden; }
.screenshot-panel > figcaption { color: var(--cxl-color-on-surface-variant, #555); font-size: 0.75rem; font-weight: 700; letter-spacing: 0.06em; padding: 8px 10px; text-transform: uppercase; }
.screenshot-panel > img, .screenshot-panel > spec-image-diff { border-top: 1px solid var(--cxl-color-outline-variant, #ddd); display: block; width: 100%; }
.screenshot-panel > img { height: auto; }
.screenshot-preview { margin-top: 12px; }
.screenshot-preview button { background: none; border: 0; color: var(--cxl-color-primary, #1769aa); cursor: pointer; font: inherit; padding: 4px 0; text-decoration: underline; }
.screenshot-preview iframe { background: white; border: 1px solid var(--cxl-color-outline-variant, #ddd); box-sizing: border-box; display: block; height: 320px; margin-top: 8px; width: 100%; }
`;

let browserBaselinePath = 'spec';

window.__cxlRunner = async data => {
	if (data.type === 'figure') {
		const actual = (data.actual ??= `spec/${data.name}.png`);
		const baseline = (data.baseline ??= `${browserBaselinePath}/${data.name}.png`);
		try {
			const comparison = await imageDiff(actual, baseline);
			const success = comparison.diffBytes === 0;
			return {
				success,
				message: '',
				failureMessage: 'Screenshot should match baseline',
				data,
			};
		} catch {
			return {
				success: false,
				message: '',
				failureMessage: 'Screenshot comparison unavailable',
				data,
			};
		}
	}

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
		if (targetPath) params.set(FRAME_TARGET_PARAMETER, targetPath);
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
	tsx('style', undefined, 'body { tab-size: 4; }'),
	output,
);

const ENTITIES_REGEX = /[&<>"]/g,
	ENTITIES_MAP: Record<string, string> = {
		'&': '&amp;',
		'<': '&lt;',
		'>': '&gt;',
		'"': '&quot;',
	};

export function escapeHtml(str: string) {
	return str.replace(ENTITIES_REGEX, e => ENTITIES_MAP[e] || '');
}

function previewDocument(html: string, testFile?: string) {
	const resources = Array.from(
		document.head.querySelectorAll(
			'link[rel="stylesheet"], script[type="importmap"], script[src]',
		),
	)
		.map(node => node.outerHTML)
		.join('\n');
	const testModule = testFile
		? `<script type="module">import ${JSON.stringify(testFile).replace(/</g, '\\u003c')}</script>`
		: '';
	return `<!doctype html><html><head><base href="${escapeHtml(document.baseURI)}">${resources}${testModule}</head><body>${html}</body></html>`;
}

function screenshotPanel(label: string, content: Element) {
	return tsx(
		'figure',
		{ className: 'screenshot-panel' },
		tsx('figcaption', undefined, label),
		content,
	);
}

function printFigureResult(
	result: Result,
	baselinePath = 'spec',
	testFile?: string,
) {
	const data = result.data;
	if (data?.type !== 'figure') throw new Error('Missing figure data');
	const actual = data.actual ?? `spec/${data.name}.png`;
	const baseline = data.baseline ?? `${baselinePath}/${data.name}.png`;
	const screenshot = result.success
		? tsx('img', {
				className: 'screenshot-passing-image',
				src: actual,
				alt: `${data.name} screenshot`,
			})
		: tsx(
				'div',
				{ className: 'screenshot-comparison' },
				screenshotPanel(
					'Actual',
					tsx('img', {
						src: actual,
						alt: `${data.name} actual screenshot`,
					}),
				),
				screenshotPanel(
					'Baseline',
					tsx('img', {
						src: baseline,
						alt: `${data.name} baseline screenshot`,
					}),
				),
				screenshotPanel(
					'Difference',
					tsx(ImageDiff, { src1: actual, src2: baseline }),
				),
			);
	const preview = tsx(
		'div',
		{ className: 'screenshot-preview' },
		tsx('button', { type: 'button' }, 'Preview HTML'),
	);
	const button = preview.querySelector('button');
	button?.addEventListener('click', () => {
		const existing = preview.querySelector('iframe');
		if (existing) {
			existing.hidden = !existing.hidden;
			button.textContent = existing.hidden ? 'Preview HTML' : 'Hide preview';
			return;
		}
		const frame = tsx('iframe', {
			title: `${data.name} HTML preview`,
		});
		frame.setAttribute('sandbox', 'allow-same-origin allow-scripts');
		frame.srcdoc = previewDocument(data.html, testFile);
		preview.append(frame);
		button.textContent = 'Hide preview';
	});
	const caption = tsx(
		'figcaption',
		undefined,
		tsx('span', { className: 'screenshot-evidence-title' }, data.name),
	);
	const status = result.success ? result.message : result.failureMessage;
	if (status)
		caption.append(
			tsx('span', { className: 'screenshot-status' }, status),
		);

	const figure = tsx(
		'figure',
		{
			className: `screenshot-evidence ${result.success ? 'success' : 'failure'}`,
		},
		caption,
		screenshot,
		preview,
	);
	if (!result.success && result.stack)
		figure.append(tsx('pre', undefined, result.stack));
	return figure;
}

function printResult(result: Result) {
	const div = tsx('div', {
		className: result.success ? 'success' : 'failure',
	});
	div.append(result.success ? (result.message ?? '') : result.failureMessage);
	if (!result.success && result.stack)
		div.append(tsx('pre', undefined, result.stack));

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

	for (let y = 0; y < h; y++) {
		for (let x = 0; x < w; x++) {
			const i = (y * w + x) * 4;
			const indexA = (y * A.width + x) * 4;
			const indexB = (y * B.width + x) * 4;
			const match =
				x < A.width &&
				y < A.height &&
				x < B.width &&
				y < B.height &&
				A.data[indexA] === B.data[indexB] &&
				A.data[indexA + 1] === B.data[indexB + 1] &&
				A.data[indexA + 2] === B.data[indexB + 2] &&
				A.data[indexA + 3] === B.data[indexB + 3];
			if (!match) diffBytes += 4;
			diff[i] = diff[i + 3] = match ? 0 : 0xff;
		}
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
		display: block;
	}
	.diff {
		display: block;
		height: auto;
		max-width: 100%;
		width: 100%;
	}
	:host([hidediff]) .diff { opacity: 0 }
	.summary {
		color: var(--cxl-color-on-surface-variant, #555);
		font-size: 0.75rem;
		margin: 0;
		padding: 8px 10px;
	}
`),
		$ => {
			const C = document.createElement('canvas');
			C.className = 'diff';
			C.ariaLabel = 'rendered diff';
			C.role = 'img';
			const summary = tsx('p', { className: 'summary' }, 'Comparing images…');
			summary.ariaLive = 'polite';
			const ctx = C.getContext('2d');

			function render() {
				if (!ctx) throw new Error('No rendering context');
				if (!$.src1 || !$.src2) return;

				imageDiff($.src1, $.src2).then(
					value => {
						$.value = value;
						C.width = value.diff.width;
						C.height = value.diff.height;
						ctx.putImageData(value.diff, 0, 0);
						const changed = value.diffBytes / 4;
						const pixels = value.size / 4;
						const percentage = pixels ? (changed / pixels) * 100 : 0;
						const formatted =
							percentage > 0 && percentage < 0.01
								? '<0.01'
								: percentage.toFixed(2).replace(/\.00$/, '');
						summary.textContent = `${changed.toLocaleString()} changed pixels (${formatted}%) · actual ${value.imageA.width}×${value.imageA.height} · baseline ${value.imageB.width}×${value.imageB.height}`;
						C.ariaLabel = summary.textContent;
					},
					e => {
						summary.textContent = 'Comparison unavailable';
						console.error(e);
					},
				);
			}

			$.shadowRoot?.append(C, summary);

			return merge(
				onVisible($).switchMap(() =>
					merge(get($, 'src1'), get($, 'src2')).raf(render),
				),
				get($, 'ratio').raf(val => (C.style.opacity = val.toString())),
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
		browserBaselinePath = config.baselinePath ?? 'spec';
	}

	async runSuite(suite?: Test | BrowserTestResult, targetPath?: string) {
		let result: Test | BrowserTestResult;
		if (this.testFile)
			result = await runTestFile(this.testFile, targetPath);
		else {
			if (!suite || !('run' in suite))
				throw new Error('Missing test suite');
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
		parentLevel?: number,
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
		if (
			test.level === 0 ||
			(test.level === undefined && parentLevel !== undefined)
		)
			section.append(
				tsx('p', { className: 'specification-prose' }, test.name),
			);
		else {
			const link = tsx(
				'a',
				{ href: '#' },
				`${test.name}${failureCount > 0 ? ` (${failureCount} failures)` : ''}`,
			);
			link.dataset.test = testPath;
			section.append(
				tsx(headingTag(test.level ?? depth), undefined, link),
			);
		}
		const evidence = results.filter(
			result => result.data?.type === 'figure',
		);
		if (evidence.length)
			section.append(
				tsx(
					'ol',
					{ className: 'specification-evidence' },
					...evidence.map(result =>
						tsx(
							'li',
							undefined,
							printFigureResult(
								result,
								this.baselinePath,
								this.testFile,
							),
						),
					),
				),
			);
		const assertions = results.filter(
			result => result.data?.type !== 'figure',
		);
		if (assertions.length) {
			const failures = assertions.filter(
				result => !result.success,
			).length;
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
							tsx(
								'li',
								undefined,
								printResult(result),
							),
						),
					),
				),
			);
		}
		parent.append(section);

		if (test.only.length)
			test.only.forEach(child =>
				this.renderTestReport(
					child,
					testPath,
					depth + 1,
					section,
					test.level,
				),
			);
		else
			test.tests.forEach(child =>
				this.renderTestReport(
					child,
					testPath,
					depth + 1,
					section,
					test.level,
				),
			);
	}

	async run(targetPath?: string) {
		if (this.testFile) await this.runSuite(undefined, targetPath);
		else
			await Promise.all(
				this.suites?.map(suite => this.runSuite(suite)) ?? [],
			);
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
