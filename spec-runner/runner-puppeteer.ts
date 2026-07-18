import { Browser, Page, HTTPRequest, CDPSession } from 'puppeteer';
import * as puppeteer from 'puppeteer';
import { readFile, writeFile, mkdir, mkdtemp, rm } from 'fs/promises';
import { basename, resolve, relative, join, extname } from 'path';
import { tmpdir } from 'os';
import { resolveImport } from './resolve.js';

import type {
	FigureData,
	RunnerCommand,
	Result,
	JsonResult,
} from '../spec/index.js';
import type { SpecRunner } from './index.js';
import type { PNG } from 'pngjs';

import { TestCoverage, generateReport } from './report.js';
import type { Protocol } from 'devtools-protocol';

interface HTMLElement {
	activeElement: HTMLElement | null;
	innerHTML: string;
	style: { zIndex: string };
	getRootNode(): HTMLElement | null;
	blur(): void;
}

async function startCoverage(page: Page) {
	const session = await page.createCDPSession();
	await session.send('Profiler.enable');
	await session.send('Profiler.startPreciseCoverage', {
		callCount: true,
		detailed: true,
	});
	return session;
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
	return await browser.newPage();
}

async function createPage(
	app: SpecRunner,
	browser: Browser,
	concurrency: number,
) {
	const proxies = new Map<string, string>();

	function cxlRunner(cmd: RunnerCommand): Promise<Result> | Result {
		const type = cmd.type;
		if (type === 'figure') {
			try {
				return handleFigureRequest(page, cmd, app);
			} catch (e) {
				return {
					success: false,
					failureMessage: String(e) || 'Unknown Error',
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
						failureMessage: 'Element',
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
						failureMessage: 'Element',
					};
				});
		} else if (type === 'testElement') {
			return { success: true, failureMessage: 'testElement supported' };
		} else if (type === 'proxy') {
			proxies.set(cmd.route, cmd.target);
			return { success: true, failureMessage: 'Proxy' };
		} else if (type === 'concurrency') {
			return {
				success: true,
				failureMessage: 'Concurrency',
				concurrency,
			};
		}

		return {
			success: false,
			failureMessage: `Feature not supported: ${type}`,
		};
	}

	const pageError: Result[] = [];
	const page = await openPage(browser);
	const coverageSession = app.ignoreCoverage
		? undefined
		: await startCoverage(page);
	const entryFile = app.vfsRoot
		? `./${relative(app.vfsRoot, app.entryFile)}`
		: app.entryFile;

	page.on('console', msg => {
		handleConsole(msg, app).catch(e => console.error(e));
	});
	page.on('pageerror', msg => {
		app.log(msg);
		pageError.push({ success: false, failureMessage: String(msg) });
	});
	page.on('requestfailed', req => {
		app.log(
			`requestfailed: ${req.method()} ${req.url()} ${
				req.failure()?.errorText
			}`,
		);
	});

	await page.exposeFunction('__cxlRunner', cxlRunner);
	if (app.browserUrl) await goto(app, page, app.browserUrl);

	// Prevent unexpected focus behavior
	await page.bringToFront();

	const suite = await mjsRunner(page, app, entryFile, proxies);
	if (pageError.length) suite.results.push(...pageError);

	const coverage = app.ignoreCoverage
		? undefined
		: await generateCoverage(coverageSession, app);
	return { suite, coverage };
}

function virtualFileServer(
	page: Page,
	app: SpecRunner,
	proxies: Map<string, string>,
) {
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

	function findProxy(pathname: string) {
		let result: [string, string] | undefined;
		for (const [route, target] of proxies) {
			if (
				pathname === route ||
				pathname.startsWith(route.endsWith('/') ? route : `${route}/`)
			) {
				if (!result || route.length > result[0].length)
					result = [route, target];
			}
		}
		return result;
	}

	async function proxyRequest(
		req: HTTPRequest,
		url: URL,
		route: string,
		target: string,
	) {
		const targetUrl = new URL(target);
		const suffix = url.pathname.slice(route.length);
		targetUrl.pathname = suffix
			? `${targetUrl.pathname.replace(/\/$/, '')}/${suffix.replace(
					/^\//,
					'',
				)}`
			: targetUrl.pathname;
		targetUrl.search = url.search;

		const headers = { ...req.headers() };
		delete headers.host;
		delete headers.origin;
		delete headers['content-length'];

		const response = await fetch(targetUrl, {
			method: req.method(),
			headers,
			body:
				req.method() === 'GET' || req.method() === 'HEAD'
					? undefined
					: req.postData(),
			redirect: 'manual',
		});

		await req.respond({
			status: response.status,
			headers: Object.fromEntries(response.headers.entries()),
			body: Buffer.from(await response.arrayBuffer()),
		});
	}

	async function onRequest(req: HTTPRequest) {
		try {
			const url = new URL(req.url());
			if (url.hostname === 'cxl-tester') {
				const proxy = findProxy(url.pathname);
				if (proxy)
					return proxyRequest(req, url, proxy[0], proxy[1]);

				if (req.method() !== 'GET') return req.continue();

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
						ext === '.js'
							? 'text/javascript'
							: ext === '.html'
								? 'text/html'
								: 'text/plain',
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

async function mjsRunner(
	page: Page,
	app: SpecRunner,
	entry: string,
	proxies: Map<string, string>,
) {
	await page.setRequestInterception(true);

	virtualFileServer(page, app, proxies);

	await goto(app, page, 'https://cxl-tester');

	await page.setContent(`<base href="https://cxl-tester/${entry}">`);

	if (app.importmap) {
		await page.addScriptTag({
			type: 'importmap',
			content: app.importmap,
		});
	}

	return page.evaluate(
		async ({
			entry,
			grepSource,
			grepFlags,
		}: {
			entry: string;
			grepSource?: string;
			grepFlags?: string;
		}) => {
			const mod = (await import(entry)) as {
				default: {
					run(grep?: RegExp): Promise<unknown>;
					toJSON(): JsonResult;
				};
			};
			const r = mod.default;
			const grep = grepSource
				? new RegExp(grepSource, grepFlags)
				: undefined;
			await r.run(grep);
			return r.toJSON();
		},
		{
			entry: `./${basename(entry)}`,
			grepSource: app.grep?.source,
			grepFlags: app.grep?.flags,
		},
	) as Promise<JsonResult>;
}

async function generateCoverage(
	session: CDPSession | undefined,
	app: SpecRunner,
): Promise<TestCoverage[]> {
	if (!session) return [];
	const coverage =
		await session.send('Profiler.takePreciseCoverage');
	await session.send('Profiler.stopPreciseCoverage');
	await session.send('Profiler.disable');

	return (
		coverage as Protocol.Profiler.TakePreciseCoverageResponse
	).result.flatMap(entry => {
		const sourceFile = app.sources.get(entry.url);
		return sourceFile
			? {
					url: sourceFile.path,
					functions: entry.functions,
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
				failureMessage: `Screenshot should match baseline: Different Size (${oPng.width}x${oPng.height} vs ${newPng.width}x${newPng.height})`,
				data,
			};
		}
		for (let i = 0; i < len; i++) {
			if (originalData.readUInt8(i) !== newData.readUInt8(i))
				return {
					success: false,
					failureMessage: `Screenshot should match baseline`,
					data,
				};
		}
	}

	return {
		success: true,
		failureMessage: 'Screenshot should match baseline',
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
		'--single-process',
	];
	if (app.disableSecurity) args.push('--disable-web-security');

	const userDataDir = await mkdtemp(join(tmpdir(), 'cxl-spec-runner-'));
	let browser: Browser | undefined;
	try {
		browser = await puppeteer.launch({
			headless: 'shell',
			args,
			env: { ...process.env, HOME: userDataDir },
			pipe: true,
			timeout: 5000,
			userDataDir,
		});
		app.log(`Puppeteer ${await browser.version()}`);

		const { suite, coverage } = await createPage(app, browser, 0);
		return generateReport(suite, coverage, {
			entryFile: app.entryFile,
			expectedCoverageFiles: app.expectedCoverageFiles,
		});
	} finally {
		if (browser) await browser.close();
		await rm(userDataDir, { recursive: true, force: true });
	}
}
