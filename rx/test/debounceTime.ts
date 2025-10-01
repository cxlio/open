import {
	catchError,
	debounceTime,
	observable,
	of,
	from,
	merge,
	tap,
	throwError,
	toPromise,
} from '../index.js';
import { spec } from '../../spec/index.js';

declare const setTimeout: (fn: () => unknown, n?: number) => number;
declare const clearTimeout: (n: number) => void;

export default spec('debounceTime', it => {
	it.should('debounce time asynchronously', async a => {
		let fired = 0;
		const promise = toPromise(
			from([1, 2, 3]).pipe(
				debounceTime(5),
				tap(() => fired++),
			),
		);
		a.equal(fired, 0);
		await promise;
		a.equal(fired, 1);
	});

	it.should('cancel timeout if error', async a => {
		let fired = 0;
		const promise = merge(of(1), throwError(0))
			.debounceTime(5)
			.tap(() => fired++)
			.catchError(e => of((fired = e as number)));
		a.equal(fired, 0);
		await promise;
		a.equal(fired, 0);
	});

	it.should('complete if empty', async a => {
		let fired = 0;
		await from([])
			.debounceTime(0)
			.tap(() => fired++);
		a.equal(fired, 0);
	});

	it.should('propagate errors', a => {
		let fired = false;
		merge(of(), throwError(true))
			.pipe(
				debounceTime(0),
				catchError(e => of((fired = e as boolean))),
			)
			.subscribe();
		a.equal(fired, true);
	});

	it.should('cancel on unsubscribe', a => {
		const done = a.async();
		let timeoutCleared = 0;

		function timer(delay: number) {
			return observable<void>(subscriber => {
				const to = setTimeout(() => {
					subscriber.next();
					subscriber.complete();
				}, delay);

				subscriber.signal.subscribe(() => {
					timeoutCleared++;
					clearTimeout(to);
				});
			});
		}

		const obs = of(1, 2, 3)
			.debounceTime(0, timer)
			.tap(() => {
				throw new Error('Should not run');
			});
		const obs2 = of(0)
			.debounceTime(5)
			.tap(() => {
				a.equal(timeoutCleared, 3);
				done();
			});
		obs.subscribe({ complete: () => timeoutCleared++ }).unsubscribe();
		obs2.subscribe();
	});
});
