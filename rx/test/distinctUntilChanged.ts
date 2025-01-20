import { cold, expectLog } from './util.js';
import { distinctUntilChanged, of } from '../index.js';
import { suite } from '@cxl/spec';

export default suite('distinctUntilChanged', test => {
	test('should distinguish between values', a => {
		const e1 = cold('-1--2-2----1-3-|');
		const expected = '-1--2------1-3-|';

		expectLog(a, e1.pipe(distinctUntilChanged()), expected);
	});

	test('should handle no emissions', a => {
		const e1 = cold('-----|');
		const expected = '-----|';

		expectLog(a, e1.pipe(distinctUntilChanged()), expected);
	});

	test('should handle identical consecutive values', a => {
		const e1 = cold('-1--1--1--|');
		const expected = '-1--------|';

		expectLog(a, e1.pipe(distinctUntilChanged()), expected);
	});

	test('should handle a single emission', a => {
		const e1 = cold('---5|');
		const expected = '---5|';

		expectLog(a, e1.pipe(distinctUntilChanged()), expected);
	});

	test('should distinguish between undefined and null', a => {
		const e1 = of(undefined, null);
		const expected = '(undefinednull|)';

		expectLog(a, e1.pipe(distinctUntilChanged()), expected);
	});

	test('should work with an empty Observable', a => {
		const e1 = cold('|');
		const expected = '|';

		expectLog(a, e1.pipe(distinctUntilChanged()), expected);
	});

	test('should reset comparison on subscription', a => {
		const e1 = cold('-(1|)');
		const expected = '-(1|)';

		expectLog(a, e1.pipe(distinctUntilChanged()), expected);

		const e2 = cold('-(1|)');
		const expected2 = '-(1|)';

		expectLog(a, e2.pipe(distinctUntilChanged()), expected2);
	});
});
