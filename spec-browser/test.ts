import { spec } from '../spec/index.js';
import browserRunner, { imageDataDiff, runTestFile } from './index.js';

export default spec('tester', s => {
	s.test('browser-runner', a => {
		a.ok(browserRunner);
	});

	s.test('compares figure image sources in the browser report', async a => {
		const image = (color: string) =>
			`data:image/svg+xml,${encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" width="1" height="1"><path fill="${color}" d="M0 0h1v1H0z"/></svg>`)}`;
		const actual = image('red');
		const matching = await window.__cxlRunner({
			type: 'figure',
			name: 'matching',
			html: '',
			domId: 'matching',
			actual,
			baseline: actual,
		});
		const differing = await window.__cxlRunner({
			type: 'figure',
			name: 'differing',
			html: '',
			domId: 'differing',
			actual,
			baseline: image('blue'),
		});
		a.ok(matching.success);
		a.equal(matching.message, '');
		a.equal(differing.success, false);
	});

	s.test('runs each test file in a fresh iframe', async a => {
		const testFile = new URL('./isolation-fixture.js', import.meta.url).href;
		const testPath = 'iframe fixture has a fresh global scope';
		const first = await runTestFile(testFile, testPath);
		const second = await runTestFile(testFile, testPath);
		a.equal(first.tests.length, 1);
		a.equal(second.tests.length, 1);
		a.ok(first.tests[0]?.results[0]?.success);
		a.ok(second.tests[0]?.results[0]?.success);
	});

	s.test('matches the parent viewport', async a => {
		const testFile = new URL('./viewport-fixture.js', import.meta.url).href;
		const result = await runTestFile(testFile);
		a.ok(result.tests[0]?.results.every(result => result.success));
	});

	s.test('resolves relative URLs from the iframe document', async a => {
		const testFile = new URL('./url-fixture.js', import.meta.url).href;
		const result = await runTestFile(testFile);
		a.ok(result.tests[0]?.results.every(result => result.success));
	});

	s.test('runs the configured test file', async a => {
		const runner = new browserRunner({
			testFile: new URL('./isolation-fixture.js', import.meta.url).href,
		});
		await runner.run('iframe fixture has a fresh global scope');
		a.ok(document.body.textContent?.includes('iframe fixture'));
		const assertions = document.querySelector(
			'.specification-assertions',
		) as HTMLDetailsElement | null;
		a.ok(assertions);
		a.equal(assertions?.open, false);
		a.ok(assertions?.textContent?.includes('assertions'));
	});

	s.test('renders specification prose as paragraph text', async a => {
		const suite = spec('document', ({ p }) => {
			p('Paragraph text', a => a.ok(true));
		});
		const runner = new browserRunner({ suites: [suite] });
		await runner.run();
		const prose = document.querySelector('.specification-prose');
		a.equal(prose?.tagName, 'P');
		a.equal(prose?.textContent, 'Paragraph text');
		a.equal(prose?.querySelector('a'), null);
	});

	s.test('renders screenshot evidence without inline source html', async a => {
		const runner = new browserRunner({});
		runner.renderSpecification({
			name: 'screenshots',
			results: [
				{
					success: false,
					failureMessage: 'Screenshot differs from baseline',
					data: {
						type: 'figure',
						name: 'button',
						html: '<c-preview-marker>Preview</c-preview-marker>',
						domId: 'button',
					},
				},
			],
			tests: [],
			only: [],
			runTime: 0,
			timeout: 0,
		});
		await runner.run();

		const figure = Array.from(
			document.querySelectorAll('.screenshot-evidence'),
		).find(
			figure =>
				figure.querySelector('.screenshot-evidence-title')?.textContent ===
				'button',
		);
		a.ok(figure);
		if (!figure) return;
		a.equal(
			figure.querySelector('.screenshot-status')?.textContent,
			'Screenshot differs from baseline',
		);
		a.equal(
			Array.from(figure.querySelectorAll('.screenshot-panel figcaption'))
				.map(caption => caption.textContent)
				.join(','),
			'Actual,Baseline,Difference',
		);
		a.equal(figure.querySelector('c-preview-marker'), null);
		a.equal(figure.querySelector('iframe'), null);

		const preview = figure.querySelector('button');
		a.equal(preview?.textContent, 'Preview HTML');
		preview?.click();
		const frame = figure.querySelector('iframe');
		a.ok(frame);
		a.ok(frame?.srcdoc.includes('<c-preview-marker>Preview</c-preview-marker>'));
		await a.a11y(figure);
	});

	s.test('renders passing screenshots without a panel', async a => {
		const runner = new browserRunner({});
		runner.renderSpecification({
			name: 'passing screenshots',
			results: [
				{
					success: true,
					failureMessage: 'Screenshot should match baseline',
					data: {
						type: 'figure',
						name: 'passing-button',
						html: '<button>Button</button>',
						domId: 'passing-button',
					},
				},
			],
			tests: [],
			only: [],
			runTime: 0,
			timeout: 0,
		});
		await runner.run();

		const figure = Array.from(
			document.querySelectorAll('.screenshot-evidence'),
		).find(
			figure =>
				figure.querySelector('.screenshot-evidence-title')?.textContent ===
				'passing-button',
		);
		a.ok(figure);
		if (!figure) return;
		a.equal(
			figure.querySelectorAll('.screenshot-panel').length,
			0,
		);
		a.ok(figure.querySelector('.screenshot-passing-image'));
		a.equal(figure.querySelector('spec-image-diff'), null);
	});

	s.test('compares pixels by coordinates when image widths differ', async a => {
		const red = [255, 0, 0, 255];
		const actual = new ImageData(
			new Uint8ClampedArray([...red, ...red]),
			1,
			2,
		);
		const baseline = new ImageData(
			new Uint8ClampedArray([
				...red,
				0,
				0,
				0,
				0,
				...red,
				0,
				0,
				0,
				0,
			]),
			2,
			2,
		);
		const result = await imageDataDiff(actual, baseline);
		a.equal(result.diff.width, 2);
		a.equal(result.diff.height, 2);
		a.equal(result.diffBytes, 8);
	});
});
