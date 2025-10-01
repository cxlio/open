import { cold, expectLog } from './util.js';
import { Observable, merge, of } from '../index.js';
import { spec } from '../../spec/index.js';

export default spec('merge', s => {
	s.test('should return itself when try to merge single observable', a => {
		const e1 = of('a');
		const result = merge(e1);

		a.equal(e1, result);
	});

	s.test('should merge different types', a => {
		const e1 = of(1);
		const e2 = of('2');

		a.ok(merge(e1, e2));
	});

	s.test('should merge cold and cold', a => {
		const e1 = cold('---a-----b-----c----|');
		const e2 = cold('------x-----y-----z----|');
		const expected = '---a--x--b--y--c--z----|';

		expectLog(a, merge(e1, e2), expected);
	});

	s.test('should merge empty and empty', a => {
		const e1 = cold('|');
		const e2 = cold('|');

		expectLog(a, merge(e1, e2), '|');
	});

	s.test('should merge parallel emissions', a => {
		const e1 = cold('---a----b----c----|');
		const e2 = cold('---x----y----z----|');
		const expected = '---(ax)----(by)----(cz)----|';

		expectLog(a, merge(e1, e2), expected);
	});

	s.test('should merge empty and throw', a => {
		const e1 = cold('|');
		const e2 = cold('#');

		expectLog(a, merge(e1, e2), '#');
	});

	s.test('should merge hot and error', async a => {
		const e1 = cold('--a--b--c--|');
		const e1subs = '^      !';
		const e2 = cold('-------#');
		const e2subs = '^      !';
		const expected = '--a--b-#';
		const result = merge(e1, e2);

		await expectLog(a, result, expected);
		a.equal(e1.subscriptions, e1subs);
		a.equal(e2.subscriptions, e2subs);
	});

	s.test('should merge empty and non-empty', a => {
		const e1 = cold('|');
		const e2 = cold('---a--b--|');
		const expected = '---a--b--|';

		expectLog(a, merge(e1, e2), expected);
	});
	s.test('should merge synchronous streams', a => {
		const e1 = of(1);
		const e2 = of(2);
		const e3 = of(3);

		const result = merge(e1, e2, e3);
		const expected = [1, 2, 3];
		const complete = a.async();

		result.subscribe({
			next: value => a.ok(expected.includes(value)),
			complete,
		});
	});

	s.test('should merge delayed emissions', a => {
		const e1 = cold('----a|');
		const e2 = cold('-------b|');
		const expected = '----a--b|';

		expectLog(a, merge(e1, e2), expected);
	});

	s.test('should handle completion order', a => {
		const e1 = cold('---a--|');
		const e2 = cold('---b-------|');
		const expected = '---(ab)-------|';

		expectLog(a, merge(e1, e2), expected);
	});
	s.test('should merge multiple observables', a => {
		const e1 = cold('---a-----|');
		const e2 = cold('------b--|');
		const e3 = cold('---x---y-|');
		const expected = '---(ax)--by-|';

		expectLog(a, merge(e1, e2, e3), expected);
	});

	s.test('type inference with heterogeneous types', a => {
		const e1 = of<number>(1);
		const e2 = of<string>('2');
		const e3 = of<boolean>(true);

		// Resulting type should be inferred as Observable<number | string | boolean>
		const result = merge(e1, e2, e3);
		const expected: Observable<number | string | boolean> = result;
		a.ok(expected);
	});
});
