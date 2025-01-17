import { cold, expectLog } from './util.js';
import { zip, from } from '../index.js';
import { spec } from '@cxl/spec';

export default spec('zip', it => {
	it.should('combine a source with a second', a => {
		const a1 = cold('---1---2---3---');
		const asubs = '^';
		const b1 = cold('--4--5--6--7--8--');
		const bsubs = '^';
		const expected = '---1,4---2,5---3,6-----';

		expectLog(a, zip(a1, b1), expected);
		a.equal(a1.subscriptions, asubs);
		a.equal(b1.subscriptions, bsubs);
	});

	it.should('zip the provided observables', a => {
		const expected = ['a1', 'b2', 'c3'];
		const done = a.async();
		let i = 0;

		zip(from(['a', 'b', 'c']), from([1, 2, 3]))
			.map(([A, B]) => A + B)
			.subscribe({
				next: (x: string) => {
					a.equal(x, expected[i++]);
				},
				complete: done,
			});
	});

	it.should(
		'end once one observable completes and its buffer is empty',
		a => {
			const e1 = cold('---a--b--c--|               ');
			const e1subs = '^           !';
			const e2 = cold('------d----e----f--------|  ');
			const e2subs = '^                 !';
			const e3 = cold('--------h----i----j---------'); // doesn't complete
			const e3subs = '^                 !';
			const expected = '--------a,d,h----b,e,i----(c,f,j|)'; // e1 complete and buffer empty

			expectLog(a, zip(e1, e2, e3), expected);
			a.equal(e1.subscriptions, e1subs);
			a.equal(e2.subscriptions, e2subs);
			a.equal(e3.subscriptions, e3subs);
		},
	);

	it.should(
		'end once one observable nexts and zips value from completed other ' +
			'observable whose buffer is empty',
		a => {
			const e1 = cold('---a--b--c--|             ');
			const e1subs = '^           !';
			const e2 = cold('------d----e----f|        ');
			const e2subs = '^                !';
			const e3 = cold('--------h----i----j-------'); // doesn't complete
			const e3subs = '^                 !';
			const expected = '--------a,d,h----b,e,i----(c,f,j|)'; // e2 buffer empty and signaled complete

			expectLog(a, zip(e1, e2, e3), expected);
			a.equal(e1.subscriptions, e1subs);
			a.equal(e2.subscriptions, e2subs);
			a.equal(e3.subscriptions, e3subs);
		},
	);

	it.should('work with two nevers', a => {
		const e1 = cold('-');
		const e1subs = '^';
		const e2 = cold('-');
		const e2subs = '^';
		const expected = '-';

		expectLog(a, zip(e1, e2), expected);
		a.equal(e1.subscriptions, e1subs);
		a.equal(e2.subscriptions, e2subs);
	});

	it.should('work with never and empty', a => {
		const e1 = cold('-');
		const e1subs = '(^!)';
		const e2 = cold('|');
		const e2subs = '(^!)';
		const expected = '|';

		expectLog(a, zip(e1, e2), expected);
		a.equal(e1.subscriptions, e1subs);
		a.equal(e2.subscriptions, e2subs);
	});

	it.should('work with two sources that eventually raise errors', a => {
		const e1 = cold('--w-----#----', { w: '1' }, 'err1');
		const e1subs = '^       !';
		const e2 = cold('-----z-----#-', { z: '2' }, 'err2');
		const e2subs = '^       !';
		const expected = '-----1,2--#';

		expectLog(a, zip(e1, e2), expected);
		a.equal(e1.subscriptions, e1subs);
		a.equal(e2.subscriptions, e2subs);
	});

	it.should(
		'return EMPTY if passed an empty array as the only argument',
		a => {
			const results: string[] = [];
			zip().subscribe({
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
});
