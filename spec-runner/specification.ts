import type { FigureData, JsonResult, Result } from '../spec/index.js';

export const specificationCss = `
html { background: var(--cxl-color-surface, #fff); }
body { color: var(--cxl-color-on-surface, #1b1b1b); font-family: Inter, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; line-height: 1.6; margin: 0; tab-size: 4; }
c-page { display: block; min-height: 100vh; }
c-layout.specification { box-sizing: border-box; display: block; margin: 0 auto; max-width: 900px; padding: 24px clamp(20px, 5vw, 64px) 96px; width: 100%; }
.specification-header { margin-bottom: 48px; }
.specification-kicker { color: var(--cxl-color-primary, #0069c2); font-size: 0.75rem; font-weight: 700; letter-spacing: 0.12em; margin: 0 0 4px; text-transform: uppercase; }
.specification-header h1 { font-size: clamp(2.25rem, 6vw, 3rem); letter-spacing: -0.035em; line-height: 1.12; margin: 0 0 12px; }
.specification-summary { color: var(--cxl-color-on-surface-variant, #4e4e4e); font-size: 0.875rem; margin: 0; }
.specification-root { margin: 0; }
.specification-section { margin: 48px 0 0; }
.specification-section .specification-section { margin-top: 32px; }
.specification-section h2, .specification-section h3, .specification-section h4, .specification-section h5, .specification-section h6 { font-weight: 600; letter-spacing: -0.015em; line-height: 1.3; margin: 0 0 16px; scroll-margin-top: 24px; }
.specification-section h2 { border-bottom: 1px solid var(--cxl-color-outline-variant, #d8d8d8); font-size: 1.75rem; padding-bottom: 8px; }
.specification-section h3 { font-size: 1.4rem; }
.specification-section h4 { font-size: 1.15rem; }
.specification-section h5, .specification-section h6 { font-size: 1rem; }
.specification-prose { font-size: 1rem; line-height: 1.75; margin: 0 0 20px; max-width: 72ch; }
.specification-evidence { margin: 12px 0 0; padding-left: 24px; }
.specification-evidence > li { margin: 8px 0; padding-left: 4px; }
.specification-evidence > li::marker { color: var(--cxl-color-on-surface-variant, #666); font-weight: 600; }
.specification-evidence .failure { background: var(--cxl-color-error-container, #ffdad6); border-left: 4px solid var(--cxl-color-error, #ba1a1a); color: var(--cxl-color-on-error-container, #410002); padding: 12px 16px; }
.specification-evidence pre { background: var(--cxl-color-surface-container, #f2f2f2); border-radius: 4px; color: var(--cxl-color-on-surface, #1b1b1b); font: 0.8125rem/1.55 ui-monospace, SFMono-Regular, Consolas, monospace; margin: 12px 0 0; overflow: auto; padding: 16px; white-space: pre-wrap; }
.specification-assertions { border-left: 3px solid var(--cxl-color-outline-variant, #d8d8d8); margin-top: 16px; padding-left: 16px; }
.specification-assertions[open] { border-left-color: var(--cxl-color-error, #ba1a1a); }
.specification-assertions > summary { color: var(--cxl-color-on-surface-variant, #4e4e4e); cursor: pointer; font-size: 0.875rem; font-weight: 600; padding: 4px 0; }
.specification-assertions > summary:hover { color: var(--cxl-color-on-surface, #1b1b1b); }
.screenshot-evidence { color: var(--cxl-color-on-surface, #1b1b1b); margin: 24px 0 0; }
.screenshot-evidence > figcaption { align-items: baseline; display: flex; flex-wrap: wrap; gap: 8px 16px; justify-content: space-between; margin-bottom: 12px; }
.screenshot-evidence-title { font-weight: 700; }
.screenshot-status { color: var(--cxl-color-on-surface-variant, #4e4e4e); font-size: 0.8125rem; }
.failure .screenshot-status { color: var(--cxl-color-error, #ba1a1a); font-weight: 600; }
.screenshot-comparison { display: grid; gap: 16px; grid-template-columns: repeat(auto-fit, minmax(min(240px, 100%), 1fr)); }
.screenshot-passing-image { border: 1px solid var(--cxl-color-outline-variant, #d8d8d8); border-radius: 4px; display: block; height: auto; max-width: 100%; }
.screenshot-panel { background: var(--cxl-color-surface-container-low, #f7f7f7); border: 1px solid var(--cxl-color-outline-variant, #d8d8d8); border-radius: 4px; margin: 0; min-width: 0; overflow: hidden; }
.screenshot-panel > figcaption { color: var(--cxl-color-on-surface-variant, #4e4e4e); font-size: 0.6875rem; font-weight: 700; letter-spacing: 0.08em; padding: 8px 12px; text-transform: uppercase; }
.screenshot-panel > img { border-top: 1px solid var(--cxl-color-outline-variant, #d8d8d8); display: block; height: auto; width: 100%; }
@media (max-width: 600px) {
	c-layout.specification { padding: 16px 18px 64px; }
	.specification-header { margin-bottom: 32px; }
	.specification-section { margin-top: 36px; }
}
@media print {
	c-layout.specification { max-width: none; padding: 0; }
	.specification-assertions:not([open]) > :not(summary) { display: block; }
}
`;

const HTML_ENTITIES = /[&<>"']/g;
const HTML_ENTITY: Record<string, string> = {
	'&': '&amp;',
	'<': '&lt;',
	'>': '&gt;',
	'"': '&quot;',
	"'": '&#39;',
};

export function escapeSpecificationHtml(value: string) {
	return value.replace(HTML_ENTITIES, character => HTML_ENTITY[character] ?? '');
}

export type SpecificationHeading = 'h2' | 'h3' | 'h4' | 'h5' | 'h6';

export function specificationHeading(level: number): SpecificationHeading {
	switch (Math.min(Math.max(level + 1, 2), 6)) {
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

export function summarizeSpecification(test: JsonResult): {
	tests: number;
	failures: number;
} {
	if (test.skipped) return { tests: 0, failures: 0 };
	const children = test.only.length ? test.only : test.tests;
	return children.reduce(
		(summary, child) => {
			const childSummary = summarizeSpecification(child);
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

export function specificationCount(count: number, label: string) {
	return `${count} ${label}${count === 1 ? '' : 's'}`;
}

export function specificationFigureSources(
	data: FigureData,
	baselinePath = 'spec',
) {
	return {
		actual: data.actual ?? `spec/${data.name}.png`,
		baseline: data.baseline ?? `${baselinePath}/${data.name}.png`,
	};
}

export function specificationResults(
	test: Pick<JsonResult, 'results' | 'tests' | 'only' | 'skipped'>,
) {
	if (test.skipped) return [];
	const results = [...test.results];
	if (!results.length && !test.tests.length && !test.only.length)
		results.push({ success: false, failureMessage: 'No assertions found' });
	return results;
}

function renderResult(result: Result) {
	const message = result.success ? result.message : result.failureMessage;
	const stack = !result.success && result.stack
		? `<pre>${escapeSpecificationHtml(result.stack)}</pre>`
		: '';
	return `<div class="${result.success ? 'success' : 'failure'}">${escapeSpecificationHtml(message ?? '')}${stack}</div>`;
}

function renderScreenshot(result: Result, baselinePath: string) {
	const data = result.data;
	if (data?.type !== 'figure') return '';
	const { actual, baseline } = specificationFigureSources(data, baselinePath);
	const status = result.success ? result.message : result.failureMessage;
	const image = result.success
		? `<img class="screenshot-passing-image" src="${escapeSpecificationHtml(actual)}" alt="${escapeSpecificationHtml(`${data.name} screenshot`)}">`
		: `<div class="screenshot-comparison"><figure class="screenshot-panel"><figcaption>Actual</figcaption><img src="${escapeSpecificationHtml(actual)}" alt="${escapeSpecificationHtml(`${data.name} actual screenshot`)}"></figure><figure class="screenshot-panel"><figcaption>Baseline</figcaption><img src="${escapeSpecificationHtml(baseline)}" alt="${escapeSpecificationHtml(`${data.name} baseline screenshot`)}"></figure></div>`;
	const statusHtml = status
		? `<span class="screenshot-status">${escapeSpecificationHtml(status)}</span>`
		: '';
	const stack = !result.success && result.stack
		? `<pre>${escapeSpecificationHtml(result.stack)}</pre>`
		: '';
	return `<figure class="screenshot-evidence ${result.success ? 'success' : 'failure'}"><figcaption><span class="screenshot-evidence-title">${escapeSpecificationHtml(data.name)}</span>${statusHtml}</figcaption>${image}${stack}</figure>`;
}

function renderTest(
	test: JsonResult,
	depth: number,
	baselinePath: string,
	parentLevel?: number,
): string {
	if (test.skipped) return '';
	const results = specificationResults(test);
	const children = test.only.length ? test.only : test.tests;
	const failures = results.filter(result => !result.success).length;
	const title = depth === 0
		? ''
		: test.level === 0 || (test.level === undefined && parentLevel !== undefined)
		? `<p class="specification-prose">${escapeSpecificationHtml(test.name)}</p>`
		: (() => {
				const heading = specificationHeading(test.level ?? depth);
				return `<${heading}>${escapeSpecificationHtml(test.name)}${failures ? ` (${failures} failures)` : ''}</${heading}>`;
			})();
	const figures = results.filter(result => result.data?.type === 'figure');
	const evidence = figures.length
		? `<ol class="specification-evidence">${figures.map(result => `<li>${renderScreenshot(result, baselinePath)}</li>`).join('')}</ol>`
		: '';
	const assertions = results.filter(result => result.data?.type !== 'figure');
	const assertionFailures = assertions.filter(result => !result.success).length;
	const assertionList = assertions.length
		? `<details class="specification-assertions"${assertionFailures ? ' open' : ''}><summary>${specificationCount(assertions.length, 'assertion')}${assertionFailures ? ` · ${specificationCount(assertionFailures, 'failure')}` : ''}</summary><ol class="specification-evidence">${assertions.map(result => `<li>${renderResult(result)}</li>`).join('')}</ol></details>`
		: '';
	return `<section class="${depth === 0 ? 'specification-root' : 'specification-section'}">${title}${evidence}${assertionList}${children.map(child => renderTest(child, depth + 1, baselinePath, test.level)).join('')}</section>`;
}

export interface SpecificationDocumentOptions {
	baselinePath?: string;
	uiModule?: string;
}

export function renderSpecificationDocument(
	test: JsonResult,
	options: SpecificationDocumentOptions = {},
) {
	const renderedTest = test.skipped
		? {
				...test,
				skipped: false,
				results: [
					{ success: false, failureMessage: 'No tests matched' },
				],
				tests: [],
				only: [],
			}
		: test;
	const summary = test.skipped
		? { tests: 0, failures: 1 }
		: summarizeSpecification(test);
	const uiModule = options.uiModule ??
		'https://cdn.jsdelivr.net/npm/@cxl/ui@6.0.0/index.js';
	const content = renderTest(renderedTest, 0, options.baselinePath ?? 'spec');
	return `<!doctype html>
<html lang="en">
<head>
	<meta charset="utf-8">
	<meta name="viewport" content="width=device-width, initial-scale=1">
	<title>Specification: ${escapeSpecificationHtml(test.name)}</title>
	<script type="module" src="${escapeSpecificationHtml(uiModule)}"></script>
	<style>${specificationCss}</style>
</head>
<body>
	<c-page><c-layout type="block" center class="specification"><header class="specification-header"><p class="specification-kicker">Specification</p><h1>${escapeSpecificationHtml(test.name)}</h1><p class="specification-summary">${specificationCount(summary.tests, 'requirement')} · ${specificationCount(summary.failures, 'failure')}</p></header>${content}</c-layout></c-page>
</body>
</html>`;
}
