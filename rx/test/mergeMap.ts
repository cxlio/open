import { cold, expectLog } from './util.js';
import { defer, mergeMap, of, from } from '../index.js';
import { spec } from '../../spec/index.js';

function arrayRepeat<T>(value: T, times: number) {
	const results = [];
	for (let i = 0; i < times; i++) {
		results.push(value);
	}
	return from(results);
}

export default spec('mergeMap', it => {
	it.should('map-and-flatten each item to an Observable', async a => {
		const values = { x: '10', y: '30', z: '50' };
		const e1 = cold('--1-----3--5-------|', values);
		const e1subs = '^                  !';
		const e2 = cold('x-x-x|              ', { x: '10' });
		const expected = '--10-10-10-30-30503050-50---|';
		const result = e1.pipe(mergeMap(x => e2.map(i => +i * +x)));

		await expectLog(a, result, expected);
		a.equal(e1.subscriptions, e1subs);
	});

	it.should('map and flatten an Array', a => {
		const source = of(1, 2, 3, 4).mergeMap(x => from([x + '!']));

		const expected = ['1!', '2!', '3!', '4!'];
		let completed = false;

		source.subscribe({
			next: x => {
				a.equal(x, expected.shift());
			},
			complete: () => {
				a.equal(expected.length, 0);
				completed = true;
			},
		});

		a.ok(completed);
	});

	it.should('support nested merges', a => {
		const results: (number | string)[] = [];

		of(1)
			.mergeMap(() => defer(() => of(2)))
			.mergeMap(() => defer(() => of(3)))

			.subscribe({
				next(value) {
					results.push(value);
				},
				complete() {
					results.push('done');
				},
			});

		a.equalValues(results, [3, 'done']);
	});

	it.should(
		'mergeMap many outer to many inner, and inner throws',
		async a => {
			const e1 = cold('-a-------b-------c-------d-------|');
			const e1subs = '^                        !';
			const i1 = cold('----i---j---k---l-------#');
			const expected = '-----i---j---(ki)---(lj)---(ki)---#';
			const result = e1.mergeMap(() => i1);

			await expectLog(a, result, expected);
			a.equal(e1.subscriptions, e1subs);
		},
	);

	it.should(
		'mergeMap many outer to many inner, inner never completes',
		async a => {
			const e1 = cold('-a-------b-------c-------d-------|');
			const e1subs = '^                                !';
			const i1 = cold('----i---j---k---l-------------------------');
			const expected =
				'-----i---j---(ki)---(lj)---(ki)---(lj)---(ki)---(lj)---k---l-------------------------';

			const result = e1.mergeMap(() => i1);

			await expectLog(a, result, expected);
			a.equal(e1.subscriptions, e1subs);
		},
	);

	it.should('mergeMap many outer to an array for each value', a => {
		const e1 = cold('2-----4--------3--------2-------|');
		const e1subs = '^                               !';
		const expected = '(22)-----(4444)--------(333)--------(22)-------|';

		const source = e1.mergeMap(value => arrayRepeat(value, +value));

		expectLog(a, source, expected);
		a.equal(e1.subscriptions, e1subs);
	});

	it.should('handle an empty source Observable', async a => {
		const e1 = cold('|');
		const e1subs = '(^!)';
		const expected = '|';

		const result = e1.pipe(mergeMap(() => of('value')));

		await expectLog(a, result, expected);
		a.equal(e1.subscriptions, e1subs);
	});

	it.should('handle outer error', async a => {
		const e1 = cold('#');
		const e1subs = '(^!)';
		const expected = '#';

		const result = e1.pipe(mergeMap(() => of('value')));

		await expectLog(a, result, expected);
		a.equal(e1.subscriptions, e1subs);
	});

	it.should('handle inner error', async a => {
		const e1 = cold('-1-|');
		const e1subs = '^!';
		const i1 = cold('#');
		const expected = '-#';

		const result = e1.pipe(mergeMap(() => i1));

		await expectLog(a, result, expected);
		a.equal(e1.subscriptions, e1subs);
	});

	it.should('handle a synchronous inner Observable', a => {
		const source = of(1, 2, 3).mergeMap(x => of(x * 10));

		const expected = [10, 20, 30];
		const results: number[] = [];

		source.subscribe({
			next: x => results.push(x),
			complete: () => {
				a.equalValues(results, expected);
			},
		});
	});

	it.should('handle project function that throws', async a => {
		const e1 = cold('--1--|');
		const e1subs = '^ !';
		const expected = '--#';

		const result = e1.pipe(
			mergeMap(() => {
				throw new Error('Error!');
			}),
		);

		await expectLog(a, result, expected);
		a.equal(e1.subscriptions, e1subs);
	});

	it.should('handle inner Observable that completes immediately', async a => {
		const e1 = cold('1---2---|');
		const e1subs = '^       !';
		const i1 = cold('|');
		const expected = '--------|';

		const result = e1.pipe(mergeMap(() => i1));

		await expectLog(a, result, expected);
		a.equal(e1.subscriptions, e1subs);
	});
});
