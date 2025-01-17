import { cold, expectLog } from './util.js';
import { Observable, share, of } from '../index.js';
import { spec } from '@cxl/spec';

export default spec('share', it => {
	it.should('should mirror a simple source Observable', a => {
		const source = cold('--1-2---3-4--5-|');
		const sourceSubs = '^              !';
		const expected = '--1-2---3-4--5-|';
		const shared = source.pipe(share());

		expectLog(a, shared, expected);
		a.equal(source.subscriptions, sourceSubs);
	});

	it.should('share a single subscription', a => {
		let subscriptionCount = 0;
		const obs = new Observable<never>(({ signal }) => {
			subscriptionCount++;
			signal.subscribe(() => subscriptionCount--);
		});

		const source = obs.pipe(share());
		a.equal(subscriptionCount, 0);
		const subscriptions = [source.subscribe(), source.subscribe()];
		a.equal(subscriptionCount, 1);
		subscriptions.forEach(s => s.unsubscribe());
		a.equal(subscriptionCount, 0);
	});

	it.should(
		'not change the output of the observable when error with cold observable',
		a => {
			const e1 = cold('---a--b--c--d--e--#');
			const e1subs = '^                 !';
			const expected = '---a--b--c--d--e--#';

			expectLog(a, e1.pipe(share()), expected);
			a.equal(e1.subscriptions, e1subs);
		},
	);

	it.should('replay when subscribed to cold observable', a => {
		const shared = of(1, 2, 3).pipe(share());

		expectLog(a, shared, '(123|)');
		expectLog(a, shared, '(123|)');
	});

	it.should('not reset upon resubscription if source completes', a => {
		const source = cold('---a--b--c-|');
		const sourceSubs = ['^          !', '^          !^          !'];
		const shared = source.pipe(share());
		const expected1 = '---a--b--c-|';
		const expected2 = '---a--b--c-|';

		expectLog(a, shared, expected1);
		a.equal(source.subscriptions, sourceSubs[0]);

		shared.subscribe();
		expectLog(a, shared, expected2);
		a.equal(source.subscriptions, sourceSubs[1]);
	});

	it.should('not resubscribe to source if already complete', async a => {
		const source = cold('|');
		const sourceSubs = `(^!^!)`;
		const shared = source.pipe(share());
		const expected = '|';

		await expectLog(a, shared, expected);
		await expectLog(a, shared, expected);
		a.equal(source.subscriptions, sourceSubs);
	});
});
