import { Browser, CoverageEntry, Page, HTTPRequest } from 'puppeteer';
import * as puppeteer from 'puppeteer';
import { readFile, writeFile, mkdir } from 'fs/promises';
import { basename, resolve, relative, join, extname } from 'path';
import { resolveImport } from './resolve.js';

import type { FigureData, RunnerCommand, Test, Result } from '../spec/index.js';
import type { SpecRunner } from './index.js';
import type { PNG } from 'pngjs';

import { TestCoverage, generateReport } from './report.js';

interface HTMLElement {
	activeElement: HTMLElement | null;
	innerHTML: string;
	style: { zIndex: string };
	getRootNode(): HTMLElement | null;
	blur(): void;
}

async function startTracing(page: Page) {
	await Promise.all([
		page.coverage.startJSCoverage({
			reportAnonymousScripts: true,
		}),
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
	concurrency: number,
) {
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

	const pageError: Result[] = [];
	const page = await openPage(browser);
	const entryFile = app.vfsRoot
		? `./${relative(app.vfsRoot, app.entryFile)}`
		: app.entryFile;

	page.on('console', msg => {
		handleConsole(msg, app).catch(e => console.error(e));
	});
	page.on('pageerror', msg => {
		app.log(msg);
		pageError.push({ success: false, message: String(msg) });
	});
	page.on('requestfailed', req => {
		app.log(
			`requestfailed: ${req.method()} ${req.url()} ${
				req.failure()?.errorText
			}`,
		);
	});

	await page.exposeFunction('__cxlRunner', cxlRunner);
	await startTracing(page);

	if (app.browserUrl) await goto(app, page, app.browserUrl);

	// Prevent unexpected focus behavior
	await page.bringToFront();

	const suite = await mjsRunner(page, app, entryFile);
	if (pageError.length) suite.results.push(...pageError);

	const coverage = app.ignoreCoverage
		? undefined
		: await generateCoverage(page, app);
	return { suite, coverage };
}

function virtualFileServer(page: Page, app: SpecRunner) {
	const cwd = app.vfsRoot ? resolve(app.vfsRoot) : process.cwd();

	if (app.vfsRoot) app.log(`vfsRoot: ${cwd} (cwd: ${process.cwd()})`);

	function findRequestPath(path: string) {
		try {
			const mod = path.slice(1);
			const result = resolveImport(mod, `${cwd}/`);
			if (result) {
				return relative(cwd, result);
			}
		} catch (e) {
			console.log(e);
		}
		return path;
	}

	async function onRequest(req: HTTPRequest) {
		try {
			const url = new URL(req.url());
			if (req.method() === 'GET' && url.hostname === 'cxl-tester') {
				if (url.pathname === '/' || url.pathname === '/favicon.ico')
					return req.respond({ status: 200, body: '' });

				const pathname = findRequestPath(url.pathname);
				if (pathname !== url.pathname)
					return req.respond({
						status: 301,
						headers: {
							location: '/' + pathname,
						},
					});

				const body = await readFile(join(cwd, pathname), 'utf8');
				const ext = extname(pathname);
				if (ext === '.js' && !app.sources.has(url.href))
					app.sources.set(url.href, {
						path: pathname,
						source: body,
					});

				await req.respond({
					status: 200,
					contentType:
						ext === '.js' ? 'text/javascript' : 'text/plain',
					body,
				});
			} else {
				await req.continue();
			}
		} catch (e) {
			app.log(`Error handling request ${req.method()} ${req.url()}`);
			console.error(e);
			await req.respond({
				status: 500,
			});
		}
	}

	page.on('request', req => {
		onRequest(req).catch(e => console.error(e));
	});
}

function goto(_app: SpecRunner, page: Page, url: string) {
	return page.goto(url);
}

async function mjsRunner(page: Page, app: SpecRunner, entry: string) {
	await page.setRequestInterception(true);

	virtualFileServer(page, app);

	await goto(app, page, 'https://cxl-tester');

	await page.setContent(`<base href="https://cxl-tester/${entry}">`);

	if (app.importmap) {
		await page.addScriptTag({
			type: 'importmap',
			content: app.importmap,
		});
	}

	return page.evaluate(
		`(async entry => {
		const r = (await import(entry)).default;
		await r.run();
		return r.toJSON();
	})('./${basename(entry)}')`,
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
	app: SpecRunner,
): Promise<TestCoverage[]> {
	const coverage = await page.coverage.stopJSCoverage();
	return coverage.flatMap(entry => {
		const sourceFile = app.sources.get(entry.url);
		return sourceFile
			? {
					url: sourceFile.path,
					functions: [
						{
							functionName: '',
							ranges: generateRanges(entry),
							isBlockCoverage: true,
						},
					],
				}
			: [];
	});
}

let screenshotQueue = Promise.resolve();

async function parsePNG(buffer: Uint8Array) {
	const PNG = (await import('pngjs')).PNG;
	return new Promise<PNG>((resolve, reject) => {
		const png = new PNG();
		png.parse(Buffer.from(buffer), (e: Error | undefined, self) => {
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
					(el: HTMLElement, html) => {
						el.innerHTML = html;
						el.style.zIndex = '10';
						el.getRootNode()?.activeElement?.blur();
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
	const baseline = (data.baseline = join(
		app.baselinePath ?? 'spec',
		`${name}.png`,
	));
	const filename = `spec/${name}.png`;
	const [original, buffer] = await Promise.all([
		readFile(baseline).catch(() => undefined),
		screenshot(page, domId, html),
	]);

	await mkdir('spec').catch(() => false);
	await writeFile(filename, buffer);

	if ((!original || app.updateBaselines) && app.baselinePath) {
		await mkdir(app.baselinePath).catch(() => false);
		await writeFile(baseline, buffer);
	} else if (original && app.baselinePath) {
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
	const args = [
		'--no-sandbox',
		'--disable-setuid-sandbox',
		'--disable-gpu',
		'--font-render-hinting=none',
		'--disable-font-subpixel-positioning',
		'--animation-duration-scale=0',
		'--force-device-scale-factor=1', // avoid DPI scaling differences
		'--window-size=1280,1024', // set a fixed viewport size for ALL screenshots
		'--disable-infobars', // removes info bars on top
		'--hide-scrollbars', // makes scrollbars not appear in screenshots
		'--blink-settings=imagesEnabled=true', // ensure images always render
		'--enable-font-antialiasing',
		'--ignore-certificate-errors',
		'--disable-features=Translate,BackForwardCache,ColorPicker,SharedArrayBuffer,InterestCohort,NotificationIndicator,Prerender2',
		'--disable-background-timer-throttling',
		'--disable-backgrounding-occluded-windows',
		'--disable-renderer-backgrounding',
		'--mute-audio', // avoid potentially different audio stack warnings
		'--disable-extensions',
	];
	if (app.disableSecurity) args.push('--disable-web-security');

	const browser = await puppeteer.launch({
		headless: true,
		args,
		timeout: 5000,
	});
	try {
		app.log(`Puppeteer ${await browser.version()}`);

		const { suite, coverage } = await createPage(app, browser, 0);
		return generateReport(suite, coverage);
	} finally {
		await browser.close();
	}
}
