# @cxl/spec 
	
[![npm version](https://badge.fury.io/js/%40cxl%2Fspec.svg)](https://badge.fury.io/js/%40cxl%2Fspec)

This library provides a comprehensive testing framework tailored for browser environments, offering utilities for defining tests, assertions, DOM manipulations, event handling, mocking, spying, and accessibility checks.

## Project Details

-   Branch Version: [1.1.0](https://npmjs.com/package/@cxl/spec/v/1.1.0)
-   License: Apache-2.0
-   Documentation: [Link](https://cxlio.github.io/docs/@cxl/spec)
-   Report Issues: [Github](https://github.com/cxlio/open/issues)

## Installation

	npm install @cxl/spec

## Features

-   Define synchronous and asynchronous tests and test suites with `Test` and `TestApi`.
-   Assertions for equality, partial matching, buffer comparison, throwing errors, and custom assertions.
-   DOM manipulation helpers and connected test DOM containers.
-   Event expectation and testing utilities with promise-based APIs.
-   Mocking and spying of functions and properties.
-   Accessibility testing integration.
-   Advanced time mocking for `setTimeout`, `setInterval`, and `requestAnimationFrame`.
-   Actions like hover, tap, click, type, and press with runner command integration.
-   Figure-based visual testing support.
-   Calibrated synchronous and asynchronous browser benchmarks.
-   Structured JSON result output for tests.

### Defining Tests

```ts
import { spec } from '@cxl/spec';

spec('Example test', async test => {
	test.ok(true, 'This test should pass');
	test.equal(1 + 1, 2, 'Math works');

	await test.testElement('test a DOM element', async a => {
		const el = a.element('div');
		a.ok(el instanceof HTMLElement, 'Element created');
	});
});
```

### Benchmarks

Benchmark identity comes from the enclosing test path. The callback is repeated
during warmup and sampling, so it must be safe to run multiple times.

```ts
import { spec } from '@cxl/spec';

export default spec('compiler benchmarks', s => {
	s.test('compile module', a =>
		a.benchmark(() => compile(source)),
	);
});
```

Projects using `@cxl/build` place benchmarks in `test-benchmark.ts` and run them
with `npm run build benchmark`.
