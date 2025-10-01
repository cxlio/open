import { cold, expectLog } from './util.js';
import { Subject, take } from '../index.js';
import { spec } from '../../spec/index.js';

export default spec('take', a => {
	a.should('take two values of an observable with many values', async a => {
		const e1 = cold('--a-----b----c---d--|');
		const e1subs = '^       !';
		const expected = '--a-----(b|)';

		await expectLog(a, e1.pipe(take(2)), expected);
		a.equal(e1.subscriptions, e1subs);
	});

	a.should('complete when the source is reentrant', a => {
		let completed = false;
		const source = new Subject<void>();
		source.pipe(take(5)).subscribe({
			next() {
				source.next();
			},
			complete() {
				completed = true;
			},
		});
		source.next();
		a.ok(completed);
	});

	a.should('be empty on take(0)', a => {
		const e1 = cold('--b----c---d--|');
		const e1subs = '^ !'; // Don't subscribe at all
		const expected = '--|';

		expectLog(a, e1.take(0), expected);
		a.equal(e1.subscriptions, e1subs);
	});
});
