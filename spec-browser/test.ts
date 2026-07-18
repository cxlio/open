import { spec } from '../spec/index.js';
import browserRunner, { runTestFile } from './index.js';

export default spec('tester', s => {
	s.test('browser-runner', a => {
		a.ok(browserRunner);
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
});
