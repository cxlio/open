import { Browser, CoverageEntry, Page, HTTPRequest } from 'puppeteer';
import * as puppeteer from 'puppeteer';
import { readFile, writeFile, mkdir } from 'fs/promises';
import { resolve, join } from 'path';
import type { FigureData, RunnerCommand, Test, Result } from '@cxl/spec';
import type { SpecRunner } from './index.js';
import type { PNG } from 'pngjs';

import { TestCoverage, generateReport } from './report.js';

interface Output {
	path: string;
	source: string;
}

async function startTracing(page: Page) {
	await Promise.all([
		page.coverage.startJSCoverage({
			reportAnonymousScripts: true,
		}),
		//page.tracing.start({ path: 'trace.json' }),
	]);
}

async function handleConsole(msg: puppeteer.ConsoleMessage, app: SpecRunner) {
	const type = msg.type();
	const { url, lineNumber } = msg.location();
	const lineText = lineNumber !== undefined ? ` (${lineNumber})` : '';
	app.log(`console ${type}: ${url}${lineText}`);
	for (const arg of msg.args())
		try {
			console.log(
				await arg.evaluate(v => {
					if (v instanceof Error) {
						return { message: v.message, stack: v.stack };
					}

					return JSON.stringify(v, null, 2);
				}),
			);
		} catch (e) {
			console.log(arg.toString());
		}
}

async function openPage(browser: Browser) {
	const context = await browser.createBrowserContext();
	return await context.newPage();
}

async function createPage(
	app: SpecRunner,
	browser: Browser,
	sources: Output[],
	concurrency: number,
) {
	const page = await openPage(browser);

	function cxlRunner(cmd: RunnerCommand): Promise<Result> | Result {
		const type = cmd.type;
		if (type === 'figure') {
			try {
				return handleFigureRequest(page, cmd, app);
			} catch (e) {
				return {
					success: false,
					message: String(e) || 'Unknown Error',
				};
			}
		} else if (type === 'hover' || type === 'tap' || type === 'click') {
			return page
				.$(cmd.element)
				.then(el => {
					if (!el)
						throw new Error(
							`Element for selector "${cmd.element}" not found.`,
						);
					return el[type]();
				})
				.then(() => {
					return {
						success: true,
						message: 'Element',
					};
				});
		} else if (type === 'type' || type === 'press') {
			return page
				.$(cmd.element)
				.then(el => {
					if (!el)
						throw new Error(
							`Element for selector "${cmd.element}" not found.`,
						);
					return el[type](cmd.value as puppeteer.KeyInput);
				})
				.then(() => {
					return {
						success: true,
						message: 'Element',
					};
				});
		} else if (type === 'testElement') {
			return { success: true, message: 'testElement supported' };
		} else if (type === 'concurrency') {
			return { success: true, message: 'Concurrency', concurrency };
		}

		return {
			success: false,
			message: `Feature not supported: ${type}`,
		};
	}

	page.on('console', msg => handleConsole(msg, app));
	page.on('pageerror', msg => app.log(msg));
	page.on('requestfailed', req => {
		// A detailed error message
		app.log(
			`requestfailed: ${req.method()} ${req.url()} ${req.failure()
				?.errorText}`,
		);
	});
	page.exposeFunction('__cxlRunner', cxlRunner);

	if (!app.firefox) await startTracing(page);

	if (app.vfsRoot) {
		await page.setRequestInterception(true);
		virtualFileServer(app, page);
	}

	if (app.browserUrl) await goto(app, page, app.browserUrl);

	// Prevent unexpected focus behavior
	await page.bringToFront();

	const suite = await mjsRunner(page, sources, app);
	if (!suite) throw new Error('Invalid suite');

	const coverage = app.ignoreCoverage
		? undefined
		: await generateCoverage(page, sources);

	return { suite, coverage };
}

function virtualFileServer(app: SpecRunner, page: Page) {
	const root = resolve(app.vfsRoot ?? process.cwd());
	app.log(`Starting virtual file server on "${root}"`);

	async function handle(req: HTTPRequest, url: URL) {
		let body: string | Buffer = '';
		let status = 200;
		try {
			body =
				url.pathname === '/'
					? ''
					: await readFile(join(root, url.pathname));
		} catch (e) {
			if (
				e &&
				typeof e === 'object' &&
				'code' in e &&
				e.code === 'ENOENT'
			)
				status = 404;
		}
		app.log(`[vfs] ${url.pathname} ${status}`);

		req.respond({
			headers: {
				'Access-Control-Allow-Origin': '*',
			},
			status,
			contentType: url.pathname.endsWith('.js')
				? 'application/javascript'
				: 'text/plain',
			body,
		});
	}

	page.on('request', req => {
		const url = new URL(req.url());
		if (url.origin !== 'http://localhost:9999') return;
		console.log('vfs: ' + url);
		return handle(req, url);
	});
}

function getCxlPath(pathname: string) {
	const [, , lib, file] = pathname.split('/');
	const actualFile = file
		? `${file}${file.endsWith('js') ? '' : '.js'}`
		: 'index.js';
	return `../../node_modules/@cxl/${lib}/mjs/${actualFile}`;
}

function goto(app: SpecRunner, page: Page, url: string) {
	app.log(`Navigating to ${url}`);
	return page.goto(url);
}

async function mjsRunner(page: Page, sources: Output[], app: SpecRunner) {
	const entry = sources[0].path;
	app.log(`Running in mjs mode`);
	await page.setRequestInterception(true);
	page.on('request', async (req: HTTPRequest) => {
		try {
			const url = new URL(req.url());
			if (req.method() === 'GET' && url.hostname === 'cxl-tester') {
				const pathname = url.pathname.startsWith('/@cxl/')
					? getCxlPath(url.pathname)
					: join(process.cwd(), url.pathname);
				const body =
					url.pathname === '/'
						? ''
						: await readFile(pathname, 'utf8');
				if (
					pathname.endsWith('.js') &&
					!sources.find(s => s.source === body)
				)
					sources.push({
						path: pathname,
						source: body,
					});
				req.respond({
					status: 200,
					contentType: pathname.endsWith('.js')
						? 'application/javascript'
						: 'text/plain',
					body,
				});
			} else {
				req.continue();
			}
		} catch (e) {
			app.log(`Error handling request ${req.method()} ${req.url()}`);
			req.continue();
		}
	});
	await goto(app, page, 'https://cxl-tester');
	await page.addScriptTag({
		type: 'importmap',
		content: `{
    "imports": {
		"@cxl/": "https://cxl-tester/@cxl/"
    }
  }`,
	});

	return page.evaluate(
		`(async entry => {
		const r = (await import(entry)).default;
		await r.run();
		return r.toJSON();
	})('${entry}')`,
	) as Promise<Test>;
}

function Range(startOffset: number, endOffset: number, count: number) {
	return {
		startOffset,
		endOffset,
		count,
	};
}

function generateRanges(entry: CoverageEntry) {
	const result = [];
	let index = 0;

	for (const range of entry.ranges) {
		if (range.start > index) result.push(Range(index, range.start, 0));
		result.push(Range(range.start, range.end, 1));
		index = range.end;
	}

	if (index < entry.text.length) {
		result.push(Range(index, entry.text.length, 0));
	}
	return result;
}

async function generateCoverage(
	page: Page,
	sources: Output[],
): Promise<TestCoverage[]> {
	const coverage = await page.coverage.stopJSCoverage();
	return coverage.map(entry => {
		const sourceFile = sources.find(src => entry.text.includes(src.source));
		return {
			url: sourceFile?.path ? resolve(sourceFile?.path) : entry.url,
			functions: [
				{
					functionName: '',
					ranges: generateRanges(entry),
					isBlockCoverage: true,
				},
			],
		};
	});
}

let screenshotQueue = Promise.resolve();

async function parsePNG(buffer: Uint8Array) {
	const PNG = (await import('pngjs')).PNG;
	return new Promise<PNG>((resolve, reject) => {
		const png = new PNG();
		png.parse(Buffer.from(buffer), (e, self) => {
			if (e) reject(e);
			else resolve(self);
		});
	});
}

function screenshot(page: Page, domId: string, html: string) {
	return new Promise<Uint8Array>((resolve, reject) => {
		const id = `#${domId}`;
		screenshotQueue = screenshotQueue.then(() => {
			return page
				.$eval(
					id,
					(el, html) => {
						el.innerHTML = html;
						el.style.zIndex = '10';
						el.getRootNode()?.activeElement?.blur?.();
					},
					html,
				)
				.then(async () => {
					await page.waitForNetworkIdle({
						idleTime: 120,
						timeout: 5000,
					});

					await page.waitForFunction('document.fonts?.ready');
					await page.mouse.move(350, -100);
					const el = await page.$(id);

					return el?.screenshot({
						type: 'png',
						encoding: 'binary',
					});
				})
				.then(
					buffer => {
						if (ArrayBuffer.isView(buffer)) resolve(buffer);
						else reject(`Invalid value returned by screenshot()`);
					},
					e => reject(e),
				);
		});
	});
}

async function handleFigureRequest(
	page: Page,
	data: FigureData,
	app: SpecRunner,
): Promise<Result> {
	const { name, domId, html } = data;
	const baseline = (data.baseline = `${
		app.baselinePath || 'spec'
	}/${name}.png`);
	const filename = `spec/${name}.png`;
	const [original, buffer] = await Promise.all([
		readFile(baseline).catch(() => undefined),
		screenshot(page, domId, html),
	]);
	if (buffer)
		mkdir('spec')
			.catch(() => false)
			.then(() => writeFile(filename, buffer));

	if ((!original || app.updateBaselines) && buffer && app.baselinePath) {
		mkdir(app.baselinePath)
			.catch(() => false)
			.then(() => writeFile(baseline, buffer));
	} else if (original && buffer && app.baselinePath) {
		const [oPng, newPng] = await Promise.all([
			parsePNG(original),
			parsePNG(buffer),
		]);
		const originalData = oPng.data;
		const newData = newPng.data;
		const len = originalData.length;

		if (len !== newData.length) {
			return {
				success: false,
				message: `Screenshot should match baseline: Different Size (${oPng.width}x${oPng.height} vs ${newPng.width}x${newPng.height})`,
				data,
			};
		}
		for (let i = 0; i < len; i++) {
			if (originalData.readUInt8(i) !== newData.readUInt8(i))
				return {
					success: false,
					message: `Screenshot should match baseline`,
					data,
				};
		}
	}

	return {
		success: true,
		message: 'Screenshot should match baseline',
		data,
	};
}

export default async function runPuppeteer(app: SpecRunner) {
	const entryFile = app.entryFile;
	const args = [
		'--no-sandbox',
		'--disable-setuid-sandbox',
		'--disable-gpu',
		'--font-render-hinting=none',
		//'--disable-dev-shm-usage',
		'--disable-font-subpixel-positioning',
		'--animation-duration-scale=0',
		'--force-device-scale-factor=1', // avoid DPI scaling differences
		'--window-size=1280,1024', // set a fixed viewport size for ALL screenshots
		'--disable-infobars', // removes info bars on top
		'--hide-scrollbars', // makes scrollbars not appear in screenshots
		'--blink-settings=imagesEnabled=true', // ensure images always render
		'--enable-font-antialiasing',
		'--disable-features=Translate,BackForwardCache,ColorPicker,SharedArrayBuffer,InterestCohort,NotificationIndicator,Prerender2',
		'--disable-background-timer-throttling',
		'--disable-backgrounding-occluded-windows',
		'--disable-renderer-backgrounding',
		'--mute-audio', // avoid potentially different audio stack warnings
		'--disable-extensions',
	];
	if (app.disableSecurity) args.push('--disable-web-security');

	const browser = await puppeteer.launch({
		// product: app.firefox ? 'firefox' : 'chrome',
		headless: true,
		args,
		timeout: 5000,
	});
	app.log(`Puppeteer ${await browser.version()}`);

	app.log(`Entry file: ${entryFile}`);
	const source = await readFile(entryFile, 'utf8');
	const sources = [{ path: entryFile, source }];

	const { suite, coverage } = await createPage(app, browser, sources, 0);

	await browser.close();

	return generateReport(suite, coverage);
}
