import { cold, expectLog } from './util.js';
import {
	be,
	EMPTY,
	catchError,
	concat,
	defer,
	observable,
	of,
	map,
	merge,
	take,
	takeWhile,
	throwError,
	cancel,
} from '../index.js';
import { spec } from '@cxl/spec';

export default spec('catchError', it => {
	it.should('catch error and replace with a cold Observable', a => {
		const e1 = cold('--a--b--#       ');
		const e2 = cold('-1-2-3-|');
		const expected = '--a--b---1-2-3-|';

		const result = e1.pipe(catchError((_err: unknown) => e2));

		expectLog(a, result, expected);
	});

	it.should('catch error and replace it', a => {
		const e1 = cold('--a--b--c--------|');
		const subs = '^       !';
		const expected = '--a--b--(XYZ|)';

		const result = e1
			.map((n: string) => {
				if (n === 'c') {
					throw 'bad';
				}
				return n;
			})
			.catchError(_err => {
				return of('X', 'Y', 'Z');
			});
		expectLog(a, result, expected);
		a.equal(e1.subscriptions, subs);
	});

	it.should(
		'stop listening to a synchronous observable when unsubscribed',
		a => {
			const sideEffects: number[] = [];
			const synchronousObservable = concat(
				defer(() => {
					sideEffects.push(1);
					return of(1);
				}),
				defer(() => {
					sideEffects.push(2);
					return of(2);
				}),
				defer(() => {
					sideEffects.push(3);
					return of(3);
				}),
			);

			merge(of(10), throwError(new Error('Some error')))
				.pipe(
					catchError(() => synchronousObservable),
					takeWhile(x => x != 2), // unsubscribe at the second side-effect
				)
				.subscribe();

			a.equalValues(sideEffects, [1, 2]);
		},
	);

	it.should(
		'properly handle async handled result if source is synchronous',
		a => {
			const done = a.async();
			const source = observable<string>(observer => {
				observer.error(new Error('kaboom!'));
				observer.complete();
			});

			const sourceWithDelay = observable<string>(observer => {
				observer.next('delayed');
				observer.complete();
			}).debounceTime(0);

			const values: string[] = [];
			source.pipe(catchError(() => sourceWithDelay)).subscribe({
				next: value => values.push(value),
				error: done,
				complete: () => {
					a.equalValues(values, ['delayed']);
					done();
				},
			});
		},
	);

	it.should(
		'catch and allow the cold observable to be repeated with the third ' +
			'(caught) argument',
		a => {
			const e1 = cold('--a--b--c--------|       ');
			const subs = '^       (^!)       (!^)       !';
			const expected = '--a--b----a--b----a--b--#';

			let retries = 0;
			const result = e1.pipe(
				map(n => {
					if (n === 'c') {
						throw 'bad';
					}
					return n;
				}),
				catchError((_, caught) => {
					if (retries++ === 2) {
						throw 'done';
					}
					return caught;
				}),
			);

			expectLog(a, result, expected);
			a.equal(e1.subscriptions, subs);
		},
	);

	it.should('catch and replace a Observable.throw() as the source', a => {
		const e1 = cold('#');
		const subs = '(^!)';
		const expected = '(abc|)';

		const result = e1.pipe(catchError(_ => of('a', 'b', 'c')));

		expectLog(a, result, expected);
		a.equal(e1.subscriptions, subs);
	});

	it.should('mirror the source if it does not raise errors', a => {
		const e1 = cold('--a--b--c--|');
		const subs = '^          !';
		const expected = '--a--b--c--|';

		const result = e1.pipe(catchError(_ => of('x', 'y', 'z')));

		expectLog(a, result, expected);
		a.equal(e1.subscriptions, subs);
	});

	it.should(
		'properly handle async handled result if source is synchronous',
		a => {
			const done = a.async();
			const source = observable<string>(observer => {
				observer.error(new Error('kaboom!'));
				observer.complete();
			});

			const sourceWithDelay = observable<string>(observer => {
				observer.next('delayed');
				observer.complete();
			}).debounceTime(0);

			const values: string[] = [];
			source.pipe(catchError(_ => sourceWithDelay)).subscribe({
				next: value => values.push(value),
				error: e => {
					throw e;
				},
				complete: () => {
					a.equalValues(values, ['delayed']);
					done();
				},
			});
		},
	);

	it.should(
		'should stop listening to a synchronous observable when unsubscribed',
		a => {
			const sideEffects: number[] = [];
			const synchronousObservable = observable(subscriber => {
				// This will check to see if the subscriber was closed on each loop
				// when the unsubscribe hits (from the `take`), it should be closed
				for (let i = 0; !subscriber.closed && i < 10; i++) {
					sideEffects.push(i);
					subscriber.next(i);
				}
			});

			synchronousObservable
				.catchError(() => EMPTY)
				.take(3)
				.subscribe(() => {
					/* noop */
				});

			a.equalValues(sideEffects, [0, 1, 2]);
		},
	);

	it.should('complete if you return Observable.empty()', a => {
		const e1 = cold('--a--b--#');
		const e1subs = '^       !';
		const e2 = cold('|');
		const e2subs = '        (^!)';
		const expected = '--a--b--|';

		const result = e1.pipe(catchError(() => e2));

		expectLog(a, result, expected);
		a.equal(e1.subscriptions, e1subs);
		a.equal(e2.subscriptions, e2subs);
	});

	it.should(
		'stop listening to a synchronous observable when unsubscribed',
		a => {
			const sideEffects: number[] = [];
			const synchronousObservable = observable<number>(subscriber => {
				// This will check to see if the subscriber was closed on each loop
				// when the unsubscribe hits (from the `take`), it should be closed
				for (let i = 0; !subscriber.closed && i < 10; i++) {
					sideEffects.push(i);
					subscriber.next(i);
				}
			});

			synchronousObservable
				.pipe(
					catchError(() => EMPTY),
					take(3),
				)
				.subscribe(() => {
					/* noop */
				});

			a.equalValues(sideEffects, [0, 1, 2]);
		},
	);

	it.should('unsubscribe from all observables', a => {
		const done = a.async();
		const obs = merge(
			concat(of(0).debounceTime(0), throwError('Error')),
			of(2).debounceTime(10),
		).catchError(e => {
			a.equal(e, 'Error');
			return be(1);
		});
		let i = 0;
		const subs = obs.subscribe(() => {
			if (++i > 1) {
				subs.unsubscribe();
				done();
			}
		});
	});

	it.should('should not handle error if subscriber is already closed', a => {
		const sideEffects: number[] = [];

		const source = observable<number>(subscriber => {
			subscriber.next(1);
			subscriber.error(new Error('Test Error'));
			subscriber.complete();
		});

		const signal = cancel();
		const result = source.pipe(
			catchError(() => {
				// Unsubscribe to close subscriber
				signal.next();
				return of(2);
			}),
		);

		result.subscribe({ next: n => sideEffects.push(n), signal });

		// Ensure the side effect in catchError isn't triggered
		a.equalValues(sideEffects, [1]);
	});

	it.should('should return early if subscriber is closed', a => {
		const source = observable<number>(subscriber => {
			subscriber.next(1);
			subscriber.next(2);
			subscriber.complete();
		});

		const result = source.pipe(
			map(x => x * 2),
			catchError(() => of(0)),
		);

		result.subscribe({
			next: value => a.ok(value >= 0),
			error: _ => {
				throw 'Should not reach here';
			},
		});
	});
});
