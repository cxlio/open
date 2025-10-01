import { Observable, filter } from '../index.js';
import { cold, expectLog } from './util.js';
import { spec } from '../../spec/index.js';

export default spec('filter', s => {
	s.test('should filter out event values', a => {
		const source = cold('--0--1--2--3--4--|');
		const subs = '^                !';
		const expected = '-----1-----3-----|';

		expectLog(a, source.pipe(filter(x => +x % 2 === 1)), expected);
		a.equal(source.subscriptions, subs);
	});
	s.test('filter', a => {
		const A = new Observable<number>(s => {
			[1, 2, 3, 4, 5, 6].forEach(s.next, s);
		});
		let filterFn = (v: number) => v < 4,
			B = A.pipe(filter(filterFn)),
			b = B.subscribe(v => {
				a.ok(v);
			}),
			i = 1;
		b.unsubscribe();

		filterFn = v => v % 2 === 0;
		B = A.pipe(filter(filterFn));
		b = B.subscribe(v => {
			a.ok(v);
		});
		b.unsubscribe();

		filterFn = () => true;
		B = A.pipe(filter(filterFn));
		b = B.subscribe(v => {
			a.equal(v, i++);
		});
		b.unsubscribe();
	});
});
