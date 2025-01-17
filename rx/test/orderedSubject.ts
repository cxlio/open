import { OrderedSubject } from '../index.js';
import { suite } from '@cxl/spec';

export default suite('OrderedSubject', test => {
	test('OrderedSubject#constructor', function (a) {
		const orderedSubject = new OrderedSubject<number>();
		a.ok(orderedSubject instanceof OrderedSubject);
	});

	test('OrderedSubject emits values in order', function (a) {
		const orderedSubject = new OrderedSubject<number>();
		const results: number[] = [];

		orderedSubject.subscribe(value => results.push(value));
		orderedSubject.next(1);
		orderedSubject.next(2);
		orderedSubject.next(3);

		a.equalValues(results, [1, 2, 3]);
	});

	test('OrderedSubject handles nested emissions', function (a) {
		const orderedSubject = new OrderedSubject<number>();
		const results: number[] = [];

		orderedSubject.subscribe(value => {
			results.push(value);
			if (value === 2) {
				// Emit additional value during processing
				orderedSubject.next(4);
			}
		});
		orderedSubject.next(1);
		orderedSubject.next(2);
		orderedSubject.next(3);

		a.equalValues(results, [1, 2, 4, 3]);
	});

	test('OrderedSubject with multiple subscribers', function (a) {
		const orderedSubject = new OrderedSubject<number>();
		const results1: number[] = [];
		const results2: number[] = [];

		orderedSubject.subscribe(value => results1.push(value));
		orderedSubject.subscribe(value => results2.push(value));
		orderedSubject.next(1);
		orderedSubject.next(2);
		orderedSubject.next(3);

		a.equalValues(results1, [1, 2, 3]);
		a.equalValues(results2, [1, 2, 3]);
	});

	test('OrderedSubject handles queue when subscriber unsubscribes', function (a) {
		const orderedSubject = new OrderedSubject<number>();
		const results: number[] = [];

		const subscription = orderedSubject.subscribe(value => {
			results.push(value);
			if (value === 2) {
				subscription.unsubscribe();
			}
		});
		orderedSubject.next(1);
		orderedSubject.next(2);
		orderedSubject.next(3);
		orderedSubject.next(4);

		a.equalValues(results, [1, 2]);
	});

	test('OrderedSubject processes queued values after completion', a => {
		const orderedSubject = new OrderedSubject<number>();
		const results: number[] = [];
		const done = a.async();

		orderedSubject.subscribe({
			next(value) {
				results.push(value);
			},
			complete() {
				a.equalValues(results, [1, 2]);
				done();
			},
		});
		orderedSubject.next(1);
		orderedSubject.next(2);
		orderedSubject.complete();
		orderedSubject.next(3); // Should be ignored after complete
	});
});
