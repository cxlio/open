import { cold, expectLog } from './util.js';
import { observable, ignoreElements } from '../index.js';
import { spec } from '@cxl/spec';

export default spec('ignoreElements', it => {
	it.should(
		'ignore all emitted elements and only propagate complete notification',
		a => {
			const e1 = cold('--a--b--c--|');
			const expected = '-----------|';

			const result = e1.pipe(ignoreElements());

			expectLog(a, result, expected);
		},
	);

	it.should('emit error if source observable errors', a => {
		const e1 = cold('--a--b--#');
		const expected = '--------#';

		const result = e1.pipe(ignoreElements());

		expectLog(a, result, expected);
	});

	it.should('complete immediately if source is empty', a => {
		const e1 = cold('|');
		const expected = '|';

		const result = e1.pipe(ignoreElements());

		expectLog(a, result, expected);
	});

	it.should('handle a synchronous observable with side-effects', a => {
		const values: number[] = [];
		const e1 = observable<number>(observer => {
			values.push(1);
			observer.next(1);
			values.push(2);
			observer.next(2);
			observer.complete();
		});

		e1.pipe(ignoreElements()).subscribe();

		a.equalValues(values, [1, 2]); // side effects should still execute
	});
});
