import { cold, expectLog } from './util.js';
import { Subject, first } from '../index.js';
import { spec } from '../../spec/index.js';

export default spec('first', a => {
	// Test: Emit only the first value of an observable with multiple values
	a.should(
		'emit the first value of an observable with multiple values',
		async a => {
			const e1 = cold('--a-----b----c---d--|');
			const e1subs = '^ !';
			const expected = '--(a|)'; // Emit the first value and complete

			await expectLog(a, e1.pipe(first()), expected);
			a.equal(e1.subscriptions, e1subs);
		},
	);

	// Test: Complete with an error if the observable is empty
	a.should('error when the observable is empty', async a => {
		const e1 = cold('------|');
		const e1subs = '^     !';
		const expected = '------#'; // Expect an EmptyError

		await expectLog(a, e1.pipe(first()), expected);
		a.equal(e1.subscriptions, e1subs);
	});

	// Test: Handle reentrant emissions correctly
	a.should('complete despite reentrant emissions', a => {
		let completed = false;
		const source = new Subject<void>();
		source.pipe(first()).subscribe({
			next() {
				source.next(); // Reentrant emission
			},
			complete() {
				completed = true;
			},
		});
		source.next();
		a.ok(completed); // Ensure completion after the first emission
	});

	// Test: Complete with error if no values before the source completes
	a.should('error when no values emitted', async a => {
		const e1 = cold('--|');
		const e1subs = '^ !';
		const expected = '--#'; // EmptyError expected

		await expectLog(a, e1.pipe(first()), expected);
		a.equal(e1.subscriptions, e1subs);
	});
});
