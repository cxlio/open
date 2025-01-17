import { cold, expectLog } from './util.js';
import { combineLatest } from '../index.js';
import { spec } from '@cxl/spec';

export default spec('combineLatest', it => {
	it.should('combineLatest the provided observables', a => {
		const firstSource = cold('----a----b----c----|');
		const secondSource = cold('--d--e--f--g--|');
		const expected = '----adae--afbf-bg--cg----|';

		const combined = combineLatest(firstSource, secondSource).map(
			([a, b]) => '' + a + b,
		);

		expectLog(a, combined, expected);
	});

	it.should("work with two EMPTY's", async a => {
		const e1 = cold('|');
		const e2 = cold('|');

		await expectLog(a, combineLatest(e1, e2), '|');
		a.equal(e1.subscriptions, '(^!)');
		a.equal(e2.subscriptions, '(^!)');
	});

	it.should(
		'return EMPTY if passed an empty array as the only argument',
		a => {
			const results: string[] = [];
			combineLatest().subscribe({
				next: () => {
					throw new Error('should not emit');
				},
				complete: () => {
					results.push('done');
				},
			});

			a.equal(results[0], 'done');
		},
	);

	/*it.should(
		'combine an immediately-scheduled source with an immediately-scheduled second',
		a => {
			const done = a.async();
			const e1 = from([1, 2, 3, 4]);
			const e2 = from([4, 5, 6, 7, 8]);
			const e3 = from([9, 10, 11]);
			const r = [
				[1, 4, 9],
				[2, 4, 9],
				[2, 5, 9],
				[2, 5, 10],
				[3, 5, 10],
				[3, 6, 10],
				[3, 6, 11],
				[4, 6, 11],
				[4, 7, 11],
				[4, 8, 11],
			];
			let index = 0;

			combineLatest(e1, e2, e3).subscribe({
				next: vals => {
					const row = r[index++];
					a.equal(vals[0], row[0]);
					a.equal(vals[1], row[1]);
					a.equal(vals[2], row[2]);
				},
				error: () => {
					throw new Error('should not be called');
				},
				complete: () => {
					a.equal(index, r.length);
					done();
				},
			});
		}
	);*/

	it.should('work with empty and error', a => {
		const e1 = cold('----------|'); //empty
		const e1subs = '^     !';
		const e2 = cold('------#', undefined, 'shazbot!'); //error
		const e2subs = '^     !';
		const expected = '------#';

		const result = combineLatest(e1, e2).map(([x, y]) => x + y);

		expectLog(a, result, expected);
		a.equal(e1.subscriptions, e1subs);
		a.equal(e2.subscriptions, e2subs);
	});
});
