import { cold, expectLog } from './util.js';
import { combineLatest } from '../index.js';
import { spec } from '../../spec/index.js';

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

	it.should('work with two nevers', async a => {
		const e1 = cold('-');
		const e1subs = '^';
		const e2 = cold('-');
		const e2subs = '^';
		const expected = '-';

		const result = combineLatest(e1, e2).map(([x, y]) => x + y);

		await expectLog(a, result, expected);
		a.equal(e1.subscriptions, e1subs);
		a.equal(e2.subscriptions, e2subs);
	});

	it.should('work with one emitting source and another empty source', a => {
		const e1 = cold('----a----b----c----|'); // emitting
		const e1subs = '^                  !';
		const e2 = cold('-------------------|'); // empty
		const e2subs = '^                  !';
		const expected = '-------------------|'; // no combined emissions

		const result = combineLatest(e1, e2);

		expectLog(a, result, expected);
		a.equal(e1.subscriptions, e1subs);
		a.equal(e2.subscriptions, e2subs);
	});

	it.should('work with one emitting source and another never source', a => {
		const e1 = cold('----a----b----c----|'); // emitting
		const e1subs = '^                  !';
		const e2 = cold('-'); // never
		const e2subs = '^';
		const expected = '-------------------'; // never emits due to `never`

		const result = combineLatest(e1, e2);

		expectLog(a, result, expected);
		a.equal(e1.subscriptions, e1subs);
		a.equal(e2.subscriptions, e2subs);
	});

	it.should(
		'emit values only after all observables have emitted at least once',
		a => {
			const e1 = cold('----a----b----c----|');
			const e1subs = '^                  !';
			const e2 = cold('-------x-------y---|');
			const e2subs = '^                  !';
			const expected = '-------ax-bx----cxcy---|';

			const result = combineLatest(e1, e2).map(([x, y]) => x + y);

			expectLog(a, result, expected);
			a.equal(e1.subscriptions, e1subs);
			a.equal(e2.subscriptions, e2subs);
		},
	);

	it.should('propagate error if one source errors before all emit', a => {
		const e1 = cold('----a----b----|');
		const e1subs = '^    !';
		const e2 = cold('-----#', undefined, 'error'); // errors early
		const e2subs = '^    !';
		const expected = '-----#'; // errors after e2 emits

		const result = combineLatest(e1, e2);

		expectLog(a, result, expected);
		a.equal(e1.subscriptions, e1subs);
		a.equal(e2.subscriptions, e2subs);
	});

	it.should('complete immediately if all sources are EMPTY', async a => {
		const e1 = cold('|');
		const e2 = cold('|');
		const e3 = cold('|');

		await expectLog(a, combineLatest(e1, e2, e3), '|');
		a.equal(e1.subscriptions, '(^!)');
		a.equal(e2.subscriptions, '(^!)');
		a.equal(e3.subscriptions, '(^!)');
	});

	it.should('emit combined values from three observables', a => {
		const e1 = cold('----a----b----|');
		const e1subs = '^             !';
		const e2 = cold('--m----n----o--|');
		const e2subs = '^              !';
		const e3 = cold('-x---y---z-----|');
		const e3subs = '^              !';
		const expected = '----amxamy-any-(bnybnz)--boz--|';

		const result = combineLatest(e1, e2, e3).map(([x, y, z]) => x + y + z);

		expectLog(a, result, expected);
		a.equal(e1.subscriptions, e1subs);
		a.equal(e2.subscriptions, e2subs);
		a.equal(e3.subscriptions, e3subs);
	});
	it.should('handle interleaved with tail', a => {
		const e1 = cold('---b---c---|', { a: 'a', b: 'b', c: 'c' });
		const e1subs = '^          !';
		const e2 = cold('-----e---f--|', { d: 'd', e: 'e', f: 'f' });
		const e2subs = '^           !';
		const expected = '-----be-ce-cf--|';

		const result = combineLatest(e1, e2).map(([x, y]) => x + y);

		expectLog(a, result, expected);
		a.equal(e1.subscriptions, e1subs);
		a.equal(e2.subscriptions, e2subs);
	});
});
