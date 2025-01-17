import { cold, expectLog } from './util.js';
import { distinctUntilChanged } from '../index.js';
import { suite } from '@cxl/spec';

export default suite('distinctUntilChanged', test => {
	test('should distinguish between values', a => {
		const e1 = cold('-1--2-2----1-3-|');
		const expected = '-1--2------1-3-|';

		expectLog(a, e1.pipe(distinctUntilChanged()), expected);
	});
});
