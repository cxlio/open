import { subject, toPromise } from '../rx/index.js';

declare function __cxlRunner(msg: RunnerCommand): Promise<Result>;

type EventType =
	| 'afterAll'
	| 'afterEach'
	| 'beforeAll'
	| 'beforeEach'
	| 'syncComplete';
type TestEvent = { type: EventType; promises: Promise<unknown>[] };

type TestFn<T = TestApi> = (test: T) => void | Promise<unknown>;

type FunctionsOf<T> = {
	/* eslint @typescript-eslint/no-explicit-any:off */
	[K in keyof T]: T[K] extends (...args: any[]) => any ? T[K] : never;
};

type ParametersOf<T, K extends keyof T> = Parameters<FunctionsOf<T>[K]>;

export interface JsonResult {
	name: string;
	results: Result[];
	tests: JsonResult[];
	only: JsonResult[];
	runTime: number;
	timeout: number;
}
interface Spy<EventT> {
	lastEvent?: EventT;
	destroy(): void;
	then(
		resolve: (ev: EventT | undefined) => void,
		reject: (e: unknown) => void,
	): Promise<EventT | undefined>;
}

interface SpyFn<ParametersT, ResultT> {
	/// Number of times the function was called.
	called: number;
	arguments: ParametersT;
	result: ResultT;
}

interface SpyProp<T> {
	setCount: number;
	getCount: number;
	value: T;
}

export type RunnerAction =
	| {
			type: 'hover' | 'tap' | 'click';
			element?: string | Element;
	  }
	| {
			type: 'type' | 'press';
			value: string;
			element?: string | Element;
	  };

export type RunnerCommand =
	| FigureData
	| {
			type: 'hover' | 'tap' | 'click';
			element: string;
	  }
	| {
			type: 'type' | 'press';
			value: string;
			element: string;
	  }
	| {
			type: 'testElement';
	  }
	| { type: 'concurrency' };

export interface FigureData {
	type: 'figure';
	name: string;
	html: string;
	baseline?: string;
	domId: string;
}

export interface Result {
	success: boolean;
	message: string;
	concurrency?: number;
	data?: FigureData;
	stack?: string;
}

interface TestConfig {
	name: string;
}

let lastTestId = 1;
let testQueue: Promise<unknown> = Promise.resolve();
let actionId = 0;

const setTimeout = globalThis.setTimeout;
const clearTimeout = globalThis.clearTimeout;

function inspect(val: unknown) {
	if (typeof val === 'string') return '"' + val + '"';
	if (typeof Element !== 'undefined' && val instanceof Element)
		return val.outerHTML;

	return val;
}

export class TestApi {
	constructor(private $test: Test) {}

	get id() {
		return this.$test.id;
	}

	/**
	 * Returns a connected dom element. Cleaned up after test completion.
	 */
	get dom() {
		const el = this.$test.domContainer || document.createElement('div');
		if (!this.$test.domContainer?.parentNode)
			document.body.appendChild((this.$test.domContainer = el));

		return el as HTMLElement;
	}

	log(object: unknown) {
		console.log(object);
	}

	afterAll(fn: () => Promise<unknown> | void) {
		this.$test.onEvent('afterAll', fn);
	}

	ok<T>(condition: T, message = 'Assertion failed') {
		this.$test.push({ success: !!condition, message });
	}

	assert(
		condition: unknown,
		message = 'Assertion Failed',
	): asserts condition {
		if (!condition) throw new Error(message);
		this.$test.push({ success: !!condition, message });
	}

	equal<T>(a: T, b: T, desc?: string) {
		return this.ok(
			a === b,
			`${desc ? desc + ': ' : ''}${inspect(a)} should equal ${inspect(
				b,
			)}`,
		);
	}

	equalBuffer(a: ArrayBuffer, b: ArrayBuffer, desc?: string) {
		this.equal(
			a.byteLength,
			b.byteLength,
			`Expected buffer size of ${b.byteLength} but got ${a.byteLength} instead`,
		);
		const valA = a instanceof Uint8Array ? a : new Uint8Array(a);
		const valB = b instanceof Uint8Array ? b : new Uint8Array(b);

		for (const i in valB) this.equal(valA[i], valB[i], desc);
	}

	equalPartial<T>(a: T, b: Partial<T>, desc?: string) {
		for (const key in b) {
			this.equalValues(
				(a as Record<string, unknown>)[key],
				(b as Record<string, unknown>)[key],
				`${desc ? desc + ': ' : ''}Property "${key}"`,
			);
		}
	}

	equalValues<T>(a: T, b: T, desc?: string) {
		if (a instanceof ArrayBuffer && b instanceof ArrayBuffer) {
			return this.equalBuffer(a, b, desc);
		}

		if (Array.isArray(a) && Array.isArray(b)) {
			// Compare array length with description.
			this.equal(
				a.length,
				b.length,
				`${desc ? desc + ': ' : ''}Expected array of length ${
					b.length
				}, got ${a.length}`,
			);
			for (let i = 0; i < Math.max(a.length, b.length); i++) {
				this.equal(
					a[i],
					b[i],
					`${
						desc ? desc + ': ' : ''
					}Array element at [${i}] differs: ${inspect(
						a[i],
					)} !== ${inspect(b[i])}`,
				);
			}
		} else if (
			a === null ||
			a === undefined ||
			b === null ||
			b === undefined
		) {
			// One or both are null/undefined.
			this.equal(
				a,
				b,
				`${desc ? desc + ': ' : ''}Expected ${inspect(
					b,
				)}, got ${inspect(a)}`,
			);
		} else if (
			typeof a === 'string' ||
			typeof b === 'string' ||
			typeof a === 'number' ||
			typeof b === 'number' ||
			typeof a === 'boolean' ||
			typeof b === 'boolean'
		) {
			// Primitive value mismatch
			this.equal(a, b, desc);
		} else if (typeof a === 'object' && typeof b === 'object') {
			// Compare all keys in 'b'
			for (const key in b) {
				this.equalValues(
					(a as Record<string, unknown>)[key],
					(b as Record<string, unknown>)[key],
					`${desc ? desc + ': ' : ''}Property "${key}"`,
				);
			}
			// Optionally check for extra keys in "a" that are not in "b"
			for (const key in a) {
				if (!(key in (b as Record<string, unknown>))) {
					this.ok(
						false,
						`${
							desc ? desc + ': ' : ''
						}Unexpected extra property "${key}" found in actual value`,
					);
				}
			}
		} else {
			// Fallback for unknown types
			this.equal(
				a,
				b,
				`${desc ? desc + ': ' : ''}Expected ${inspect(
					b,
				)}, got ${inspect(a)}`,
			);
		}
	}

	addSpec(test: Test) {
		this.$test.addTest(test);
	}

	throws(fn: () => unknown, matchError?: unknown) {
		let success = false;
		try {
			fn();
		} catch (e) {
			success = true;
			if (matchError) this.equalValues(e, matchError);
		}
		return this.ok(success, `Expected function to throw`);
	}

	ran(n: number) {
		const results = this.$test.results;
		return this.ok(
			n === results.length,
			`Expected ${n} assertions, instead got ${results.length}`,
		);
	}

	async() {
		let result: () => void;
		let called = false;
		if (this.$test.promise)
			throw new Error('async() called multiple times');

		this.$test.promise = this.$test.doTimeout(
			new Promise<void>(resolve => (result = resolve)),
		);
		return () => {
			if (called)
				this.$test.pushError(new Error('Test was already completed.'));
			result();
			called = true;
		};
	}

	/**
	 * You can use testOnly instead of test to specify which tests are the only ones
	 * you want to run in that test file.
	 */
	testOnly(name: string, testFn: TestFn) {
		const test = new Test(name, testFn, this.$test);
		this.$test.addTest(test);
		this.$test.setOnly(test);
	}

	should(name: string, testFn: TestFn) {
		return this.test(`should ${name}`, testFn);
	}

	test(name: string, testFn: TestFn) {
		this.$test.addTest(new Test(name, testFn, this.$test));
	}

	testElement(name: string, testFn: TestFn) {
		return this.test(name, async a => {
			a.setTimeout(60000);
			if (
				typeof __cxlRunner === 'undefined' ||
				!(await __cxlRunner({ type: 'testElement' })).success
			) {
				console.warn('testElement method not supported');
				a.ok(true, 'testElement method not supported');
			} else {
				testQueue = testQueue.then(async () => {
					try {
						return await testFn(a);
					} catch (e) {
						console.error(
							this.$test.name,
							a.$test.name,
							a.dom.id,
							e,
						);
					}
				});
				await testQueue;
			}
		});
	}

	mock<T, K extends keyof FunctionsOf<T>>(object: T, method: K, fn: T[K]) {
		const old = object[method];
		object[method] = fn;
		this.$test.events.subscribe(ev => {
			if (ev.type === 'syncComplete') object[method] = old;
		});
		return fn;
	}

	spyFn<T, K extends keyof FunctionsOf<T>>(object: T, method: K) {
		const spy = spyFn(object, method);
		this.$test.events.subscribe({
			complete: spy.destroy,
		});
		return spy;
	}

	spyProp<T, K extends keyof T>(object: T, prop: K) {
		const spy = spyProp(object, prop);
		this.$test.events.subscribe({
			complete: spy.destroy,
		});
		return spy;
	}

	/** Returns a connected element */
	element<K extends keyof HTMLElementTagNameMap>(
		tagName: K,
	): HTMLElementTagNameMap[K];
	element(tagName: string): HTMLElement;
	element<T>(tagName: { new (): T }): T;
	element(tagName: string | { new (): HTMLElement }) {
		const el =
			typeof tagName === 'string'
				? document.createElement(tagName)
				: new tagName();
		this.dom.appendChild(el);
		return el;
	}

	waitForEvent(el: EventTarget, name: string, trigger: () => void) {
		return new Promise<void>(resolve => {
			function handler() {
				el.removeEventListener(name, handler);
				resolve();
			}
			el.addEventListener(name, handler);
			trigger();
		});
	}

	waitForElement(el: Element | ShadowRoot, selector: string) {
		return new Promise<Element>(resolve => {
			const observer = new MutationObserver(() => {
				const found = el.querySelector(selector);
				if (found) {
					observer.disconnect();
					resolve(found);
				}
			});
			observer.observe(el, { childList: true, subtree: true });
			this.$test.events.subscribe({
				complete() {
					observer.disconnect();
				},
			});
		});
	}

	waitForDisconnect(el: Element) {
		return new Promise<void>(resolve => {
			const parent = el.parentNode;
			if (!parent) return resolve();

			const observer = new MutationObserver(() => {
				if (!el.parentNode) resolve();
			});
			observer.observe(parent, { childList: true });
			this.$test.events.subscribe({
				complete() {
					observer.disconnect();
				},
			});
		});
	}

	expectEvent<T extends HTMLElement>({
		element,
		listener,
		eventName,
		trigger,
		message,
		count,
	}: {
		element: T;
		listener?: Element;
		eventName: string;
		trigger: (el: T) => void;
		message?: string;
		count?: number;
	}) {
		return new Promise<void>((resolve, error) => {
			try {
				listener ??= element;
				const handler = (ev: Event) => {
					this.equal(
						ev.type,
						eventName,
						message ?? `"${eventName}" event fired`,
					);
					this.equal(ev.target, element);

					if (count === undefined || --count === 0) {
						listener?.removeEventListener(eventName, handler);
						resolve();
					}
				};
				listener.addEventListener(eventName, handler);
				trigger(element);
			} catch (e) {
				error(e);
			}
		});
	}

	async a11y(node: Element = this.dom) {
		const mod = await import('./a11y.js');
		const results = mod.testAccessibility(node);
		for (const r of results) this.$test.push(r);
	}

	async sleep(n: number) {
		await new Promise(resolve => setTimeout(resolve, n));
	}

	figure(name: string, html: string, init?: (node: Node) => void) {
		if (typeof __cxlRunner !== 'undefined')
			return new Promise<void>(resolve => {
				this.test(name, async a => {
					const domId = (a.dom.id = `dom${a.id}`);
					const style = a.dom.style;
					style.position = 'absolute';
					style.overflowX = 'hidden';
					style.top = style.left = '0';
					style.width = '320px';
					style.backgroundColor = 'white';

					if (init) init(a.dom);
					const data: FigureData = {
						type: 'figure',
						name,
						domId,
						html,
					};
					const match = await __cxlRunner(data);
					a.$test.push(match);
					await a.a11y();
					resolve();
				});
			});
		else {
			console.warn('figure method not supported');
			this.ok(true, 'figure method not supported');
		}
	}

	setTimeout(val: number) {
		this.$test.timeout = val;
	}

	mockSetInterval() {
		/*eslint @typescript-eslint/no-unsafe-function-type:off */
		this.mockTimeCheck();

		let id = 0;
		const intervals: Record<
			number,
			{
				cb: Function;
				delay: number;
				lastFired: number;
			}
		> = {};

		this.mock(globalThis, 'setInterval', ((
			cb: string | Function,
			delay = 0,
		): number => {
			if (typeof cb === 'string') cb = new Function(cb);
			intervals[++id] = { cb, delay, lastFired: 0 };
			return id;
		}) as typeof globalThis.setInterval);
		this.mock(globalThis, 'clearInterval', (id => {
			if (id !== undefined) delete intervals[id as number];
		}) as typeof globalThis.clearInterval);

		return {
			advance(ms: number) {
				for (const int of Object.values(intervals)) {
					const { cb, delay, lastFired } = int;
					const elapsedTime = ms - lastFired;
					const timesToFire = Math.floor(elapsedTime / (delay || 1));
					for (let i = 0; i < timesToFire; i++) cb();
					int.lastFired = Math.floor(ms / delay) * delay;
				}
			},
		};
	}

	mockSetTimeout() {
		this.mockTimeCheck();

		let id = 0;
		const timeouts: Record<number, { cb: Function; time: number }> = {};

		this.mock(globalThis, 'setTimeout', ((cb: TimerHandler, time = 0) => {
			if (typeof cb === 'string') cb = new Function(cb);
			timeouts[++id] = { cb, time };
			return id;
		}) as typeof globalThis.setTimeout);
		this.mock(globalThis, 'clearTimeout', ((id: number | undefined) => {
			if (id !== undefined) delete timeouts[id];
		}) as typeof globalThis.clearTimeout);
		return {
			advance(ms: number) {
				for (const [key, { cb, time }] of Object.entries(timeouts)) {
					if (time <= ms) {
						cb();
						delete timeouts[+key];
					} else {
						timeouts[+key].time -= ms;
					}
				}
			},
		};
	}

	mockRequestAnimationFrame() {
		this.mockTimeCheck();

		let id = 0;
		const rafs: Record<number, FrameRequestCallback> = {};

		this.mock(globalThis, 'requestAnimationFrame', ((
			cb: FrameRequestCallback,
		) => {
			id++;
			rafs[id] = cb;
			return id;
		}) as typeof globalThis.requestAnimationFrame);

		this.mock(globalThis, 'cancelAnimationFrame', ((rafId: number) => {
			delete rafs[rafId];
		}) as typeof globalThis.cancelAnimationFrame);

		return {
			advance() {
				for (const key in rafs) {
					const cb = rafs[key];
					delete rafs[key];
					cb(performance.now());
				}
			},
		};
	}

	action(action: RunnerAction) {
		const selector = action.element;
		const element =
			selector instanceof Element
				? `#${(selector.id ||= `dom${this.id}-${actionId++}`)}`
				: `#${(this.dom.id ||= `dom${this.id}`)} ${selector ?? ''}`;
		return __cxlRunner({ ...action, element });
	}

	hover(element?: string | Element) {
		return this.action({ type: 'hover', element });
	}

	tap(element?: string | Element) {
		return this.action({ type: 'tap', element });
	}

	protected mockTimeCheck() {
		if (
			this.$test.promise ||
			this.$test.testFn.constructor.name === 'AsyncFunction'
		)
			throw new Error(
				`mockSetTimeout should not be used in async tests. Test: "${this.$test.name}"`,
			);
	}
}

export class Test {
	name: string;
	promise?: Promise<unknown>;
	results: Result[] = [];
	tests: Test[] = [];
	only: Test[] = [];
	timeout = 5 * 1000;
	domContainer?: Element;
	events = subject<TestEvent>();
	completed = false;
	runTime = 0;

	readonly id = lastTestId++;

	constructor(
		nameOrConfig: string | TestConfig,
		public testFn: TestFn,
		public parent?: Test,
	) {
		if (typeof nameOrConfig === 'string') this.name = nameOrConfig;
		else this.name = nameOrConfig.name;
	}

	onEvent(id: EventType, fn: () => Promise<unknown> | void) {
		this.events.subscribe(ev => {
			if (ev.type === id) {
				const result = fn();
				if (result) ev.promises.push(result);
			}
		});
	}

	push(result: Result) {
		if (this.completed) throw new Error('Test already completed');
		this.results.push(result);
	}

	pushError(e: unknown) {
		this.results.push(
			e instanceof Error
				? { success: false, message: e.message, stack: e.stack }
				: {
						success: false,
						message:
							typeof e === 'string'
								? e
								: JSON.stringify(e, null, 2),
				  },
		);
	}

	doTimeout(promise: Promise<unknown>, time = this.timeout) {
		return new Promise<void>((resolve, reject) => {
			const timeoutId = setTimeout(() => {
				reject(
					new Error(
						`Async test "${this.name}" timed out after ${time}ms`,
					),
				);
			}, time);

			promise.then(() => {
				this.completed = true;
				clearTimeout(timeoutId);
				resolve();
			}, reject);
		});
	}

	setOnly(test: Test) {
		if (!this.only.includes(test)) this.only.push(test);
		this.parent?.setOnly(this);
	}

	addTest(test: Test) {
		this.tests.push(test);
		test.parent = this;
		test.timeout = this.timeout;
	}

	async run(): Promise<Result[]> {
		const start = performance.now();
		let syncCompleteNeeded = true;
		this.completed = false;
		this.promise = undefined;
		this.events = subject<TestEvent>();
		const testApi = new TestApi(this);

		try {
			const result = this.testFn(testApi);
			const promise = result ? this.doTimeout(result) : this.promise;

			if (!promise) this.emit('syncComplete');
			syncCompleteNeeded = false;

			await promise;
			if (promise && this.completed === false)
				throw new Error('Never completed');
			if (this.only.length) {
				await Promise.all(this.only.map(test => test.run()));
				throw new Error('"only" was used');
			} else if (this.tests.length)
				await Promise.all(this.tests.map(test => test.run()));
		} catch (e) {
			console.error(String(e));
			this.pushError(e);
		} finally {
			if (syncCompleteNeeded) this.emit('syncComplete');
			if (this.domContainer && this.domContainer.parentNode)
				this.domContainer.parentNode.removeChild(this.domContainer);

			this.domContainer = undefined;
			await this.emit('afterAll');
			this.runTime = performance.now() - start;
		}

		this.events.complete();
		return this.results;
	}

	toJSON(): JsonResult {
		return {
			name: this.name,
			results: this.results,
			tests: this.tests.map(r => r.toJSON()),
			only: this.only.map(r => r.toJSON()),
			runTime: this.runTime,
			timeout: this.timeout,
		};
	}

	protected async emit(type: EventType) {
		const ev: TestEvent = { type, promises: [] };
		this.events.next(ev);
		if (ev.promises) await Promise.all(ev.promises);
	}
}

export type MockFn<A extends unknown[], B> = {
	(...args: A): B;
	calls: number;
	lastResult?: B;
	lastArguments?: A;
};

export function stub() {
	return mockFn<unknown[], unknown>(() => {});
}

export function mockFn<A extends unknown[], B>(
	fn: (...args: A) => B,
): MockFn<A, B> {
	const result: MockFn<A, B> = (...args: A) => {
		result.calls++;
		const r = fn(...args);
		result.lastResult = r;
		result.lastArguments = args;
		return r;
	};
	result.calls = 0;
	return result;
}

function spyFn<T, K extends keyof FunctionsOf<T>>(object: T, method: K) {
	const sub = subject<SpyFn<ParametersOf<T, K>, T[K]>>();
	const originalFn = object[method] as FunctionsOf<T>[K];
	const spy: Spy<SpyFn<ParametersOf<T, K>, T[K]>> = {
		destroy() {
			object[method] = originalFn;
			sub.complete();
		},
		then(resolve, reject) {
			return toPromise(sub.first()).then(
				ev => {
					resolve(ev);
					return ev;
				},
				e => {
					reject(e);
					throw e;
				},
			);
		},
	};
	let called = 0;

	const spyFn = function (this: T, ...args: Parameters<FunctionsOf<T>[K]>) {
		called++;
		const result = originalFn.apply(this, args) as T[K];
		sub.next((spy.lastEvent = { called, arguments: args, result }));
		return result;
	};
	object[method] = spyFn as unknown as T[K];

	return spy;
}

function spyProp<T, K extends keyof T>(object: T, prop: K) {
	let value: T[K] = object[prop];
	let setCount = 0;
	let getCount = 0;
	const sub = subject<SpyProp<T[K]>>();
	const result: Spy<SpyProp<T[K]>> = {
		destroy() {
			sub.complete();
			Object.defineProperty(object, prop, { configurable: true, value });
		},
		then(resolve, reject) {
			return toPromise(sub.first()).then(
				ev => {
					resolve(ev);
					return ev;
				},
				e => {
					reject(e);
					throw e;
				},
			);
		},
	};

	Object.defineProperty(object, prop, {
		configurable: true,
		get() {
			getCount++;
			sub.next((result.lastEvent = { setCount, getCount, value }));
			return value;
		},
		set(newValue: T[K]) {
			setCount++;
			value = newValue;
			sub.next((result.lastEvent = { setCount, getCount, value }));
		},
	});

	return result;
}

/**
 * Emulates a keydown event
 */
export function triggerKeydown(el: Element, key: string) {
	const ev = new CustomEvent('keydown', { bubbles: true });
	(ev as unknown as { key: string }).key = key;
	el.dispatchEvent(ev);
	return ev;
}

export function spec(name: string | TestConfig, fn: TestFn) {
	return new Test(name, fn);
}
