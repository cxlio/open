declare const setTimeout: (fn: () => unknown, n?: number) => number;
declare const clearTimeout: (n: number) => void;
declare const setInterval: (fn: () => unknown, n?: number) => number;
declare const clearInterval: (n: number) => void;

type ObservableError = unknown;
type NextFunction<T> = (val: T) => void;
type ErrorFunction = (err: ObservableError) => void;
type CompleteFunction = () => void;
type SubscribeFunction<T> = (subscription: Subscriber<T>) => void;
type Merge<T> = T extends Observable<infer U> ? U : never;
type ObservableT<T> = T extends Observable<infer U> ? U : never;
type PickObservable<T> = {
	[P in keyof T]: T[P] extends Observable<unknown>
		? ObservableT<T[P]>
		: never;
};
type CombineResult<R extends Observable<unknown>[]> = R extends (infer U)[]
	? Observable<Merge<U>>
	: never;

export type Operator<T, T2 = T> = (observable: Observable<T>) => Observable<T2>;
export type ObservableInput<T> = Iterable<T> | Promise<T> | Observable<T>;
export type ReadonlyBehaviorSubject<T> = Observable<T> & { readonly value: T };

export interface Observer<T> {
	/**
	 * The `next` property allows the observer to react to each value emitted by the Observable.
	 */
	next?: NextFunction<T>;

	/**
	 * The `error` property within the `Observer` interface is an optional method
	 * that handles errors from the Observable's execution.
	 *
	 * - Providing an error handler here allows Observers to manage exceptions locally
	 *   without propagating them further up the execution chain.
	 */
	error?: ErrorFunction;

	/**
	 * The `complete` property within the `Observer` interface is an optional method
	 * that signals the successful completion of the Observable's emission sequence.
	 *
	 * - If provided, it will be invoked when the Observable has finished emitting all values without an error.
	 * - This is particularly useful for cleaning up resources or triggering follow-up logic.
	 */
	complete?: CompleteFunction;

	/**
	 * The `signal` property is an optional Observable that provides a mechanism for external cancellation.
	 */
	signal?: Observable<void>;
}

export interface Subscribable<T> {
	subscribe(observer: Observer<T>): Subscription;
}

type NextObserver<T> = NextFunction<T> | Observer<T> | undefined;
export type Subscriber<T> = ReturnType<typeof Subscriber<T>>;

export interface Subscription {
	unsubscribe(): void;
}

// Represents the initial state
const Undefined = {};
// Represents when the observable is ready to complete
const Terminator = Symbol('terminator');

export function Subscriber<T>(
	observer: Observer<T>,
	subscribe?: SubscribeFunction<T>,
) {
	let closed = false;

	const result = {
		error,
		unsubscribe,
		get closed() {
			return closed;
		},
		signal: new Signal(),
		next(val: T) {
			if (closed) return;
			try {
				observer.next?.(val);
			} catch (e) {
				error(e);
			}
		},
		complete() {
			if (!closed) {
				try {
					observer.complete?.();
				} finally {
					unsubscribe();
				}
			}
		},
	};

	observer.signal?.subscribe(unsubscribe);

	function error(e: ObservableError) {
		if (!closed) {
			if (!observer.error) {
				unsubscribe();
				throw e;
			}
			try {
				observer.error(e);
			} finally {
				unsubscribe();
			}
		} else throw e;
	}
	function unsubscribe() {
		if (!closed) {
			closed = true;
			result.signal.next();
		}
	}

	try {
		subscribe?.(result);
	} catch (e) {
		error(e);
	}

	return result;
}

/**
 * Used to stitch together functional operators into a chain.
 */
export function pipe<T, A, B>(
	a: Operator<T, A>,
	b: Operator<A, B>,
): Operator<T, B>;
export function pipe<T, A, B, C>(
	a: Operator<T, A>,
	b: Operator<A, B>,
	c: Operator<B, C>,
): Operator<T, C>;
export function pipe<T, A, B, C, D>(
	a: Operator<T, A>,
	b: Operator<A, B>,
	c: Operator<B, C>,
	d: Operator<C, D>,
): Operator<T, D>;
export function pipe<T, A, B, C, D, E>(
	a: Operator<T, A>,
	b: Operator<A, B>,
	c: Operator<B, C>,
	d: Operator<C, D>,
	e: Operator<D, E>,
): Operator<T, E>;
export function pipe(...operators: Operator<unknown>[]): Operator<unknown> {
	return (source: Observable<unknown>) =>
		operators.reduce((prev, fn) => fn(prev), source);
}

/*eslint @typescript-eslint/no-unsafe-declaration-merging:off */

/**
 * A representation of any set of values over any amount of time.
 */
export class Observable<T, P = 'none'> {
	constructor(protected __subscribe: SubscribeFunction<T>) {}

	/**
	 * The `then` method allows an Observable to act like a Promise.
	 * It converts the Observable's emissions into a Promise that resolves on completion.
	 */
	then<E, R>(
		resolve: (val: P extends 'emit1' ? T : T | undefined) => R,
		reject?: (e: E) => R,
	): Promise<R> {
		return toPromise(this).then(resolve, reject);
	}

	pipe<A>(a: Operator<T, A>): Observable<A>;
	pipe<A, B>(a: Operator<T, A>, b: Operator<A, B>): Observable<B>;
	pipe<A, B, C>(
		a: Operator<T, A>,
		b: Operator<A, B>,
		c: Operator<B, C>,
	): Observable<C>;
	pipe<A, B, C, D>(
		a: Operator<T, A>,
		b: Operator<A, B>,
		c: Operator<B, C>,
		d: Operator<C, D>,
	): Observable<D>;
	pipe<A, B, C, D, E>(
		a: Operator<T, A>,
		b: Operator<A, B>,
		c: Operator<B, C>,
		d: Operator<C, D>,
		e: Operator<D, E>,
	): Observable<E>;

	/**
	 * Used to stitch together functional operators into a chain.
	 */
	pipe(
		...extra: [Operator<T, unknown>, ...Operator<unknown, unknown>[]]
	): Observable<unknown> {
		return extra.reduce(
			(prev, fn) => fn(prev as Observable<T>),
			this as Observable<unknown>,
		);
	}

	/**
	 * Invokes an execution of an Observable and registers Observer handlers for notifications it will emit.
	 */
	subscribe(next?: NextObserver<T>): Subscription {
		const observer = !next || typeof next === 'function' ? { next } : next;
		return Subscriber<T>(observer, this.__subscribe);
	}
}

/**
 * A Subject is an Observable that allows values to be
 * multicasted to many Observers.
 */
export class Subject<T, ErrorT = unknown> extends Observable<T> {
	closed = false;
	signal = new Signal();

	protected observers = new Set<Subscriber<T>>();

	constructor() {
		super((subscriber: Subscriber<T>) => this.onSubscribe(subscriber));
	}

	/**
	 * Emits a new value to all active subscribers if the Subject is not in a closed state.
	 * - Iterates over the list of current subscribers and calls their `next` method with the provided value.
	 * - Inactive or closed subscribers are skipped.
	 * - This ensures only active subscribers receive new emissions.
	 */
	next(a: T): void {
		if (!this.closed)
			for (const s of Array.from(this.observers))
				if (!s.closed) s.next(a);
	}

	/*
	 * This method emits an error notification to all active subscribers and sets the Subject's
	 * closed state to `true`, preventing any further emissions.
	 */
	error(e: ErrorT): void {
		if (!this.closed) {
			this.closed = true;
			let shouldThrow = false,
				lastError;
			for (const s of Array.from(this.observers))
				try {
					s.error(e);
				} catch (e) {
					shouldThrow = true;
					lastError = e;
					/* noop */
				}
			if (shouldThrow) throw lastError;
		}
	}

	/*
	 * `complete` method sends a final completion notification to all active subscribers
	 * and marks the Subject as closed.
	 */
	complete(): void {
		if (!this.closed) {
			this.closed = true;
			Array.from(this.observers).forEach(s => s.complete());
			this.observers.clear();
		}
	}

	protected onSubscribe(subscriber: Subscriber<T>): void {
		if (this.closed) subscriber.complete();
		else {
			this.observers.add(subscriber);
			subscriber.signal.subscribe(() =>
				this.observers.delete(subscriber),
			);
		}
	}
}

/**
 * A specialized `Observable` that emits only once to its subscribers.
 *
 * - Subscribers are notified when the signal is triggered via the `next` method.
 * - Once triggered, it completes all current and future subscribers immediately.
 * - Subscriptions to this signal will only emit once if the signal is already closed.
 *
 */
export class Signal extends Observable<void> {
	closed = false;
	protected observers = new Set<Subscriber<void>>();

	constructor() {
		super((subscriber: Subscriber<void>) => {
			if (this.closed) {
				subscriber.next();
				subscriber.complete();
			} else this.observers.add(subscriber);
		});
	}

	next(): void {
		if (!this.closed) {
			this.closed = true;
			for (const s of Array.from(this.observers))
				if (!s.closed) {
					s.next();
					s.complete();
				}
			this.observers.clear();
		}
	}
}

/**
 * A subject that guarantees all subscribers receive the same values in the order they were emitted.
 */
export class OrderedSubject<T> extends Subject<T> {
	private queue: T[] = [];
	private emitting = false;

	next(a: T) {
		if (this.closed) return;
		if (this.emitting) this.queue.push(a);
		else {
			this.emitting = true;
			super.next(a);
			while (this.queue.length) super.next(this.queue.shift() as T);
			this.emitting = false;
		}
	}
}

/**
 * A variant of Subject that requires an initial value and emits its current value whenever it is subscribed to.
 * @see be
 */
export class BehaviorSubject<T> extends Subject<T> {
	constructor(private currentValue: T) {
		super();
	}

	get value() {
		return this.currentValue;
	}

	next(val: T) {
		this.currentValue = val;
		super.next(val);
	}

	protected onSubscribe(subscription: Subscriber<T>) {
		const result = super.onSubscribe(subscription);
		if (!this.closed) subscription.next(this.currentValue);
		return result;
	}
}

/**
 * A variant of Subject that "replays" or emits old values to new subscribers.
 * It buffers a set number of values and will emit those values immediately to any
 * new subscribers in addition to emitting new values to existing subscribers.
 */
export class ReplaySubject<T, ErrorT = unknown> extends Subject<T, ErrorT> {
	private buffer: T[] = [];
	private hasError = false;
	private lastError?: ErrorT;

	constructor(public readonly bufferSize: number = Infinity) {
		super();
	}

	error(val: ErrorT) {
		this.hasError = true;
		this.lastError = val;
		super.error(val);
	}

	next(val: T) {
		if (this.buffer.length === this.bufferSize) this.buffer.shift();

		this.buffer.push(val);
		return super.next(val);
	}

	protected onSubscribe(subscriber: Subscriber<T>) {
		this.observers.add(subscriber);

		this.buffer.forEach(val => subscriber.next(val));
		if (this.hasError) subscriber.error(this.lastError as ErrorT);
		else if (this.closed) subscriber.complete();
		subscriber.signal.subscribe(() => this.observers.delete(subscriber));
	}
}

/**
 * A Reference is a behavior subject that does not require an initial value.
 */
export class Reference<T> extends Subject<T> {
	protected $value: T | typeof Undefined = Undefined;

	get hasValue() {
		return this.$value !== Undefined;
	}

	get value(): T {
		if (this.$value === Undefined)
			throw new Error('Reference not initialized');
		return this.$value as T;
	}

	next(val: T) {
		this.$value = val;
		return super.next(val);
	}

	protected onSubscribe(subscription: Subscriber<T>) {
		if (!this.closed && this.$value !== Undefined)
			subscription.next(this.$value as T);
		super.onSubscribe(subscription);
	}
}

export class EmptyError extends Error {
	message = 'No elements in sequence';
}

/**
 * Creates an output Observable which sequentially emits all values from given Observable and then moves on to the next.
 */
export function concat<R extends Observable<unknown>[]>(
	...observables: R
): CombineResult<R> {
	return new Observable(subscriber => {
		let index = 0;
		let innerSignal: Signal | undefined;

		function onComplete() {
			const next = observables[index++];
			if (next && !subscriber.closed) {
				innerSignal?.next();
				next.subscribe({
					next: subscriber.next,
					error: subscriber.error,
					complete: onComplete,
					signal: (innerSignal = new Signal()),
				});
			} else subscriber.complete();
		}
		subscriber.signal.subscribe(() => innerSignal?.next());
		onComplete();
	}) as CombineResult<R>;
}

/**
 * Creates an Observable that, on subscribe, calls an Observable factory to make an Observable for each new Observer.
 */
export function defer<T>(fn: () => Subscribable<T>) {
	return new Observable<T>(subs => {
		fn().subscribe(subs);
	});
}

export function fromPromise<T>(input: Promise<T>): Observable<T> {
	return new Observable<T>(subs => {
		input
			.then(result => {
				if (!subs.closed) subs.next(result);
				subs.complete();
			})
			.catch(err => subs.error(err));
	});
}

export function fromAsync<T>(input: () => Promise<T>): Observable<T> {
	return defer(() => fromPromise(input()));
}

export function fromIterable<T>(input: Iterable<T>): Observable<T> {
	return new Observable<T>(subs => {
		for (const item of input) if (!subs.closed) subs.next(item);
		subs.complete();
	});
}

/**
 * Creates an Observable from an Array, an array-like object, a Promise, an iterable object, or an Observable-like object.
 */
export function from<T>(input: ObservableInput<T>): Observable<T> {
	if (input instanceof Observable) return input;
	if (input instanceof Promise) return fromPromise(input);
	return fromIterable(input);
}

/**
 * Converts the arguments to an observable sequence.
 */
export function of<T>(...values: T[]): Observable<T> {
	return fromIterable(values);
}

function _toPromise<T, P>(observable: Observable<T, P>) {
	return new Promise<P extends 'emit1' ? T : T | typeof Undefined>(
		(resolve, reject) => {
			let value: typeof Undefined | T = Undefined;
			observable.subscribe({
				next: (val: T) => (value = val),
				error: (e: ObservableError) => reject(e),
				complete: () =>
					resolve(
						value as P extends 'emit1' ? T : T | typeof Undefined,
					),
			});
		},
	);
}

/**
 * Generates a promise from an observable, the promise will resolve when the observable completes.
 */
export function toPromise<T, P>(
	observable: Observable<T, P>,
): Promise<P extends 'emit1' ? T : T | undefined> {
	return _toPromise<T, P>(observable).then(
		r =>
			(r === Undefined ? undefined : r) as P extends 'emit1'
				? T
				: T | undefined,
	);
}

export async function firstValueFrom<T>(observable: Observable<T>) {
	return _toPromise(observable.first()) as Promise<T>;
}

export function operatorNext<T, T2 = T>(
	fn: (subs: Subscriber<T2>) => NextFunction<T>,
	unsubscribe?: () => void,
) {
	return operator<T, T2>(subs => ({ next: fn(subs), unsubscribe }));
}

export function operator<T, T2 = T>(
	fn: (
		subs: Subscriber<T2>,
		source: Observable<T>,
	) => Observer<T> & {
		unsubscribe?: () => void;
	},
): Operator<T, T2> {
	return (source: Observable<T>) =>
		new Observable<T2>(subscriber => {
			const next = fn(subscriber, source);
			subscriber.signal.subscribe(() => next.unsubscribe?.());
			if (!next.error) next.error = subscriber.error;
			if (!next.complete) next.complete = subscriber.complete;
			next.signal = subscriber.signal;

			source.subscribe(next);
		});
}

/**
 * Applies a given project function to each value emitted by the source Observable, and emits the resulting values as an Observable.
 */
export function map<T, T2>(mapFn: (val: T) => T2) {
	return operatorNext<T, T2>(
		subscriber => (val: T) => subscriber.next(mapFn(val)),
	);
}

/*
 * Emits a mapped value only if it differs from the previous one.
 * This operator optimizes emission by preventing duplicate consecutive values,
 *   reducing unnecessary updates to downstream subscribers.
 */
export function select<T, T2>(mapFn: (val: T) => T2) {
	let lastValue: T2 | typeof Undefined = Undefined;
	return operatorNext<T, T2>(subscriber => (val: T) => {
		const result = mapFn(val);
		if (result !== lastValue) {
			lastValue = result;
			subscriber.next(result);
		}
	});
}

/**
 * Applies an accumulator function over the source Observable, and returns the accumulated result when the source completes, given an optional seed value.
 */
export function reduce<T, T2>(
	reduceFn: (acc: T2, val: T, i: number) => T2,
	seed: T2,
) {
	return operator<T, T2>(subscriber => {
		let acc = seed;
		let i = 0;
		return {
			next(val: T) {
				acc = reduceFn(acc, val, i++);
			},
			complete() {
				subscriber.next(acc);
				subscriber.complete();
			},
		};
	});
}

/**
 * `debounceFunction` is a utility that delays the execution of a given function (`fn`) until after
 * a specified period of time (`delay`) has elapsed since the last time it was invoked. If the function
 * is retriggered before the delay period ends, the previous invocation is canceled and the timer restarts.
 *
 * - This is helpful to limit the execution of a frequently invoked function, such as when handling events
 *   like window resize, user input, or API calls to avoid excessive execution.
 *
 * The returned function has a `cancel` method that can be called to manually clear any pending debounce timer.
 */
/* eslint-disable-next-line @typescript-eslint/no-explicit-any */
export function debounceFunction<F extends (...args: any) => any>(
	fn: F,
	delay?: number,
) {
	/*eslint prefer-rest-params: off*/
	let to: number;
	const result = function (this: unknown) {
		if (to) clearTimeout(to);
		to = setTimeout(() => {
			fn.apply(this, arguments as unknown as unknown[]);
		}, delay) as unknown as number;
	};

	(result as unknown as { cancel(): void }).cancel = () => clearTimeout(to);

	return result as ((...args: Parameters<F>) => void) & { cancel(): void };
}

/**
 * Limits the rate at which values are emitted to the subscriber by ensuring
 * only one emission can occur per specified time interval.
 * Subsequent values emitted within the throttling period are ignored.
 * Clears the timeout on unsubscription to prevent memory leaks.
 */
export function throttleTime<T>(time: number) {
	return operator<T, T>(subscriber => {
		let ready = true;
		let to: number;
		return {
			next(val: T) {
				if (!ready) return;
				ready = false;
				subscriber.next(val);
				to = setTimeout(() => (ready = true), time);
			},
			unsubscribe: () => clearTimeout(to),
		};
	});
}

/**
 * Creates an Observable that periodically emits a notification at the specified interval until it is unsubscribed.
 *
 * - Internally, it uses `setInterval` to manage periodic execution.
 * - The `clearInterval` function is called during unsubscription to stop further emissions and clean up.
 */
export function interval(period: number) {
	if (period < 0) throw new Error('Invalid period');
	return new Observable<void>(subscriber => {
		const to = setInterval(subscriber.next, period);
		subscriber.signal.subscribe(() => clearInterval(to));
	});
}

/*
 * `timer` creates an Observable that emits a single value (`void`) after a specified delay.
 * - The emission occurs via a `setTimeout` call.
 * - After emitting, the Observable completes its sequence, ensuring no further emissions.
 *
 * Use case:
 * This is useful for delaying an action or scheduling one-time events in an Observable-based pipeline.
 * During unsubscription, any pending timeout is cleared to avoid unnecessary task execution.
 */
export function timer(delay: number) {
	return new Observable<void>(subscriber => {
		const to = setTimeout(() => {
			subscriber.next();
			subscriber.complete();
		}, delay);
		subscriber.signal.subscribe(() => clearTimeout(to));
	});
}

/**
 * Emits a value from the source Observable only after a particular time span has passed without another source emission.
 */
export function debounceTime<T>(time: number, useTimer = timer): Operator<T> {
	return switchMap<T, T>(val => useTimer(time).map(() => val));
}

/**
 * Projects each source value to an Observable which is merged in the output Observable,
 * emitting values only from the most recently projected Observable.
 */
export function switchMap<T, T2>(
	project: (val: T) => Observable<T2>,
): Operator<T2>;
export function switchMap<T, T2, T3>(
	project: (val: T) => Observable<T2> | Promise<T3>,
): Operator<T2 | T3>;
export function switchMap<T, T2>(
	project: (val: T) => Promise<T2>,
): Operator<T, T2>;
export function switchMap<T>(project: (val: T) => ObservableInput<unknown>) {
	return (source: Observable<T>) =>
		observable<unknown>(subscriber => {
			let hasSubscription = false;
			let completed = false;
			let signal: Signal | undefined;

			const cleanUp = () => {
				signal?.next();
				hasSubscription = false;
				if (completed) subscriber.complete();
			};
			const outerSignal = new Signal();

			subscriber.signal.subscribe(() => {
				cleanUp();
				outerSignal.next();
			});

			source.subscribe({
				next(val: T) {
					cleanUp();
					signal = new Signal();
					hasSubscription = true;
					from(project(val)).subscribe({
						next: subscriber.next,
						error: subscriber.error,
						complete: cleanUp,
						signal,
					});
				},
				error: subscriber.error,
				complete() {
					completed = true;
					if (!hasSubscription) subscriber.complete();
				},
				signal: outerSignal,
			});
		});
}

/**
 * Projects each source value to an Observable which is merged in the output Observable.
 */
export function mergeMap<T, T2>(project: (val: T) => ObservableInput<T2>) {
	return (source: Observable<T>) =>
		observable<T2>(subscriber => {
			const signal = subscriber.signal;
			let count = 0;
			let completed = 0;
			let sourceCompleted = false;

			source.subscribe({
				next: (val: T) => {
					count++;
					from(project(val)).subscribe({
						next: subscriber.next,
						error: subscriber.error,
						complete: () => {
							completed++;
							if (sourceCompleted && completed === count) {
								subscriber.complete();
							}
						},
						signal,
					});
				},
				error: subscriber.error,
				complete() {
					sourceCompleted = true;
					if (completed === count) subscriber.complete();
				},
				signal,
			});
		});
}

/**
 * Projects each source value to an Observable which is merged in the output Observable
 * only if the previous projected Observable has completed.
 */
export function exhaustMap<T, T2>(project: (value: T) => ObservableInput<T2>) {
	return operator<T, T2>(subscriber => {
		let ready = true;
		return {
			next(val: T) {
				if (ready) {
					ready = false;
					from(project(val)).subscribe({
						next: subscriber.next,
						error: subscriber.error,
						complete: () => (ready = true),
						signal: subscriber.signal,
					});
				}
			},
		};
	});
}

/**
 * Filter items emitted by the source Observable.
 *
 * @see distinctUntilChanged
 */
export function filter<T>(fn: (val: T) => boolean): Operator<T, T> {
	return operatorNext((subscriber: Subscriber<T>) => (val: T) => {
		if (fn(val)) subscriber.next(val);
	});
}

/**
 * Emits only the first count values emitted by the source Observable.
 */
export function take<T>(howMany: number) {
	return operatorNext((subs: Subscriber<T>) => (val: T) => {
		if (howMany-- > 0 && !subs.closed) subs.next(val);
		if (howMany <= 0 || subs.closed) subs.complete();
	});
}

/**
 * Emits values while fn result is truthy.
 */
export function takeWhile<T>(fn: (val: T) => boolean) {
	return operatorNext((subs: Subscriber<T>) => (val: T) => {
		if (!subs.closed && fn(val)) subs.next(val);
		else subs.complete();
	});
}

/**
 * Emits only the first value emitted by the source Observable.
 * Delivers an EmptyError to the Observer's error callback if the Observable completes before any next notification was sent
 */
export function first<T>() {
	let done = false;
	return operator<T, T>(subs => ({
		next(val: T) {
			if (done) return;
			done = true;
			subs.next(val);
			subs.complete();
		},
		complete() {
			if (!subs.closed) subs.error(new EmptyError());
		},
	}));
}

/**
 * Perform a side effect for every emission on the source Observable,
 * but return an Observable that is identical to the source.
 */
export function tap<T>(fn: (val: T) => void): Operator<T, T> {
	return operatorNext<T, T>((subscriber: Subscriber<T>) => (val: T) => {
		fn(val);
		subscriber.next(val);
	});
}

/**
 * Catches errors on the observable.
 *
 * @param selector A function that takes as arguments the error `err`,  and `source`, which
 *  is the source observable. The observable
 *  returned will be used to continue the observable chain.
 *
 */
export function catchError<T, O extends T | never>(
	selector: (err: unknown, source: Observable<T>) => Observable<O> | void,
): Operator<T, T> {
	return operator<T, T>((subscriber, source) => {
		let signal: Signal | undefined;
		const observer = {
			next: subscriber.next,
			error(err: unknown) {
				try {
					if (subscriber.closed) return;
					const result = selector(err, source);
					if (result) {
						signal?.next();
						signal = new Signal();
						result.subscribe({ ...observer, signal });
					}
				} catch (err2) {
					subscriber.error(err2);
				}
			},
			unsubscribe: () => signal?.next(),
		};
		return observer;
	});
}

/**
 * Returns an Observable that emits all items emitted by the source Observable
 * that are distinct by comparison from the previous item.
 */
export function distinctUntilChanged<T>(): Operator<T, T> {
	return operatorNext((subscriber: Subscriber<T>) => {
		let lastValue: T | typeof Undefined = Undefined;
		return (val: T) => {
			if (val !== lastValue) {
				lastValue = val;
				subscriber.next(val);
			}
		};
	});
}

/**
 * The `shareLatest` operator multicasts the latest value from the source Observable to all current and future subscribers.
 * - It uses a `ReplaySubject` with a buffer size of 1 to cache and share the latest emission.
 * - The source Observable is subscribed to only once, and its latest emitted value is replayed to any new subscribers.
 * - This is useful when you want all subscribers to receive the most recent value without resubscribing to the source.
 */
export function shareLatest<T>(): Operator<T, T> {
	return (source: Observable<T>) => {
		const subject = new ReplaySubject<T>(1);
		let ready = false;
		return observable<T>(subs => {
			subject.subscribe(subs);
			if (!ready) {
				ready = true;
				source.subscribe(subject);
			}
		});
	};
}

export function shareReplay<T>(bufferSize?: number): Operator<T, T> {
	return (source: Observable<T>) => {
		const subject = new ReplaySubject<T>(bufferSize);
		let refCount = 0;
		return observable<T>(subs => {
			refCount++;
			subject.subscribe(subs);
			if (refCount === 1) {
				source.subscribe(subject);
			}
			subs.signal.subscribe(() => {
				if (--refCount === 0) subject.signal.next();
			});
		});
	};
}

/**
 * The `share` operator enables multiple subscribers to share a single subscription to the provided Observable.
 */
export function share<T>(): Operator<T, T> {
	return (source: Observable<T>) => {
		let subject: Reference<T>;
		let subscriptionCount = 0;

		function complete() {
			if (--subscriptionCount === 0) subject.signal.next();
		}

		return observable<T>(subs => {
			subs.signal.subscribe(complete);
			if (subscriptionCount++ === 0) {
				subject = ref<T>();
				subject.subscribe(subs);
				source.subscribe(subject);
			} else subject.subscribe(subs);
		});
	};
}

/**
 * Returns an observable that shares a single subscription to the underlying sequence containing only the last notification.
 */
export function publishLast<T>(): Operator<T, T> {
	return (source: Observable<T>) => {
		const subject = new Subject<T>();
		let sourceSubscription: Subscription | undefined;
		let lastValue: T;
		let hasEmitted = false;
		let ready = false;

		return observable<T>(subs => {
			if (ready) {
				subs.next(lastValue);
				subs.complete();
			} else subject.subscribe(subs);

			sourceSubscription ??= source.subscribe({
				next: val => {
					hasEmitted = true;
					lastValue = val;
				},
				error: subs.error,
				complete() {
					ready = true;
					if (hasEmitted) subject.next(lastValue);
					subject.complete();
				},
				signal: subs.signal,
			});
		});
	};
}

/**
 * Creates an output Observable which concurrently emits all values from every given input Observable.
 */
export function merge<R extends Observable<unknown>[]>(
	...observables: R
): CombineResult<R> {
	if (observables.length === 1) return observables[0] as CombineResult<R>;

	return new Observable(subs => {
		let refCount = observables.length;
		for (const o of observables)
			if (!subs.closed)
				o.subscribe({
					next: subs.next,
					error: subs.error,
					complete() {
						if (refCount-- === 1) subs.complete();
					},
					signal: subs.signal,
				});
	}) as CombineResult<R>;
}

/**
 * Combines multiple Observables to create an Observable whose values are calculated from the values, in order, of each of its input Observables.
 */
export function zip<T extends Observable<unknown>[]>(
	...observables: T
): Observable<PickObservable<T>> {
	return observables.length === 0
		? EMPTY
		: (new Observable<unknown>(subs => {
				const buffer: (unknown[] | undefined)[] = new Array(
					observables.length,
				);

				function flush() {
					let hasNext = true;
					while (hasNext) {
						for (const bucket of buffer) {
							if (!bucket || bucket.length === 0) hasNext = false;
							else if (bucket[0] === Terminator)
								return subs.complete();
						}
						if (hasNext) subs.next(buffer.map(b => b?.shift()));
					}
				}
				observables.forEach((o, id) => {
					const bucket: unknown[] = (buffer[id] = []);
					o.subscribe({
						next(val) {
							bucket.push(val);
							flush();
						},
						error: subs.error,
						complete() {
							bucket.push(Terminator);
							flush();
						},
						signal: subs.signal,
					});
				});
		  }) as Observable<PickObservable<T>>);
}

/**
 * Combines multiple Observables to create an Observable whose values are calculated from the
 * latest values of each of its input Observables.
 */
export function combineLatest<T extends Observable<unknown>[]>(
	...observables: T
): Observable<PickObservable<T>> {
	return observables.length === 0
		? EMPTY
		: new Observable<PickObservable<T>>(subs => {
				let len = observables.length;
				const initialLen = len;
				let emittedCount = 0;
				let ready = false;
				const emitted: boolean[] = new Array(len);
				const last = new Array(len);

				observables.forEach((o, id) =>
					o.subscribe({
						next(val) {
							last[id] = val;
							if (!emitted[id]) {
								emitted[id] = true;
								if (++emittedCount >= initialLen) ready = true;
							}
							if (ready)
								subs.next(last.slice(0) as PickObservable<T>);
						},
						error: subs.error,
						complete() {
							if (--len <= 0) subs.complete();
						},
						signal: subs.signal,
					}),
				);
		  });
}

/**
 * Returns an Observable that mirrors the source Observable, but will call a
 * specified function when the source terminates on complete or error.
 */
export function finalize<T>(unsubscribe: () => void): Operator<T, T> {
	return operator<T, T>((subscriber: Subscriber<T>) => ({
		next: subscriber.next,
		unsubscribe,
	}));
}

export function ignoreElements() {
	return filter(() => false) as Operator<unknown, never>;
}

/**
 * Creates an Observable that emits no items to the Observer and immediately emits an error notification.
 */
export function throwError(error: unknown) {
	return new Observable<never>(subs => subs.error(error));
}

/**
 * An observable that completes on subscription.
 */
export const EMPTY = new Observable<never>(subs => subs.complete());

/**
 * Creates a new Behavior Subject.
 */
export function be<T>(initialValue: T) {
	return new BehaviorSubject(initialValue);
}

/**
 * Creates a new Observable
 */
export function observable<T>(subscribe: SubscribeFunction<T>) {
	return new Observable<T>(subscribe);
}

/**
 * Creates a new Subject
 */
export function subject<T>() {
	return new Subject<T>();
}

/**
 * Creates a new Reference object. A reference is a Behavior Subject that does not require an initial value.
 */
export function ref<T>() {
	return new Reference<T>();
}

export const operators = {
	catchError,
	debounceTime,
	distinctUntilChanged,
	exhaustMap,
	filter,
	finalize,
	first,
	ignoreElements,
	map,
	mergeMap,
	publishLast,
	reduce,
	select,
	share,
	shareLatest,
	switchMap,
	take,
	takeWhile,
	tap,
	throttleTime,
} as const;

for (const p in operators) {
	Observable.prototype[p as keyof typeof operators] = function (
		this: Observable<unknown>,
		...args: unknown[]
	) {
		/* eslint-disable-next-line @typescript-eslint/no-unsafe-argument, @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access */
		return this.pipe((operators as any)[p](...args));
		/* eslint-disable-next-line @typescript-eslint/no-explicit-any */
	} as any;
}

export interface Observable<T> {
	catchError<T2 extends T | never>(
		selector: (
			err: unknown,
			source: Observable<T>,
		) => Observable<T2> | void,
	): Observable<T>;
	debounceTime(
		time?: number,
		timer?: (delay: number) => Observable<void>,
	): Observable<T>;
	distinctUntilChanged(): Observable<T>;
	exhaustMap<T2>(project: (value: T) => ObservableInput<T2>): Observable<T2>;
	filter<T2 = T>(fn: (val: T) => boolean): Observable<T2>;
	finalize(fn: () => void): Observable<T>;
	first(): Observable<T>;
	map<T2>(mapFn: (val: T) => T2): Observable<T2>;
	mergeMap<T2>(project: (val: T) => ObservableInput<T2>): Observable<T2>;
	publishLast(): Observable<T>;
	reduce<T2>(
		reduceFn: (acc: T2, val: T, i: number) => T2,
		seed: T2,
	): Observable<T2>;
	share(): Observable<T>;
	shareLatest(): Observable<T>;
	switchMap<T2>(project: (val: T) => Observable<T2>): Observable<T2>;
	switchMap<T2, T3>(
		project: (val: T) => Observable<T2> | Promise<T3>,
	): Observable<T2 | T3>;
	switchMap<T2>(project: (val: T) => Promise<T2>): Observable<T2>;
	//switchMap<T2>(project: (val: T) => ObservableInput<T2>): Observable<T2>;
	take(howMany: number): Observable<T>;
	takeWhile(fn: (val: T) => boolean): Observable<T>;
	tap(tapFn: (val: T) => void): Observable<T>;
	ignoreElements(): Observable<never>;
	throttleTime(number: number): Observable<T>;
	select<T2>(mapFn: (val: T) => T2): Observable<T2>;
}
