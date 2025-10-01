import { cold, expectLog } from './util.js';
import { reduce } from '../index.js';
import { spec } from '../../spec/index.js';

export default spec('reduce', a => {
	a.should('reduce', async a => {
		const values = {
			a: '1',
			b: '3',
			c: '5',
			x: '9',
		};
		const e1 = cold('--a--b--c--|', values);
		const e1subs = '^          !';
		const expected = '-----------(9|)';

		const reduceFunction = function (o: number, x: string) {
			return o + +x;
		};

		await expectLog(a, e1.pipe(reduce(reduceFunction, 0)), expected);
		a.equal(e1.subscriptions, e1subs);
	});

	a.should('reduce with seed', async a => {
		const e1 = cold('--a--b--|');
		const e1subs = '^       !';
		const expected = '--------(nab|)';

		const seed = 'n';
		const reduceFunction = function (o: string, x: string) {
			return o + x;
		};

		await expectLog(a, e1.pipe(reduce(reduceFunction, seed)), expected);
		a.equal(e1.subscriptions, e1subs);
	});
});
