import { cold, expectLog, logEvents, replaceValues } from './util.js';
import { exhaustMap, map } from '../index.js';
import { spec } from '@cxl/spec';

export default spec('exhaustMap', it => {
	it.should('map-and-flatten each item to an Observable', a => {
		const e1 = cold('--1-----3--5-------|');
		const e1subs = '^                  !';
		const e2 = cold('x-x-x|              ', { x: '10' });
		const expected = replaceValues('--x-x-x-y-y-y------|', {
			x: '10',
			y: '30',
			z: '50',
		});

		const result = e1.pipe(exhaustMap(x => e2.pipe(map(i => +i * +x))));

		expectLog(a, result, expected);
		a.equal(e1.subscriptions, e1subs);
	});

	it.should('handle outer throw', a => {
		const x = cold('--a--b--c--|');
		const e1 = cold('#');
		logEvents(e1.pipe(exhaustMap(() => x))).then(({ events }) => {
			a.equal(events, '#');
		});
	});

	it.should('handle outer empty', a => {
		const x = cold('--a--b--c--|');
		const e1 = cold('|');
		logEvents(e1.pipe(exhaustMap(() => x))).then(result => {
			a.equal(result.events, '|');
		});
	});

	it.should('handle outer never', a => {
		const x = cold('--a--b--c--|');
		const e1 = cold('-');
		const e1subs = '^';
		const expected = '-';

		const result = e1.pipe(exhaustMap(() => x));

		expectLog(a, result, expected);
		a.equal(x.subscriptions, '');
		a.equal(e1.subscriptions, e1subs);
	});

	it.should('raise error if project throws', a => {
		const e1 = cold('---x|');
		const result = e1.pipe(
			exhaustMap(() => {
				throw 'error';
			}),
		);
		logEvents(result).then(({ events }) => {
			a.equal(events, '---#');
		});
	});
});
