import { cold, expectLog, logEvents, replaceValues } from './util.js';
import { be, concat, defer, observable, of } from '../index.js';
import { spec } from '../../spec/index.js';

export default spec('switchMap', it => {
	it.should('map-and-flatten each item to an Observable', a => {
		const e1 = cold('--1-----3--5-------|');
		const e1subs = '^                  !';
		const e2 = cold('x-x-x|              ', { x: '10' });
		const values = { x: '10', y: '30', z: '50' };
		const expected = replaceValues('--x-x-x-y-yz-z-z---|', values);
		const result = e1.switchMap(x => e2.map(i => +i * +x));

		expectLog(a, result, expected);
		a.equal(e1.subscriptions, e1subs);
	});
	it.should('handle outer throw', a => {
		const x = cold('--a--b--c--|');
		const e1 = cold('#');
		logEvents(e1.switchMap(() => x)).then(({ events }) => {
			a.equal(events, '#');
		});
	});

	it.should('handle outer empty', a => {
		const x = cold('--a--b--c--|');
		const e1 = cold('|');
		logEvents(e1.switchMap(() => x)).then(result => {
			a.equal(result.events, '|');
		});
	});

	it.should('raise error if project throws', a => {
		const e1 = cold('---x|');
		const result = e1.switchMap(() => {
			throw 'error';
		});
		logEvents(result).then(({ events }) => {
			a.equal(events, '---#');
		});
	});

	it.should('unsub inner observables', a => {
		const unsubbed: string[] = [];

		of('a', 'b')
			.switchMap(x =>
				observable(subscriber => {
					subscriber.complete();
					subscriber.signal.subscribe(() => unsubbed.push(x));
				}),
			)
			.subscribe();

		a.equalValues(unsubbed, ['a', 'b']);
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

			of(null)
				.switchMap(() => synchronousObservable)
				.takeWhile(x => x != 2)
				.subscribe();

			a.equalValues(sideEffects, [1, 2]);
		},
	);

	it.should('switch inner cold observables, inner never completes', a => {
		const x = cold('--a--b--c--d--e--|');
		const xsubs = '         ^         !';
		const y = cold('---f---g---h---i--');
		const ysubs = '                   ^';
		const e1 = cold('---------x---------y---------|');
		const e1subs = '^                            !';
		const expected = '-----------a--b--c----f---g---h---i--';
		const result = e1.switchMap(value => (value === 'x' ? x : y));

		expectLog(a, result, expected);
		a.equal(x.subscriptions, xsubs);
		a.equal(y.subscriptions, ysubs);
		a.equal(e1.subscriptions, e1subs);
	});

	it.should(
		'handle a synchronous switch to the second inner observable',
		a => {
			const x = cold('--a--b--c--d--e--|');
			const xsubs = '         (^!)';
			const y = cold('---f---g---h---i--|');
			const ysubs = '         ^                 !';
			const e1 = cold('---------(xy)----------------|');
			const e1subs = '^                         !';
			const expected = '------------f---g---h---i--|';

			const result = e1.switchMap(value => (value === 'x' ? x : y));

			expectLog(a, result, expected);
			a.equal(x.subscriptions, xsubs);
			a.equal(y.subscriptions, ysubs);
			a.equal(e1.subscriptions, e1subs);
		},
	);

	it.should('handle multiple subscriptions', a => {
		let emitted = 0;
		const done = a.async();
		const source = be(1);
		const o1 = source.debounceTime(0).switchMap(val => of(val));

		o1.subscribe(val => {
			a.equal(val, 1);
			if (++emitted === 3) done();
		});
		o1.subscribe(val => {
			a.equal(val, 1);
			if (++emitted === 3) done();
		});
		o1.subscribe(val => {
			a.equal(val, 1);
			if (++emitted === 3) done();
		});
	});

	/*it.should(
		'unsubscribe previous inner sub when getting synchronously reentrance during subscribing the inner sub',
		a => {
			const e = be(1);
			const results: Array<number> = [];

			e.take(3)
				.switchMap(value =>
					observable<number>(subscriber => {
						e.next(value + 1);
						subscriber.next(value);
					})
				)
				.subscribe(value => results.push(value));
			a.equalValues(results, [3]);
		}
	);*/
});
