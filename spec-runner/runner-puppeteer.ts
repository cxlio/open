import { TargetType } from 'puppeteer';
import type {
	Browser,
	Page,
	HTTPRequest,
	CDPSession,
	Target,
	Protocol,
} from 'puppeteer';
import * as puppeteer from 'puppeteer';
import { spawn, type ChildProcess } from 'child_process';
import { readFile, writeFile, mkdir, mkdtemp, rm } from 'fs/promises';
import { basename, resolve, relative, join, extname } from 'path';
import { tmpdir } from 'os';
import { resolveImport } from './resolve.js';
import {
	createBenchmarkEnvironment,
	hasBenchmarks,
	processBenchmarks,
} from './benchmark.js';
import type { BenchmarkEnvironment } from './benchmark.js';

import type {
	FigureData,
	RunnerCommand,
	Result,
	JsonResult,
} from '../spec/index.js';
import type { SpecRunner } from './index.js';
import type { PNG } from 'pngjs';

import { generateReport, type TestCoverage } from './report.js';
import { writeSpecificationDocument } from './specification-file.js';

const contentTypes: Record<string, string> = {
	'.avif': 'image/avif',
	'.css': 'text/css',
	'.gif': 'image/gif',
	'.html': 'text/html',
	'.ico': 'image/x-icon',
	'.jpeg': 'image/jpeg',
	'.jpg': 'image/jpeg',
	'.js': 'text/javascript',
	'.json': 'application/json',
	'.map': 'application/json',
	'.png': 'image/png',
	'.svg': 'image/svg+xml',
	'.text': 'text/plain',
	'.txt': 'text/plain',
	'.wasm': 'application/wasm',
	'.webp': 'image/webp',
	'.woff': 'font/woff',
	'.woff2': 'font/woff2',
};

interface HTMLElement {
	activeElement: HTMLElement | null;
	innerHTML: string;
	style: { zIndex: string };
	getRootNode(): HTMLElement | null;
	blur(): void;
}

type ProxyCommand = Extract<
	RunnerCommand,
	{ type: 'proxy' | 'proxyService' }
>;

interface ProxyRegistration {
	registrationId: number;
	ownerId: number;
	route: string;
	target: string;
	active: boolean;
	child?: ChildProcess;
	command?: string;
	args?: readonly string[];
	stdout: string;
	stderr: string;
	stopping: boolean;
	failureReason?: string;
}

const proxyOutputLimit = 64 * 1024;
const proxyShutdownTimeout = 1000;
const coverageStartupTimeout = 2000;

function appendProxyOutput(output: string, data: Buffer) {
	return `${output}${data.toString()}`.slice(-proxyOutputLimit);
}

function waitForExit(child: ChildProcess, timeout: number) {
	if (child.exitCode !== null || child.signalCode !== null)
		return Promise.resolve(true);
	return new Promise<boolean>(resolve => {
		const onExit = () => {
			clearTimeout(timeoutId);
			resolve(true);
		};
		const timeoutId = setTimeout(() => {
			child.off('exit', onExit);
			resolve(false);
		}, timeout);
		child.once('exit', onExit);
	});
}

function proxyFailure(registration: ProxyRegistration, reason: string) {
	const command = registration.command
		? `\ncommand: ${JSON.stringify([
				registration.command,
				...(registration.args ?? []),
			])}`
		: '';
	const stdout = registration.stdout
		? `\nstdout:\n${registration.stdout}`
		: '';
	const stderr = registration.stderr
		? `\nstderr:\n${registration.stderr}`
		: '';
	return `${reason}${command}${stdout}${stderr}`;
}

export class ProxyManager {
	private registrations = new Map<number, ProxyRegistration>();
	private routes = new Map<string, ProxyRegistration>();

	constructor(private log: (message: string) => void) {}

	async register(command: ProxyCommand): Promise<Result> {
		const existing = this.routes.get(command.route);
		if (existing)
			return {
				success: false,
				failureMessage: `Proxy route "${command.route}" is already owned by test ${existing.ownerId}.`,
			};

		const registration: ProxyRegistration = {
			registrationId: command.registrationId,
			ownerId: command.ownerId,
			route: command.route,
			target:
				command.type === 'proxyService'
					? command.server.target
					: command.target,
			active: false,
			stdout: '',
			stderr: '',
			stopping: false,
		};
		this.registrations.set(command.registrationId, registration);
		this.routes.set(command.route, registration);

		if (command.type === 'proxyService') {
			registration.command = command.server.command;
			registration.args = command.server.args;
			try {
				await this.spawn(registration);
			} catch (error) {
				this.delete(registration);
				await this.stop(registration);
				return {
					success: false,
					failureMessage: proxyFailure(
						registration,
						`Could not start proxy service: ${String(error)}`,
					),
				};
			}
		}

		registration.active = true;
		return { success: true, failureMessage: 'Proxy' };
	}

	async release(registrationId: number): Promise<Result> {
		const registration = this.registrations.get(registrationId);
		if (!registration) return { success: true, failureMessage: 'Proxy' };
		this.delete(registration);
		const failureReason = registration.failureReason;
		try {
			await this.stop(registration);
		} catch (error) {
			return {
				success: false,
				failureMessage: proxyFailure(
					registration,
					`Could not stop proxy service: ${String(error)}`,
				),
			};
		}
		return failureReason
			? {
					success: false,
					failureMessage: proxyFailure(registration, failureReason),
				}
			: { success: true, failureMessage: 'Proxy' };
	}

	find(pathname: string): [string, string] | undefined {
		let result: [string, string] | undefined;
		for (const [route, registration] of this.routes) {
			if (
				registration.active &&
				(pathname === route ||
					pathname.startsWith(
						route.endsWith('/') ? route : `${route}/`,
					)) &&
				(!result || route.length > result[0].length)
			)
				result = [route, registration.target];
		}
		return result;
	}

	async close() {
		const results = await Promise.all(
			[...this.registrations.values()].map(registration =>
				this.release(registration.registrationId),
			),
		);
		for (const result of results) {
			if (!result.success) this.log(result.failureMessage);
		}
	}

	private async spawn(registration: ProxyRegistration) {
		const child = spawn(registration.command ?? '', [
			...(registration.args ?? []),
		], {
			stdio: ['ignore', 'pipe', 'pipe'],
		});
		registration.child = child;
		child.stdout.on('data', (data: Buffer) => {
			registration.stdout = appendProxyOutput(registration.stdout, data);
		});
		child.stderr.on('data', (data: Buffer) => {
			registration.stderr = appendProxyOutput(registration.stderr, data);
		});
		child.on('exit', (code, signal) => {
			if (!registration.stopping)
				registration.failureReason = `Proxy service exited unexpectedly (${signal ? `signal ${signal}` : `code ${code}`}).`;
		});
		child.on('error', error => {
			if (!registration.stopping)
				registration.failureReason = `Proxy service failed: ${String(error)}`;
		});
		await new Promise<void>((resolve, reject) => {
			const onSpawn = () => {
				child.off('error', onError);
				resolve();
			};
			const onError = (error: Error) => {
				child.off('spawn', onSpawn);
				reject(error);
			};
			child.once('spawn', onSpawn);
			child.once('error', onError);
		});
	}

	private delete(registration: ProxyRegistration) {
		this.registrations.delete(registration.registrationId);
		if (this.routes.get(registration.route) === registration)
			this.routes.delete(registration.route);
	}

	private async stop(registration: ProxyRegistration) {
		const child = registration.child;
		if (
			!child?.pid ||
			child.exitCode !== null ||
			child.signalCode !== null
		)
			return;
		registration.stopping = true;
		child.kill('SIGTERM');
		if (await waitForExit(child, proxyShutdownTimeout)) return;
		child.kill('SIGKILL');
		if (!(await waitForExit(child, proxyShutdownTimeout)))
			throw new Error(`Process ${child.pid} did not exit.`);
	}
}

export async function startCoverage(session: CDPSession) {
	try {
		await session.send('Profiler.enable', undefined, {
			timeout: coverageStartupTimeout,
		});
		await session.send('Profiler.startPreciseCoverage', {
			callCount: true,
			detailed: true,
		}, { timeout: coverageStartupTimeout });
	} catch (error) {
		void session.send('Profiler.disable').catch(() => undefined);
		throw error;
	}
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
		} catch {
			console.log(arg.toString());
		}
}

async function openPage(browser: Browser) {
	return await browser.newPage();
}

function press(element: { press(key: string): Promise<void> }, key: string) {
	return element.press(key);
}

function keyboardEvent(
	keyboard: {
		down(key: string): Promise<void>;
		up(key: string): Promise<void>;
	},
	type: 'keyDown' | 'keyUp',
	key: string,
) {
	return keyboard[type === 'keyDown' ? 'down' : 'up'](key);
}

async function getBenchmarkEnvironment(
	browser: Browser,
	profile: string,
): Promise<BenchmarkEnvironment> {
	const session = await browser.target().createCDPSession();
	try {
		const { gpu } = await session.send('SystemInfo.getInfo');
		return createBenchmarkEnvironment(
			await browser.version(),
			gpu.devices[0]?.deviceString ?? '',
			profile,
		);
	} finally {
		await session.detach();
	}
}

async function createPage(
	app: SpecRunner,
	browser: Browser,
	concurrency: number,
) {
	const proxies = new ProxyManager(message => app.log(message));
	const coverageCleanup: (() => Promise<void>)[] = [];
	let page: Page;
	const element = (selector: string) =>
		page.$(selector).then(element => {
			if (!element)
				throw new Error(`Element for selector "${selector}" not found.`);
			return element;
		});
	async function figure(cmd: FigureData) {
		try {
			return await handleFigureRequest(page, cmd, app);
		} catch (error) {
			return {
				success: false,
				failureMessage: String(error) || 'Unknown Error',
			};
		}
	}

	function cxlRunner(cmd: RunnerCommand): Promise<Result> | Result {
		const type = cmd.type;
		if (type === 'figure') {
			return figure(cmd);
		} else if (type === 'hover' || type === 'tap' || type === 'click') {
			return element(cmd.element)
				.then(el => {
					return el[type]();
				})
				.then(() => {
					return {
						success: true,
						failureMessage: 'Element',
					};
				});
		} else if (type === 'type' || type === 'press') {
			return element(cmd.element)
				.then(el => {
					return type === 'type'
						? el.type(cmd.value)
						: press(el, cmd.value);
				})
				.then(() => {
					return {
						success: true,
						failureMessage: 'Element',
					};
				});
		} else if (type === 'keyDown' || type === 'keyUp') {
			return element(cmd.element)
				.then(el => el.focus())
				.then(() => keyboardEvent(page.keyboard, type, cmd.value))
				.then(() => {
					return {
						success: true,
						failureMessage: 'Element',
					};
				});
		} else if (type === 'drag') {
			return Promise.all([element(cmd.element), element(cmd.target)])
				.then(([element, target]) => {
					return target.drop(element);
				})
				.then(() => {
					return {
						success: true,
						failureMessage: 'Element',
					};
				});
		} else if (type === 'testElement') {
			return { success: true, failureMessage: 'testElement supported' };
		} else if (type === 'proxy' || type === 'proxyService') {
			return proxies.register(cmd);
		} else if (type === 'proxyRelease') {
			return proxies.release(cmd.registrationId);
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

	try {
		const pageError: Result[] = [];
		page = await openPage(browser);
		const coverageSessions: CDPSession[] | undefined = app.ignoreCoverage
			? undefined
			: [await startCoverage(await page.createCDPSession())];
		const entryFile = app.vfsRoot
			? `./${relative(app.vfsRoot, app.entryFile)}`
			: app.entryFile;

		page.on('console', msg => {
			if (app.verbose)
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

		const suite = await mjsRunner(
			page,
			app,
			entryFile,
			proxies,
			coverageSessions,
			coverageCleanup,
		);
		if (pageError.length) suite.results.push(...pageError);

		const coverage = app.ignoreCoverage
			? undefined
			: await generateCoverage(coverageSessions, app);
		return { suite, coverage };
	} finally {
		await Promise.all(coverageCleanup.map(cleanup => cleanup()));
		await proxies.close();
	}
}

interface VirtualRequest {
	url: string;
	method: string;
	headers: Record<string, string>;
	body?: string;
}

interface VirtualResponse {
	status: number;
	headers?: Record<string, string>;
	body?: Buffer | string;
}

function virtualFileServer(app: SpecRunner, proxies: ProxyManager) {
	const cwd = app.vfsRoot ? resolve(app.vfsRoot) : process.cwd();

	if (app.verbose && app.vfsRoot)
		app.log(`vfsRoot: ${cwd} (cwd: ${process.cwd()})`);

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

	async function proxyRequest(
		req: VirtualRequest,
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

		const headers = { ...req.headers };
		delete headers.host;
		delete headers.origin;
		delete headers['content-length'];

		const response = await fetch(targetUrl, {
			method: req.method,
			headers,
			body:
				req.method === 'GET' || req.method === 'HEAD'
					? undefined
					: req.body,
			redirect: 'manual',
		});

		return {
			status: response.status,
			headers: Object.fromEntries(response.headers.entries()),
			body: Buffer.from(await response.arrayBuffer()),
		};
	}

	return async (req: VirtualRequest): Promise<VirtualResponse | undefined> => {
		const url = new URL(req.url);
		if (url.hostname !== 'cxl-tester') return;

		const proxy = proxies.find(url.pathname);
		if (proxy) return proxyRequest(req, url, proxy[0], proxy[1]);

		if (req.method !== 'GET') return;

		if (url.pathname === '/' || url.pathname === '/favicon.ico')
			return { status: 200, body: '' };

		const pathname = findRequestPath(url.pathname);
		if (pathname !== url.pathname)
			return {
				status: 301,
				headers: { location: '/' + pathname },
			};

		const body = await readFile(join(cwd, pathname));
		const ext = extname(pathname).toLowerCase();
		if (ext === '.js' && !app.sources.has(url.href))
			app.sources.set(url.href, {
				path: pathname,
				source: body.toString('utf8'),
			});

		return {
			status: 200,
			headers: {
				'content-type': contentTypes[ext] ?? 'application/octet-stream',
			},
			body,
		};
	};
}

function interceptPage(
	page: Page,
	app: SpecRunner,
	server: ReturnType<typeof virtualFileServer>,
) {
	async function onRequest(req: HTTPRequest) {
		try {
			const method = req.method();
			const response = await server({
				url: req.url(),
				method,
				headers: req.headers(),
				body:
					method === 'GET' || method === 'HEAD'
						? undefined
						: await req.fetchPostData(),
			});
			if (response) await req.respond(response);
			else await req.continue();
		} catch (error) {
			app.log(`Error handling request ${req.method()} ${req.url()}`);
			console.error(error);
			await req.respond({ status: 500 });
		}
	}

	page.on('request', req => {
		onRequest(req).catch(e => console.error(e));
	});
}

async function interceptWorkers(
	browser: Browser,
	app: SpecRunner,
	server: ReturnType<typeof virtualFileServer>,
	coverageSessions: CDPSession[] | undefined,
	coverageCleanup: (() => Promise<void>)[],
) {
	const pending = new Set<Promise<void>>();
	function track(promise: Promise<void>) {
		pending.add(promise);
		void promise.then(
			() => pending.delete(promise),
			() => undefined,
		);
	}

	async function onRequest(
		session: CDPSession,
		event: Protocol.Fetch.RequestPausedEvent,
	) {
		try {
			const response = await server({
				url: event.request.url,
				method: event.request.method,
				headers: event.request.headers,
				body:
					event.request.method !== 'GET' &&
					event.request.method !== 'HEAD' &&
					event.request.postDataEntries
					? Buffer.concat(
							event.request.postDataEntries.map(entry =>
								Buffer.from(entry.bytes ?? '', 'base64'),
							),
						).toString()
					: undefined,
			});
			if (!response)
				return session.send('Fetch.continueRequest', {
					requestId: event.requestId,
				});
			await session.send('Fetch.fulfillRequest', {
				requestId: event.requestId,
				responseCode: response.status,
				responseHeaders: Object.entries(response.headers ?? {}).map(
					([name, value]) => ({ name, value }),
				),
				body:
					response.body === undefined
						? undefined
						: Buffer.from(response.body).toString('base64'),
			});
		} catch (error) {
			app.log(
				`Error handling request ${event.request.method} ${event.request.url}`,
			);
			console.error(error);
			await session.send('Fetch.fulfillRequest', {
				requestId: event.requestId,
				responseCode: 500,
			});
		}
	}

	async function attach(target: Target) {
		const session = await target.createCDPSession();
		await configure(session);
	}

	async function configure(session: CDPSession) {
		try {
			session.on('Fetch.requestPaused', event => {
				onRequest(session, event).catch(error => console.error(error));
			});
			await session.send('Fetch.enable', {
				patterns: [{ urlPattern: 'https://cxl-tester/*' }],
			});
			if (coverageSessions) {
				coverageSessions.push(await startCoverage(session));
			}
		} catch (error) {
			void session
				.send('Runtime.runIfWaitingForDebugger')
				.catch(() => undefined);
			throw error;
		}
		await session.send('Runtime.runIfWaitingForDebugger');
	}

	function onTarget(target: Target) {
		if (target.type() !== TargetType.SHARED_WORKER) return;
		track(attach(target));
	}

	browser.on('targetcreated', onTarget);
	if (coverageSessions) {
		const browserSession = await browser.target().createCDPSession();
		function onAttached(session: CDPSession) {
			track(configure(session));
		}
		browserSession.on('sessionattached', onAttached);
		browserSession.on('Fetch.requestPaused', event => {
			onRequest(browserSession, event).catch(error => console.error(error));
		});
		await browserSession.send('Fetch.enable', {
			patterns: [{ urlPattern: 'https://cxl-tester/*' }],
		});
		await browserSession.send('Target.setAutoAttach', {
			autoAttach: true,
			waitForDebuggerOnStart: true,
			flatten: true,
			filter: [{ type: TargetType.SERVICE_WORKER }],
		});
		coverageCleanup.push(async () => {
			await browserSession.detach();
		});
	}
	return async () => {
		browser.off('targetcreated', onTarget);
		await Promise.all(pending);
	};
}

function goto(_app: SpecRunner, page: Page, url: string) {
	return page.goto(url);
}

async function mjsRunner(
	page: Page,
	app: SpecRunner,
	entry: string,
	proxies: ProxyManager,
	coverageSessions: CDPSession[] | undefined,
	coverageCleanup: (() => Promise<void>)[],
) {
	await page.setRequestInterception(true);

	const server = virtualFileServer(app, proxies);
	interceptPage(page, app, server);
	const stopWorkerInterception = await interceptWorkers(
		page.browser(),
		app,
		server,
		coverageSessions,
		coverageCleanup,
	);

	try {
		await goto(app, page, 'https://cxl-tester');

		await page.setContent(`<base href="https://cxl-tester/${entry}">`);

		if (app.importmap) {
			await page.addScriptTag({
				type: 'importmap',
				content: app.importmap,
			});
		}

		return await page.evaluate(
			async ({
			entry,
			grepSource,
			grepFlags,
		}: {
			entry: string;
			grepSource?: string;
			grepFlags?: string;
		}) => {
			const mod: {
				default: {
					run(grep?: RegExp): Promise<unknown>;
					toJSON(): JsonResult;
				};
			} = await import(entry);
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
		);
	} finally {
		await stopWorkerInterception();
	}
}

async function generateCoverage(
	sessions: readonly CDPSession[] | undefined,
	app: SpecRunner,
): Promise<TestCoverage[]> {
	if (!sessions) return [];
	const coverage = await Promise.all(
		sessions.map(session => collectCoverage(session)),
	);

	return coverage.flat().flatMap(entry => {
		const sourceFile = app.sources.get(entry.url);
		return sourceFile
			? {
					url: sourceFile.path,
					functions: entry.functions,
				}
			: [];
	});
}

async function stopCoverage(session: CDPSession) {
	try {
		await session.send('Profiler.stopPreciseCoverage');
	} finally {
		await session.send('Profiler.disable');
	}
}

export async function collectCoverage(session: CDPSession) {
	let result: Protocol.Profiler.TakePreciseCoverageResponse;
	try {
		result = await session.send('Profiler.takePreciseCoverage');
	} catch (error) {
		await stopCoverage(session).catch(() => undefined);
		throw error;
	}
	await stopCoverage(session);
	return result.result;
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
						else reject(new Error('Invalid value returned by screenshot()'));
					},
					e => reject(e instanceof Error ? e : new Error(String(e))),
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
	const filename = (data.actual = `spec/${name}.png`);
	const [original, buffer] = await Promise.all([
		readFile(baseline).catch(() => undefined),
		screenshot(page, domId, html),
	]);

	await mkdir('spec').catch(() => false);
	await writeFile(filename, buffer);
	app.onGeneratedFile?.(filename);

	if ((!original || app.updateBaselines) && app.baselinePath) {
		await mkdir(app.baselinePath).catch(() => false);
		await writeFile(baseline, buffer);
		app.onGeneratedFile?.(baseline);
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
		if (app.verbose) app.log(`Puppeteer ${await browser.version()}`);

		const { suite, coverage } = await createPage(app, browser, 0);
		const benchmark = hasBenchmarks(suite)
			? await processBenchmarks(
					suite,
					await getBenchmarkEnvironment(browser, args.join(' ')),
					app.baselinePath,
					!!app.updateBaselines,
					app.onGeneratedFile,
				)
			: undefined;
		const report = await generateReport(suite, coverage, {
			entryFile: app.entryFile,
			expectedCoverageFiles: app.expectedCoverageFiles,
		});
		await writeSpecificationDocument(app.documentPath, suite, {
			baselinePath: app.baselinePath,
		});
		if (app.documentPath) app.onGeneratedFile?.(app.documentPath);
		report.benchmark = benchmark;
		return report;
	} finally {
		if (browser) await browser.close();
		await rm(userDataDir, { recursive: true, force: true });
	}
}
