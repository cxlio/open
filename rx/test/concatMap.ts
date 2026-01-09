import { cold, expectLog } from './util.js';
import { spec } from '../../spec/index.js';

export default spec('concatMap', it => {
	it.should('map and concat inner observables sequentially', a => {
		const src = cold('-a-b-c-|');
		const srcSubs = '^      !';

		const innerA = cold('--1-2-|');
		const innerB = cold('--3-|');
		const innerC = cold('--4-5-6-|');

		// each inner subscribes only after the previous completes
		const innerASubs = ' ^     !';
		const innerBSubs = '       ^   !';
		const innerCSubs = '           ^       !';

		const expected = '---1-2---3---4-5-6-|';

		const result = src.concatMap(v => {
			switch (v) {
				case 'a':
					return innerA;
				case 'b':
					return innerB;
				default:
					return innerC;
			}
		});

		expectLog(a, result, expected);
		a.equal(src.subscriptions, srcSubs);
		a.equal(innerA.subscriptions, innerASubs);
		a.equal(innerB.subscriptions, innerBSubs);
		a.equal(innerC.subscriptions, innerCSubs);

		// Run again (cold observables should behave the same)
		expectLog(a, result, expected);
	});

	it.should(
		'not subscribe to later inners if the first inner never completes',
		a => {
			const src = cold('-a-b-|');
			const srcSubs = '^     !';

			const innerNever = cold('-'); // never completes
			const innerNeverSubs = ' ^';

			const innerLater = cold('--x-|');
			const innerLaterSubs = ''; // should never be subscribed

			const expected = '--'; // only the innerNever tick keeps it alive; no completion

			const result = src.concatMap(v =>
				v === 'a' ? innerNever : innerLater,
			);

			expectLog(a, result, expected);
			a.equal(src.subscriptions, srcSubs);
			a.equal(innerNever.subscriptions, innerNeverSubs);
			a.equal(innerLater.subscriptions, innerLaterSubs);
		},
	);

	it.should(
		'raise error if an inner errors (and stop processing later values)',
		a => {
			const src = cold('-a-b-c-|');
			const srcSubs = '^      !';

			const ok = cold('--x-|');
			const okSubs = ' ^   !';

			const boom = cold('---#');
			const boomSubs = '     ^  !';

			const later = cold('--z-|');
			const laterSubs = ''; // never subscribed due to error

			const expected = '---x----#';

			const result = src.concatMap(v => {
				switch (v) {
					case 'a':
						return ok;
					case 'b':
						return boom;
					default:
						return later;
				}
			});

			expectLog(a, result, expected);
			a.equal(src.subscriptions, srcSubs);
			a.equal(ok.subscriptions, okSubs);
			a.equal(boom.subscriptions, boomSubs);
			a.equal(later.subscriptions, laterSubs);
		},
	);

	it.should(
		'unsubscribe active inner when the result is unsubscribed early',
		a => {
			const src = cold('-a-b-c-|');
			const srcSubs = '^ !';

			const inner = cold('--i-j-k-l-|');
			const innerSubs = '  ^  !'; // inner starts after `a`, then gets cut off by take()

			const expected = '----i-(j|)';

			const result = src.concatMap(() => inner);

			expectLog(a, result.take(2), expected);
			a.equal(src.subscriptions, srcSubs);
			a.equal(inner.subscriptions, innerSubs);
		},
	);

	/*it.should('infer types from mapping result', a => {
		const src = of<number>(1, 2, 3);

		const result = src.concatMap(n =>
			n % 2 ? of<string>('a') : of<boolean>(true),
		);

		// `result` should be inferred as Observable<string | boolean>
		const expected: Observable<string | boolean> = result;
		a.ok(expected);
	});*/
});
