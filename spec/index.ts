declare function __cxlRunner(msg: RunnerCommand): Promise<Result>;

type EventType =
	| 'afterAll'
	| 'afterEach'
	| 'beforeAll'
	| 'beforeEach'
	| 'syncComplete';
type TestEvent = { type: EventType; promises: Promise<unknown>[] };
type Value =
	| object
	| string
	| number
	| boolean
	| bigint
	| symbol
	| null
	| undefined;

export type TestFn<T = TestApi> = (test: T) => void | Promise<unknown>;

type FunctionsOf<T> = {
	/* eslint @typescript-eslint/no-explicit-any:off */
	[K in keyof T]: T[K] extends (...args: any[]) => any ? T[K] : never;
};

type ParametersOf<T, K extends keyof T> = Parameters<FunctionsOf<T>[K]>;
type ResultOf<T, K extends keyof T> = ReturnType<FunctionsOf<T>[K]>;

export interface JsonResult {
	name: string;
	results: Result[];
	tests: JsonResult[];
	only: JsonResult[];
	runTime: number;
	timeout: number;
	level?: number;
	skipped?: boolean;
}
interface Spy<EventT> {
	lastEvent?: EventT;
	destroy(): void;
	then(
		resolve: (ev: EventT | undefined) => void,
		reject: (e: Value) => void,
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
	| {
			type: 'proxy';
			route: string;
			target: string;
	  }
	| { type: 'concurrency' }
	| { type: 'run'; suites: Test[]; baselinePath?: string };

export interface FigureData {
	type: 'figure';
	name: string;
	html: string;
	baseline?: string;
	domId: string;
}

export interface Result {
	success: boolean;
	message?: string;
	failureMessage: string;
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

function isIterator<T>(val: T): val is T & Iterator<Value> {
	return typeof val === 'object' && val !== null && 'next' in val;
}

function isIterable<T>(val: T): val is T & Iterable<Value> {
	return (
		typeof val === 'object' &&
		val !== null &&
		Symbol.iterator in val &&
		typeof val[Symbol.iterator] === 'function'
	);
}

function isIterableOrIterator<T>(val: T): boolean {
	return isIterator(val) || isIterable(val);
}

function isValueArray<T>(val: T): val is T & Value[] {
	return Array.isArray(val);
}

function isRecord<T>(val: T): val is T & Record<string, Value> {
	return typeof val === 'object' && val !== null;
}

function getIterator<T>(val: T): Iterator<Value> {
	if (isIterator(val)) return val;
	if (isIterable(val)) return val[Symbol.iterator]();
	throw new Error('Value is not iterable');
}

class Subject<T> {
	subscribers: Array<{
		next?: (val: T) => void;
		complete?: () => void;
	}> = [];
	completeCalled = false;

	next(val: T) {
		if (this.completeCalled) return;
		this.subscribers.forEach(sub => sub.next?.(val));
	}

	subscribe(
		observer:
			| {
					next?: (val: T) => void;
					complete?: () => void;
			  }
			| ((val: T) => void),
	) {
		if (this.completeCalled) return { unsubscribe() {} };
		let subObj: { next?: (val: T) => void; complete?: () => void };
		if (typeof observer === 'function') {
			subObj = { next: observer };
		} else {
			subObj = observer;
		}
		this.subscribers.push(subObj);
		return {
			unsubscribe: () => {
				this.subscribers = this.subscribers.filter(f => f !== subObj);
			},
		};
	}

	complete() {
		if (this.completeCalled) return;
		this.completeCalled = true;
		this.subscribers.forEach(sub => sub.complete?.());
		this.subscribers = [];
	}

	first(): Promise<T> {
		return new Promise(resolve => {
			const subscription = this.subscribe(val => {
				resolve(val);
				subscription.unsubscribe();
			});
		});
	}
}

function toPromise<T>(
	input: Promise<T> | { first: () => Promise<T> },
): Promise<T> {
	if (input instanceof Promise) return input;
	if (input instanceof Subject) return input.first();

	throw new Error(
		'toPromise: input must be a Promise or observable-like with first()',
	);
}

function inspect<T>(val: T): string {
	if (typeof val === 'string') return '"' + val + '"';
	if (typeof Element !== 'undefined' && val instanceof Element)
		return val.outerHTML;

	return String(val);
}

function matchesGrep(grep: RegExp, value: string) {
	grep.lastIndex = 0;
	return grep.test(value);
}

export abstract class TestApiBase<T extends TestApiBase<T>> {
	abstract createTest: (name: string, testFn: TestFn<T>) => Test<T>;

	constructor(public $test: Test<T>) {}

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

		return el;
	}

	/**
	 * You can use testOnly instead of test to specify which tests are the only ones
	 * you want to run in that test file.
	 */
	/*testOnly = (name: string, testFn: TestFn) => {
		const test = new Test(name, testFn, TestApi, this.$test);
		this.$test.addTest(test);
		this.$test.setOnly(test);
	};*/

	test = (name: string, testFn: TestFn<T>, hlevel?: number) => {
		const t = this.createTest(name, testFn);
		if (hlevel !== undefined) t.level = hlevel;
		this.$test.addTest(t);
	};

	p = (desc: string, testFn: TestFn<T>) => this.test(desc, testFn);

	h = (name: string, testFn: TestFn<T>) =>
		this.test(name, testFn, this.$test.level ? this.$test.level + 1 : 1);

	log = (object: Value) => {
		console.log(object);
	};

	afterAll = (fn: () => Promise<unknown> | void) => {
		this.$test.onEvent('afterAll', fn);
	};

	ok = <T,>(condition: T, message?: string) => {
		this.$test.push({
			success: !!condition,
			message,
			failureMessage: `Assertion failed: ${message}`,
		});
	};

	assert = (condition: Value, message?: string): asserts condition => {
		if (!condition) throw new Error(message);
		this.$test.push({
			success: !!condition,
			message,
			failureMessage: `Assertion Failed: ${message}`,
		});
	};

	equal = <T,>(a: T, b: T, desc?: string) => {
		return this.ok(
			a === b,
			`${desc ? desc + ': ' : ''}${inspect(a)} should equal ${inspect(
				b,
			)}`,
		);
	};

	equalBuffer = (a: ArrayBuffer, b: ArrayBuffer, desc?: string) => {
		this.equal(
			a.byteLength,
			b.byteLength,
			`Expected buffer size of ${b.byteLength} but got ${a.byteLength} instead`,
		);
		const valA = a instanceof Uint8Array ? a : new Uint8Array(a);
		const valB = b instanceof Uint8Array ? b : new Uint8Array(b);

		for (const i in valB) this.equal(valA[i], valB[i], desc);
	};

	equalPartial = <T,>(a: T, b: Partial<T>, desc?: string) => {
		this.equalDeep(a, b, true, desc);
	};

	equalValues = <T,>(a: T, b: T, desc?: string) => {
		this.equalDeep(a, b, false, desc);
	};

	addSpec(test: Test<T>) {
		this.$test.addTest(test);
	}

	throws = (fn: () => void, matchError?: Value) => {
		let success = false;
		try {
			fn();
		} catch (e) {
			success = true;
			if (matchError)
				this.equalDeep(
					typeof e === 'object' && e !== null ? e : String(e),
					matchError,
					true,
				);
		}
		return this.ok(success, `Expected function to throw`);
	};

	ran = (n: number) => {
		const results = this.$test.results;
		return this.ok(
			n === results.length,
			`Expected ${n} assertions, instead got ${results.length}`,
		);
	};

	async = () => {
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
	};

	should = (name: string, testFn: TestFn<T>) => {
		return this.test(`should ${name}`, testFn);
	};

	testElement = (name: string, testFn: TestFn<T>) => {
		return this.test(name, async b => {
			const a = b;
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
						return await testFn(b);
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
	};

	mock = <T, K extends keyof FunctionsOf<T>>(
		object: T,
		method: K,
		fn: T[K],
	) => {
		const old = object[method];
		object[method] = fn;
		this.$test.events.subscribe(ev => {
			if (ev.type === 'syncComplete') object[method] = old;
		});
		return fn;
	};

	spyFn = <T extends object, K extends keyof FunctionsOf<T>>(
		object: T & Record<K, FunctionsOf<T>[K]>,
		method: K,
	) => {
		const spy = spyFn(object, method);
		this.$test.events.subscribe({
			complete: spy.destroy,
		});
		return spy;
	};

	spyProp = <T, K extends keyof T>(object: T, prop: K) => {
		const spy = spyProp(object, prop);
		this.$test.events.subscribe({
			complete: spy.destroy,
		});
		return spy;
	};

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

	waitForEvent = (el: EventTarget, name: string, trigger: () => void) => {
		return new Promise<void>(resolve => {
			function handler() {
				el.removeEventListener(name, handler);
				resolve();
			}
			el.addEventListener(name, handler);
			trigger();
		});
	};

	waitForElement = (el: Element | ShadowRoot, selector: string) => {
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
	};

	waitForDisconnect = (el: Element) => {
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
	};

	expectEvent = <T extends HTMLElement>({
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
	}) => {
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
	};

	a11y = async (node: Element = this.dom) => {
		const mod = await import('./a11y.js');
		const results = mod.testAccessibility(node);
		for (const r of results) this.$test.push(r);
	};

	sleep = async (n: number) => {
		await new Promise(resolve => setTimeout(resolve, n));
	};

	figure = (name: string, html: string, init?: (node: Node) => void) => {
		if (typeof __cxlRunner !== 'undefined')
			return new Promise<void>(resolve => {
				this.test(name, async b => {
					const a = b;
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
	};

	setTimeout = (val: number) => {
		this.$test.timeout = val;
	};

	mockSetInterval = () => {
		this.mockTimeCheck();

		let id = 0;
		const intervals: Record<
			number,
			{
				cb: TimerHandler;
				delay: number;
				lastFired: number;
			}
		> = {};

		const setInterval: typeof globalThis.setInterval = (
			cb: TimerHandler,
			delay = 0,
		) => {
			if (typeof cb !== 'function')
				throw new Error('String interval handlers are not supported');
			intervals[++id] = { cb, delay, lastFired: 0 };
			return id;
		};
		const clearInterval: typeof globalThis.clearInterval = id => {
			if (id !== undefined) delete intervals[id];
		};
		this.mock(globalThis, 'setInterval', setInterval);
		this.mock(globalThis, 'clearInterval', clearInterval);

		return {
			advance(ms: number) {
				for (const int of Object.values(intervals)) {
					const { cb, delay, lastFired } = int;
					const elapsedTime = ms - lastFired;
					const timesToFire = Math.floor(elapsedTime / (delay || 1));
					for (let i = 0; i < timesToFire; i++)
						if (typeof cb === 'function') Reflect.apply(cb, globalThis, []);
					int.lastFired = Math.floor(ms / delay) * delay;
				}
			},
		};
	};

	mockSetTimeout = () => {
		this.mockTimeCheck();

		let id = 0;
		const timeouts: Record<number, { cb: TimerHandler; time: number }> = {};

		const setTimeout: typeof globalThis.setTimeout = (cb, time = 0) => {
			if (typeof cb !== 'function')
				throw new Error('String timeout handlers are not supported');
			timeouts[++id] = { cb, time };
			return id;
		};
		const clearTimeout: typeof globalThis.clearTimeout = id => {
			if (id !== undefined) delete timeouts[id];
		};
		this.mock(globalThis, 'setTimeout', setTimeout);
		this.mock(globalThis, 'clearTimeout', clearTimeout);
		return {
			advance(ms: number) {
				for (const [key, { cb, time }] of Object.entries(timeouts)) {
					if (time <= ms) {
						if (typeof cb === 'function') Reflect.apply(cb, globalThis, []);
						delete timeouts[+key];
					} else {
						const to = timeouts[+key];
						if (to) to.time -= ms;
					}
				}
			},
		};
	};

	mockRequestAnimationFrame = () => {
		this.mockTimeCheck();

		let id = 0;
		const rafs: Record<number, FrameRequestCallback> = {};

		const requestAnimationFrame: typeof globalThis.requestAnimationFrame = cb => {
			id++;
			rafs[id] = cb;
			return id;
		};

		const cancelAnimationFrame: typeof globalThis.cancelAnimationFrame = rafId => {
			delete rafs[rafId];
		};
		this.mock(globalThis, 'requestAnimationFrame', requestAnimationFrame);
		this.mock(globalThis, 'cancelAnimationFrame', cancelAnimationFrame);

		return {
			advance() {
				for (const key in rafs) {
					const cb = rafs[key];
					delete rafs[key];
					cb?.(performance.now());
				}
			},
		};
	};

	action = (action: RunnerAction) => {
		const selector = action.element;
		const element =
			selector instanceof Element
				? `#${(selector.id ||= `dom${this.id}-${actionId++}`)}`
				: `#${(this.dom.id ||= `dom${this.id}`)} ${selector ?? ''}`;
		return __cxlRunner({ ...action, element });
	};

	proxy = (route: string, target: string) => {
		return __cxlRunner({ type: 'proxy', route, target });
	};

	hover = (element?: string | Element) => {
		return this.action({ type: 'hover', element });
	};

	tap = (element?: string | Element) => {
		return this.action({ type: 'tap', element });
	};

	protected equalDeep<T, U>(
		a: T,
		b: U,
		partial: boolean,
		desc?: string,
	) {
		if (a instanceof ArrayBuffer && b instanceof ArrayBuffer) {
			return this.equalBuffer(a, b, desc);
		}

		if (isValueArray(a) && isValueArray(b)) {
			return this.equalArray(a, b, desc);
		}

		if (
			a === null ||
			a === undefined ||
			b === null ||
			b === undefined
		) {
			return this.equal<T | U>(
				a,
				b,
				`${desc ? desc + ': ' : ''}Expected ${inspect(
					b,
				)}, got ${inspect(a)}`,
			);
		}

		if (
			typeof a === 'string' ||
			typeof b === 'string' ||
			typeof a === 'number' ||
			typeof b === 'number' ||
			typeof a === 'boolean' ||
			typeof b === 'boolean'
		) {
			return this.equal<T | U>(a, b, desc);
		}

		if (isIterableOrIterator(a) && isIterableOrIterator(b)) {
			return this.equalIterable(a, b, desc);
		}

		if (isRecord(a) && isRecord(b)) {
			return this.equalObject(a, b, partial, desc);
		}

		this.equal<T | U>(
			a,
			b,
			`${desc ? desc + ': ' : ''}Expected ${inspect(
				b,
			)}, got ${inspect(a)}`,
		);
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

	private equalArray(a: Value[], b: Value[], desc?: string) {
		this.equal(
			a.length,
			b.length,
			`${desc ? desc + ': ' : ''}Expected array of length ${
				b.length
			}, got ${a.length}`,
		);
		for (let i = 0; i < Math.max(a.length, b.length); i++) {
			this.equalValues(
				a[i],
				b[i],
				`${
					desc ? desc + ': ' : ''
				}Array element at [${i}] differs: ${inspect(
					a[i],
				)} !== ${inspect(b[i])}`,
			);
		}
	}

	private equalIterable(a: Value, b: Value, desc?: string) {
		const iteratorA = getIterator(a);
		const iteratorB = getIterator(b);
		let i = 0;

		for (;;) {
			const stepA = iteratorA.next();
			const stepB = iteratorB.next();

			if (stepA.done || stepB.done) {
				this.equal(
					!!stepA.done,
					!!stepB.done,
					`${desc ? desc + ': ' : ''}Generator completion differs at [${i}]`,
				);
				break;
			}

			this.equalValues(
				stepA.value,
				stepB.value,
				`${desc ? desc + ': ' : ''}Generator value at [${i}]`,
			);
			i++;
		}
	}

	private equalObject(
		a: Record<string, Value>,
		b: Record<string, Value>,
		partial: boolean,
		desc?: string,
	) {
		let count = 0;

		for (const key of Object.keys(b)) {
			count++;
			this.equalDeep(
				a[key],
				b[key],
				partial,
				`${desc ? desc + ': ' : ''}Property "${key}"`,
			);
		}

		if (!partial)
			for (const key of Object.keys(a)) {
				count++;
				if (!(key in b)) {
					this.ok(
						false,
						`${
							desc ? desc + ': ' : ''
						}Unexpected extra property "${key}" found in actual value`,
					);
				}
			}
		if (count === 0) this.ok(true, 'Both objects are empty.');
	}
}

export class TestApi extends TestApiBase<TestApi> {
	createTest = (name: string, testFn: TestFn) =>
		new Test(name, testFn, TestApi, this.$test);
}

export class Test<T extends TestApiBase<T> = TestApi> {
	name: string;
	promise?: Promise<unknown>;
	results: Result[] = [];
	tests: Test<T>[] = [];
	only: Test<T>[] = [];
	timeout = 5 * 1000;
	domContainer?: HTMLElement;
	events = new Subject<TestEvent>();
	completed = false;
	runTime = 0;
	level?: number;
	skipped = false;

	readonly id = lastTestId++;

	constructor(
		nameOrConfig: string | TestConfig,
		public testFn: TestFn<T>,
		protected TestApiFn: new ($test: Test<T>) => T,
		public parent?: Test<T>,
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
		if (this.skipped) return;
		if (this.completed) throw new Error('Test already completed');
		this.results.push(result);
	}

	pushError(e: Value) {
		if (this.skipped) return;
		const failureMessage =
			typeof e === 'string'
				? e
				: e instanceof Error
					? e.message
					: JSON.stringify(e, null, 2) || String(e);

		this.results.push(
			e instanceof Error
				? {
						success: false,
						failureMessage,
						stack: e.stack,
					}
				: {
						success: false,
						failureMessage,
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

	setOnly(test: Test<T>) {
		if (!this.only.includes(test)) this.only.push(test);
		this.parent?.setOnly(this);
	}

	addTest(test: Test<T>) {
		this.tests.push(test);
		test.parent = this;
		test.timeout = this.timeout;
	}

	path(): string {
		return this.parent ? `${this.parent.path()} ${this.name}` : this.name;
	}

	async run(grep?: RegExp, targetPath?: string): Promise<Result[]> {
		const start = performance.now();
		let syncCompleteNeeded = true;
		this.completed = false;
		this.promise = undefined;
		this.skipped = this.shouldSkip(grep, targetPath);
		if (this.skipped) return this.results;
		const testApi = new this.TestApiFn(this);

		try {
			const result = this.testFn(testApi);
			const promise = result ? this.doTimeout(result) : this.promise;

			if (!promise) await this.emit('syncComplete');
			else await promise;
			syncCompleteNeeded = false;
			if (this.only.length) {
				await Promise.all(this.only.map(test => test.run(grep, targetPath)));
				throw new Error('"only" was used');
			} else if (this.tests.length)
				await Promise.all(this.tests.map(test => test.run(grep, targetPath)));

			if (
				!this.parent &&
				!!grep &&
				this.results.length === 0 &&
				this.only.every(test => test.skipped) &&
				this.tests.every(test => test.skipped)
			)
				this.skipped = true;
		} catch (e) {
			this.pushError(
				typeof e === 'object' && e !== null ? e : String(e),
			);
			console.error(String(e));
		} finally {
			if (syncCompleteNeeded) await this.emit('syncComplete');
			this.domContainer?.parentNode?.removeChild(this.domContainer);
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
			tests: this.tests.filter(r => !r.skipped).map(r => r.toJSON()),
			only: this.only.filter(r => !r.skipped).map(r => r.toJSON()),
			runTime: this.runTime,
			timeout: this.timeout,
			level: this.level,
			skipped: this.skipped,
		};
	}

	protected async emit(type: EventType) {
		const ev: TestEvent = { type, promises: [] };
		this.events.next(ev);
		await Promise.all(ev.promises);
	}

	private shouldSkip(grep?: RegExp, targetPath?: string) {
		return targetPath
			? targetPath !== this.path() && !targetPath.startsWith(`${this.path()} `)
			: !!grep && !!this.parent && !matchesGrep(grep, this.path());
	}
}

export type MockFn<A extends Value[], B> = {
	(...args: A): B;
	calls: number;
	lastResult?: B;
	lastArguments?: A;
};

export function stub() {
	return mockFn<Value[], void>(() => {});
}

export function mockFn<A extends Value[], B>(
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

function spyFn<T extends object, K extends keyof FunctionsOf<T>>(
	object: T & Record<K, FunctionsOf<T>[K]>,
	method: K,
) {
	const sub = new Subject<SpyFn<ParametersOf<T, K>, ResultOf<T, K>>>();
	const originalFn = object[method];
	const spy: Spy<SpyFn<ParametersOf<T, K>, ResultOf<T, K>>> = {
		destroy() {
			Reflect.set(object, method, originalFn);
			sub.complete();
		},
		then(resolve, reject) {
			return toPromise(sub.first()).then(
				ev => {
					resolve(ev);
					return ev;
				},
				e => {
					const error = e instanceof Error ? e : String(e);
					reject(error);
					throw error;
				},
			);
		},
	};
	let called = 0;

	const spyFn = function (
		this: T,
		...args: ParametersOf<T, K>
	): ResultOf<T, K> {
		called++;
		const result = originalFn.apply(this, args);
		sub.next((spy.lastEvent = { called, arguments: args, result }));
		return result;
	};
	Reflect.set(object, method, spyFn);

	return spy;
}

function spyProp<T, K extends keyof T>(object: T, prop: K) {
	let value: T[K] = object[prop];
	let setCount = 0;
	let getCount = 0;
	const sub = new Subject<SpyProp<T[K]>>();
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
					const error = e instanceof Error ? e : String(e);
					reject(error);
					throw error;
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
	const ev = new KeyboardEvent('keydown', { bubbles: true, key });
	el.dispatchEvent(ev);
	return ev;
}

export function spec(name: string | TestConfig, fn: TestFn) {
	return new Test(name, fn, TestApi);
}
