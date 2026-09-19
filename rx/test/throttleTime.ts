import { spec, TestApi } from '@cxl/spec';
import { subject, throttleTime } from '../index.js';

export default spec('throttleTime', (suite: TestApi) => {
	suite.test('emits after delay', a => {
		const time = a.mockSetTimeout();
		const source = subject<number>();
		const results: number[] = [];
		source.pipe(throttleTime(10)).subscribe({
			next: value => results.push(value),
		});

		source.next(1);
		source.next(2);
		time.advance(10);
		source.next(3);
		source.complete();

		a.equalValues(results, [1, 3]);
	});

	suite.test('ignores values during window', a => {
		const time = a.mockSetTimeout();
		const source = subject<number>();
		const results: number[] = [];
		source.pipe(throttleTime(30)).subscribe({
			next: value => results.push(value),
		});

		source.next(1);
		source.next(2);
		time.advance(5);
		source.complete();

		a.equalValues(results, [1]);
	});
});
