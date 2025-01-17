import { cold, expectLog } from './util.js';
import { defer } from '../index.js';
import { spec } from '@cxl/spec';

export default spec('defer', it => {
	it.should('defer the creation of a simple observable', a => {
		const expected = '-a--b--c--|';
		const e1 = defer(() => cold('-a--b--c--|'));
		// Run Again
		expectLog(a, e1, expected);
	});

	it.should('allow unsubscribing early and explicitly', a => {
		const source = cold('--a--b--c--|');
		const sourceSubs = '^    !';
		const expected = '--a--(b|)';

		const e1 = defer(() => source).take(2);

		expectLog(a, e1, expected);
		a.equal(source.subscriptions, sourceSubs);
	});
});
