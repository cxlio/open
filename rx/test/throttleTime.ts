import { spec, TestApi } from '../../spec/index.js';
import { subject, throttleTime } from '../index.js';

export default spec('throttleTime', (suite: TestApi) => {
	suite.test('emits after delay', async a => {
		const source = subject<number>();
		const results: number[] = [];
		const done = new Promise<number[]>(resolve => {
			source.pipe(throttleTime(10)).subscribe({
				next: v => results.push(v),
				complete: () => resolve(results),
			});
		});

		source.next(1);
		source.next(2);
		await a.sleep(15);
		source.next(3);
		source.complete();

		const values = await done;
		a.equalValues(values, [1, 3]);
	});

	suite.test('ignores values during window', async a => {
		const source = subject<number>();
		const results: number[] = [];
		const done = new Promise<number[]>(resolve => {
			source.pipe(throttleTime(30)).subscribe({
				next: v => results.push(v),
				complete: () => resolve(results),
			});
		});

		source.next(1);
		source.next(2);
		await a.sleep(5);
		source.complete();

		const values = await done;
		a.equalValues(values, [1]);
	});
});
