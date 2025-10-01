import { from, fromAsync, of } from '../index.js';
import { spec } from '../../spec/index.js';

export default spec('from', s => {
	s.test('should create an observable from an array', a => {
		let current = 10,
			count = 0;
		const done = a.async();

		from([10, 20, 30]).subscribe({
			next(val) {
				a.equal(val, current);
				current += 10;
				count++;
			},
			complete() {
				a.equal(count, 3);
				done();
			},
		});
	});
	s.test('should create an observable from a promise', a => {
		const done = a.async();
		let count = 0;

		from(new Promise(resolve => resolve(10))).subscribe({
			next(val) {
				a.equal(val, 10);
				count++;
			},
			complete() {
				a.equal(count, 1);
				done();
			},
		});
	});
	s.test(
		'should create an observable from promise and propagate errors',
		a => {
			const done = a.async();
			from(new Promise((_, reject) => reject('Test error'))).subscribe({
				error(err) {
					a.equal(err, 'Test error');
					done();
				},
			});
		},
	);
	s.test('should create an observable from a generator', a => {
		const done = a.async();
		from(
			(function* () {
				yield 10;
				yield 20;
				yield 30;
			})(),
		).subscribe({
			next(val) {
				a.ok([10, 20, 30].includes(val));
			},
			complete() {
				done();
			},
		});
	});
	s.test('should create an observable from a `async function()`', a => {
		const done = a.async();
		async function generateValue() {
			return 10;
		}
		fromAsync(generateValue).subscribe({
			next(val) {
				a.equal(val, 10);
			},
			complete() {
				done();
			},
		});
	});

	s.test('should create an observable from observable', a => {
		const done = a.async();
		const source = of(10);
		let count = 0;

		from(source).subscribe({
			next(val) {
				a.equal(val, 10);
				count++;
			},
			complete() {
				a.equal(count, 1);
				done();
			},
		});
	});
});
