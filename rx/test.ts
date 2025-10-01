import {
	Observable,
	Reference,
	ReplaySubject,
	Subscriber,
	be,
	filter,
	first,
	map,
	observable,
	of,
	operators,
	pipe,
	ref,
	tap,
	toPromise,
} from './index.js';
import combineLatestSuite from './test/combineLatest.js';
import catchErrorSuite from './test/catchError.js';
import concatSuite from './test/concat.js';
import debounceTimeSuite from './test/debounceTime.js';
import deferSuite from './test/defer.js';
import distinctUntilChangedSuite from './test/distinctUntilChanged.js';
import exhaustMapSuite from './test/exhaustMap.js';
import filterSuite from './test/filter.js';
import fromSuite from './test/from.js';
import mergeSuite from './test/merge.js';
import switchMapSuite from './test/switchMap.js';
import reduceSuite from './test/reduce.js';
import mergeMapSuite from './test/mergeMap.js';
import takeSuite from './test/take.js';
import publishLast from './test/publishLast.js';
import finalizeSuite from './test/finalize.js';
import zipSuite from './test/zip.js';
import shareSuite from './test/share.js';
import subjectSuite from './test/subject.js';
import orderedSubjectSuite from './test/orderedSubject.js';
import debounceFunctionSuite from './test/debounceFunction.js';
import intervalSuite from './test/interval.js';
import firstSuite from './test/first.js';
import ignoreElementsSuite from './test/ignoreElements.js';

import { TestApi, spec } from '../spec/index.js';

declare function setInterval(fn: () => void, interval?: number): number;
declare function clearInterval(intervalId: number): void;
declare const setTimeout: (fn: () => unknown, n?: number) => number;

function empty() {
	return new Observable<void>(subs => subs.complete());
}

function throwError(msg: string) {
	return new Observable<void>(subs => subs.error(msg));
}

export default spec('rx', suite => {
	[
		catchErrorSuite,
		deferSuite,
		debounceFunctionSuite,
		distinctUntilChangedSuite,
		filterSuite,
		finalizeSuite,
		firstSuite,
		fromSuite,
		exhaustMapSuite,
		mergeSuite,
		mergeMapSuite,
		orderedSubjectSuite,
		intervalSuite,
		concatSuite,
		combineLatestSuite,
		debounceTimeSuite,
		reduceSuite,
		ignoreElementsSuite,
		shareSuite,
		switchMapSuite,
		takeSuite,
		publishLast,
		zipSuite,
		subjectSuite,
		spec('Observable', s => {
			const test = s.test.bind(s);

			test('constructor', a => {
				const observable = new Observable(function subscribe(observer) {
						observer.next(1);
						observer.next(2);
						observer.next(3);
						observer.complete();
					}),
					done = a.async();
				let i = 1;
				observable.subscribe({
					next(b) {
						a.equal(b, i++);
					},
					complete: done,
				});
			});

			test(
				'should accept an anonymous observer with just a next function and call the next function in the context' +
					' of the anonymous observer',
				a => {
					//intentionally not using lambda to avoid typescript's this context capture
					const o = {
						myValue: 'foo',
						next(x: number) {
							a.equal(this.myValue, 'foo');
							a.equal(x, 1);
						},
					};

					of(1).subscribe(o);
				},
			);
			test(
				'should accept an anonymous observer with just an error function and call the error function in the context' +
					' of the anonymous observer',
				a => {
					//intentionally not using lambda to avoid typescript's this context capture
					const o = {
						myValue: 'foo',
						error(err: unknown) {
							a.equal(this.myValue, 'foo');
							a.equal(err, 'bad');
						},
					};

					throwError('bad').subscribe(o);
				},
			);

			test(
				'should accept an anonymous observer with just a complete function and call the complete function in the' +
					' context of the anonymous observer',
				a => {
					//intentionally not using lambda to avoid typescript's this context capture
					const o = {
						myValue: 'foo',
						complete: function complete() {
							a.equal(this.myValue, 'foo');
						},
					};

					empty().subscribe(o);
				},
			);

			test('should send errors thrown in the constructor down the error path', (a: TestApi) => {
				new Observable<number>(() => {
					throw new Error('this should be handled');
				}).subscribe({
					error(err) {
						a.ok(err);
						a.assert(err instanceof Error);
						a.equal(err.message, 'this should be handled');
					},
				});
			});

			test('should be thenable', async a => {
				const res = await of(10);
				a.equal(res, 10);
			});

			test('should allow chaining operators', a => {
				const results: number[] = [];
				of(1, 2, 3)
					.pipe(
						map(x => x * 2),
						filter(x => x > 2),
						tap(x => results.push(x)),
					)
					.subscribe({
						complete() {
							a.equalValues(results, [4, 6]);
						},
					});
			});

			test('should handle errors with Partial Observers', a => {
				const o = {
					myValue: 'bar',
					next() {
						a.equal(this.myValue, 'bar');
					},
					error(err: unknown) {
						a.equal(this.myValue, 'bar');
						a.equal(err, 'error occurred');
					},
					complete() {
						a.equal(this.myValue, 'bar');
					},
				};

				const observable = new Observable(subscriber => {
					subscriber.error('error occurred');
				});

				observable.subscribe(o);
			});

			test('Cold Observable Behavior', a => {
				const done = a.async();
				const coldObservable = new Observable<string>(observer => {
					observer.next('value1');
					observer.next('value2');
					setTimeout(() => {
						observer.next('value3');
						observer.complete();
					}, 100);
				});

				const results: string[] = [];
				coldObservable.subscribe({
					next(value) {
						results.push(value);
					},
					complete() {
						a.equalValues(results, ['value1', 'value2', 'value3']);
						done();
					},
				});
			});
		}),

		spec('Observable#subscribe', s => {
			const test = s.test.bind(s);
			test('should be synchronous', a => {
				let subscribed = false;
				let nexted: string;
				let completed: boolean;
				const source = new Observable<string>(observer => {
					subscribed = true;
					observer.next('wee');
					a.equal(nexted, 'wee');
					observer.complete();
					a.ok(completed);
				});

				a.ok(!subscribed);

				let mutatedByNext = false;
				let mutatedByComplete = false;

				source.subscribe({
					next(x) {
						nexted = x;
						mutatedByNext = true;
					},
					complete() {
						completed = true;
						mutatedByComplete = true;
					},
				});

				a.ok(mutatedByNext);
				a.ok(mutatedByComplete);
			});

			test('should work when subscribe is called with no arguments', a => {
				const source = new Observable<string>(subscriber => {
					subscriber.next('foo');
					subscriber.complete();
					a.ok(subscriber);
				});

				source.subscribe();
			});

			test('should return a Subscription that calls the unsubscribe function returned by the subscriber', a => {
				let unsubscribeCalled = false;

				const source = new Observable<number>(({ signal }) => {
					signal.subscribe(() => (unsubscribeCalled = true));
				});

				const sub = source.subscribe(() => {
					//noop
				});
				a.equal(unsubscribeCalled, false);
				a.equal(typeof sub.unsubscribe, 'function');
				sub.unsubscribe();
				a.ok(unsubscribeCalled);
			});

			test('should ignore next messages after unsubscription', a => {
				let times = 0;

				const subscription = new Observable<number>(observer => {
					let i = 0;
					const done = a.async();
					const id = setInterval(() => observer.next(i++));
					observer.signal.subscribe(() => {
						clearInterval(id);
						a.equal(times, 2);
						done();
					});
				})
					.pipe(tap(() => (times += 1)))
					.subscribe(function () {
						if (times === 2) {
							subscription.unsubscribe();
						}
					});
			});

			test('should ignore error messages after unsubscription', a => {
				let times = 0;
				let errorCalled = false;
				const done = a.async();

				const subscription = new Observable<number>(observer => {
					let i = 0;
					const id = setInterval(() => {
						observer.next(i++);
						if (i === 3) {
							observer.error(new Error());
						}
					});

					observer.signal.subscribe(() => {
						clearInterval(id);
						a.equal(times, 2);
						a.ok(!errorCalled);
						done();
					});
				})
					.pipe(tap(() => (times += 1)))
					.subscribe({
						next() {
							if (times === 2) {
								subscription.unsubscribe();
							}
						},
						error() {
							errorCalled = true;
						},
					});
			});

			test('should ignore complete messages after unsubscription', a => {
				let times = 0;
				let completeCalled = false;

				const done = a.async();
				const subscription = new Observable<number>(observer => {
					let i = 0;
					const id = setInterval(() => {
						observer.next(i++);
						if (i === 3) {
							observer.complete();
						}
					});
					observer.signal.subscribe(() => {
						clearInterval(id);
						a.equal(times, 2);
						a.ok(!completeCalled);
						done();
					});
				})
					.pipe(tap(() => (times += 1)))
					.subscribe({
						next() {
							if (times === 2) {
								subscription.unsubscribe();
							}
						},
						complete() {
							completeCalled = true;
						},
					});
			});

			test('should not be unsubscribed when other empty subscription completes', a => {
				let unsubscribeCalled = false;
				const source = new Observable<number>(({ signal }) => {
					signal.subscribe(() => {
						unsubscribeCalled = true;
					});
				});

				source.subscribe();
				a.ok(!unsubscribeCalled);
				empty().subscribe();
				a.ok(!unsubscribeCalled);
			});

			test('should not be unsubscribed when other subscription with same observer completes', a => {
				let unsubscribeCalled = false;
				const source = new Observable<number>(observer => {
					observer.signal.subscribe(() => {
						unsubscribeCalled = true;
					});
				});

				const observer = {};

				source.subscribe(observer);

				a.ok(!unsubscribeCalled);

				empty().subscribe(observer);

				a.ok(!unsubscribeCalled);
			});
		}),

		spec('Observable#pipe', s => {
			const test = s.test.bind(s);
			test('should pipe multiple operations', a => {
				let nextCalled = false;

				of('test')
					.pipe(
						map(x => x + x),
						map(x => x + '!!!'),
					)
					.subscribe({
						next(x) {
							nextCalled = true;
							a.equal(x, 'testtest!!!');
						},
						complete() {
							a.ok(nextCalled);
						},
					});
			});

			test('should forward errors', (a: TestApi) => {
				let errorCalled = false;

				of('test')
					.pipe(
						map(() => {
							throw new Error('hi');
						}),
						map(x => x + '!!!'),
					)
					.subscribe({
						error(e) {
							errorCalled = true;
							a.assert(e instanceof Error);
							a.equal(e.message, 'hi');
						},
						complete() {
							a.ok(errorCalled);
						},
					});
			});
		}),

		spec('Observable#unsubscribe()', s => {
			s.test('Observable#subscribe - unsubscribe', function (a) {
				const obs = new Observable(function (o) {
					o.next(0);
					o.next(0);
					o.complete();
				});
				let complete,
					times = 0;
				obs.subscribe({
					next: function () {
						times++;
					},
					complete: function () {
						complete = true;
					},
				});

				a.equal(times, 2);
				a.ok(complete);
			});
		}),

		spec('Observable - Error Propagation', s => {
			s.test('Unhandled Error', a => {
				try {
					throwError('error').subscribe();
				} catch (e) {
					a.equal(e, 'error');
				}
			});
		}),

		spec('toPromise', s => {
			s.test('rx#toPromise', a => {
				const done = a.async(),
					A = new Observable(s => {
						s.next('hello');
						s.complete();
					}),
					B = new Observable(s => s.error(true)),
					promise = toPromise(A);

				promise.then(val => a.equal(val, 'hello'));

				toPromise(B).catch(e => {
					a.equal(e, true);
					done();
				});
			});
		}),

		spec('BehaviorSubject', s => {
			s.test('BehaviorSubject#constructor', function (a) {
				let c = 1;
				const A = be(c);
				A.subscribe(val => a.equal(val, c));
				c++;
				A.next(c);
				a.equal(A.value, c);
			});
		}),

		spec('Reference', s => {
			s.test('Reference', a => {
				const ref = new Reference<boolean>();
				const done = a.async();

				a.ok(!ref.hasValue);
				ref.subscribe(val => a.equal(val, true));
				ref.next(true);
				a.ok(ref.hasValue);
				ref.subscribe(val => {
					a.ok(val);
					done();
				});
				ref.complete();
			});

			s.test('should throw if not initialized', a => {
				const r = ref<boolean>();
				a.throws(() => r.value);
				r.next(true);
				a.equal(r.value, true);
			});
		}),

		spec('pipe', a => {
			a.test('support for multiple operators', a => {
				const v1 = be(1);
				const p1 = pipe(
					first(),
					filter<number>(v => !!v),
					tap(a => v1.next(a)),
				);
				of(2).pipe(p1).subscribe();
				a.equal(v1.value, 2);
			});
		}),

		spec('Subscriber', it => {
			it.should(
				'unsubscribe from synchronous parent after complete',
				a => {
					const done = a.async();
					of(1, 2, 3, 4)
						.takeWhile(val => val !== 3)
						.tap(val => {
							if (val === 4) throw new Error('should not fire 4');
						})
						.subscribe(val => {
							if (val > 1) {
								a.equal(val, 2);
								done();
							}
						});
				},
			);
			it.should('ignore next messages after unsubscription', a => {
				let times = 0;

				const sub = Subscriber(
					{
						next() {
							times += 1;
						},
					},
					() => {},
				);

				sub.next(0);
				sub.next(0);
				sub.unsubscribe();
				sub.next(0);

				a.equal(times, 2);
			});

			it.should('ignore complete messages after unsubscription', a => {
				let times = 0;
				let completeCalled = false;

				const sub = Subscriber(
					{
						next() {
							times += 1;
						},
						complete() {
							completeCalled = true;
						},
					},
					() => {},
				);

				sub.next(0);
				sub.next(0);
				sub.unsubscribe();
				sub.next(0);
				sub.complete();

				a.equal(times, 2);
				a.ok(!completeCalled);
			});

			it.should(
				'not be closed when other subscriber with same observer instance completes',
				a => {
					const observer = {
						next() {
							/*noop*/
						},
					};

					const sub1 = Subscriber(observer, () => {});
					const sub2 = Subscriber(observer, () => {});

					sub2.complete();

					a.ok(!sub1.closed);
					a.ok(sub2.closed);
				},
			);

			it.should('call complete observer without any arguments', a => {
				let argument: unknown[] | undefined;

				const observer = {
					complete: (...args: unknown[]) => {
						argument = args;
					},
				};

				const sub1 = Subscriber(observer, () => {});
				sub1.complete();

				a.equal(argument?.length, 0);
			});

			it.should('NOT break this context on next methods', a => {
				// This is a contrived class to illustrate that we can pass another
				// object that is "observer shaped" and not have it lose its context
				// as it would have in v5 - v6.
				class CustomConsumer {
					valuesProcessed: string[] = [];

					// In here, we access instance state and alter it.
					next(value: string) {
						if (value === 'reset') {
							this.valuesProcessed = [];
						} else {
							this.valuesProcessed.push(value);
						}
					}
				}

				const consumer = new CustomConsumer();

				of('old', 'old', 'reset', 'new', 'new').subscribe(consumer);

				a.equalValues(consumer.valuesProcessed, ['new', 'new']);
			});
		}),

		spec('ReplaySubject', a => {
			a.should('add the observer before running subscription code', a => {
				const subject = new ReplaySubject<number>();
				subject.next(1);
				const results: number[] = [];

				subject.subscribe(value => {
					results.push(value);
					if (value < 3) {
						subject.next(value + 1);
					}
				});

				a.equal(results[0], 1);
				a.equal(results[1], 2);
				a.equal(results[2], 3);
			});

			a.should('replay values upon subscription', a => {
				const done = a.async();
				const subject = new ReplaySubject<number>();
				const expects = [1, 2, 3];
				let i = 0;
				subject.next(1);
				subject.next(2);
				subject.next(3);
				subject.subscribe({
					next(x: number) {
						a.equal(x, expects[i++]);
						if (i === 3) {
							subject.complete();
						}
					},
					error() {
						throw new Error('should not be called');
					},
					complete() {
						done();
					},
				});
			});

			a.should('replay values and complete', a => {
				const done = a.async();
				const subject = new ReplaySubject<number>();
				const expects = [1, 2, 3];
				let i = 0;
				subject.next(1);
				subject.next(2);
				subject.next(3);
				subject.complete();
				subject.subscribe({
					next: (x: number) => {
						a.equal(x, expects[i++]);
					},
					complete: done,
				});
			});

			a.should('replay values and error', a => {
				const done = a.async();
				const subject = new ReplaySubject<number>();
				const expects = [1, 2, 3];
				let i = 0;
				subject.next(1);
				subject.next(2);
				subject.next(3);
				subject.error('fooey');
				subject.subscribe({
					next: (x: number) => {
						a.equal(x, expects[i++]);
					},
					error: err => {
						a.equal(err, 'fooey');
						done();
					},
				});
			});

			a.should('only replay values within its buffer size', a => {
				const done = a.async();
				const subject = new ReplaySubject<number>(2);
				const expects = [2, 3];
				let i = 0;
				subject.next(1);
				subject.next(2);
				subject.next(3);
				subject.subscribe({
					next: (x: number) => {
						a.equal(x, expects[i++]);
						if (i === 2) {
							subject.complete();
						}
					},
					error: () => {
						throw new Error('should not be called');
					},
					complete() {
						done();
					},
				});
			});

			a.should(
				'Confirm late subscribers receive buffered but not emitted values',
				a => {
					const subject = new ReplaySubject<number>(2);
					const expectedBufferedValues = [2, 3, 2, 3, 4];
					const bufferedValues: number[] = [];
					const emittedValues: number[] = [];

					// Emit values before late subscription
					subject.next(1);
					subject.next(2);
					subject.next(3);

					// Late subscription observing buffered values
					subject.subscribe(value => bufferedValues.push(value));
					bufferedValues.forEach(value => subject.next(value));

					// Ensure new emitted values are received after late subscription
					subject.next(4);
					subject.subscribe(value => emittedValues.push(value));

					// Validate outcomes
					a.equalValues(bufferedValues, expectedBufferedValues);
					a.equalValues(emittedValues, [3, 4]);
				},
			);
		}),

		spec('operators', they => {
			they.should('be defined in the prototype of Observable', a => {
				for (const op in operators)
					a.ok(Observable.prototype[op as keyof typeof operators]);
			});

			they.should('unsubscribe from source on complete', a => {
				let wasCalled = 0;

				const source = observable(subs => {
					subs.complete();
					subs.signal.subscribe(() => wasCalled++);
				});
				const obs = source.switchMap(s => of(s));
				obs.subscribe();
				a.equal(wasCalled, 1);
			});
		}),
	].forEach(t => suite.addSpec(t));
});
