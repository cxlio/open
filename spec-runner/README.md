# @cxl/spec-runner 
	
[![npm version](https://badge.fury.io/js/%40cxl%2Fspec-runner.svg)](https://badge.fury.io/js/%40cxl%2Fspec-runner)

A test runner CLI that supports node and browser testing, baseline updates, coverage control, virtual file server, and custom server integration, with reporting and debugging support.

## Project Details

-   Branch Version: [0.4.0](https://npmjs.com/package/@cxl/spec-runner/v/0.4.0)
-   License: GPL-3.0
-   Documentation: [Link](https://cxlio.github.io/docs/@cxl/spec-runner)
-   Report Issues: [Github](https://github.com/cxlio/open/issues)

## Installation

	npm install @cxl/spec-runner

## Usage

```sh
cxl-spec [entryFile] [options]
```

- `entryFile` defaults to `./test.js`
- JSON report defaults to `test-report.json`

## Options

- `--node` Run specs using the Node.js runner (no browser).
- `--baselinePath <dir>` Directory containing baseline files used for comparisons.
- `--updateBaselines` Overwrite baselines with current outputs.
- `--ignoreCoverage` Skip generating the coverage report.
- `--mjs` Treat spec files as ES modules (ESM) when executing.
- `--inspect` Enable the Node.js inspector for debugging.
- `--disableSecurity` Disable browser web security (e.g., CORS) for the browser runner.
- `--browserUrl <url>` Initial URL to open in the browser runner.
- `--vfsRoot <dir>` Root directory to serve via the virtual file server.
- `--startServer "<command>"` Start an external server while tests run (e.g. `npm run dev`).
- `--reportPath <path>` Path to write the JSON test report (default: `test-report.json`).

## Examples

Run with default entry file:

```sh
cxl-spec
```

Run a specific entry file:

```sh
cxl-spec ./path/to/test.js
```

Update baselines:

```sh
cxl-spec ./test.js --baselinePath ./baselines --updateBaselines
```

Write report to a custom path:

```sh
cxl-spec ./test.js --reportPath ./artifacts/test-report.json
```

### Feature list

- **Two execution backends**
    - **Node runner**: imports the suite and runs it.
    - **Puppeteer runner**: runs the suite in headless Chromium.

- **Coverage reporting**
    - **Node**: uses the Node inspector `Profiler.startPreciseCoverage()`.
    - **Puppeteer**: uses `page.coverage.startJSCoverage()` / `stopJSCoverage()`.

- **Virtual file server for browser runs**
    - Resolves bare/aliased imports using `resolveImport()` and redirects to the resolved path when needed.
    - Captures served `.js` sources for coverage mapping.

- **Import maps (browser)**
    - If `--importmap` is provided, injects it as `<script type="importmap">...</script>` before importing the suite.

- **Console + page error capture (browser)**
    - Logs browser `console.*` messages (with URL/line) and prints structured values (including `Error` stacks).
    - Collects `pageerror` and `requestfailed` diagnostics and folds them into test results.

- **Visual regression testing (puppeteer)**
    - Compares to baselines in `--baselinePath` byte-for-byte (PNG decoded check).
    - `--updateBaselines` overwrites baselines.

- **Deterministic screenshot environment (browser)**
    - Fixed viewport/window size and device scale factor; disables GPU/infobars/scrollbars; stabilizes font rendering and throttling behavior; optional `--disableSecurity` to disable web security.

- **Debugging**
    - **Node**: `--inspect` opens inspector and waits for debugger attach (and optionally pauses after coverage).
    - **Browser**: runs headless with verbose runtime logging of browser-side errors/console.

- **Basic interaction commands (browser)**
    - Supports `click`, `tap`, `hover`, `type`, `press`, and a `concurrency` capability response.
