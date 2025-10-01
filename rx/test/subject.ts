import { Subject, subject, Subscriber } from '../index.js';
import { spec } from '../../spec/index.js';

export default spec('Subject', s => {
	s.test('Subject#constructor', function (a) {
		const s = subject();
		let c = 1;
		s.subscribe(function (b) {
			a.equal(b, c);
		});
		s.subscribe(function (b) {
			a.equal(b, c);
		});

		s.next(c);
		c++;
		s.next(c);
	});

	s.test('error', function (a) {
		const subject = new Subject();
		let c = 1;
		subject.subscribe({
			next(b) {
				a.equal(b, c);
			},
			error() {
				/* noop */
			},
		});
		subject.subscribe({ error: b => a.equal(b, c) });

		subject.next(c);
		c++;
		subject.error(c);
	});

	s.test('complete', a => {
		const subject = new Subject(),
			done = a.async();
		let c = 1;
		subject.subscribe(b => a.equal(b, c));
		subject.subscribe(b => a.equal(b, c));
		subject.subscribe({ complete: done });

		subject.next(c);
		c++;
		subject.complete();
		subject.complete();
		// It should ignore following next
		subject.subscribe(b => a.equal(b, c));
		subject.next(c);
	});

	s.test('subscribe', it => {
		it.should('clean out unsubscribed subscribers', a => {
			class DebugSubject extends Subject<unknown> {
				observers = new Set<Subscriber<unknown>>();
			}

			const subject = new DebugSubject();
			const sub1 = subject.subscribe();
			const sub2 = subject.subscribe();

			a.equal(subject.observers.size, 2);
			sub1.unsubscribe();
			a.equal(subject.observers.size, 1);
			sub2.unsubscribe();
			a.equal(subject.observers.size, 0);
		});

		it.should(
			'unsubscribe when subscriber unsubscribes synchronously',
			a => {
				const subject = new Subject();
				const obs = subject
					.tap(val => a.ok(val !== 3))
					.take(2)
					.tap(val => a.ok(val !== 3));
				obs.subscribe();
				subject.next(1);
				subject.next(2);
				subject.next(3);
				subject.next(4);
				subject.next(5);
			},
		);

		it.should(
			'handle subscribers that arrive and leave at different times, ' +
				'subject does not complete',
			a => {
				const subject = new Subject<number>();
				const results1: (number | string)[] = [];
				const results2: (number | string)[] = [];
				const results3: (number | string)[] = [];

				subject.next(1);
				subject.next(2);
				subject.next(3);
				subject.next(4);

				const subscription1 = subject.subscribe({
					next(x) {
						results1.push(x);
					},
					error() {
						results1.push('E');
					},
					complete() {
						results1.push('C');
					},
				});

				subject.next(5);

				const subscription2 = subject.subscribe({
					next(x) {
						results2.push(x);
					},
					error() {
						results2.push('E');
					},
					complete() {
						results2.push('C');
					},
				});

				subject.next(6);
				subject.next(7);

				subscription1.unsubscribe();

				subject.next(8);

				subscription2.unsubscribe();

				subject.next(9);
				subject.next(10);

				const subscription3 = subject.subscribe({
					next(x) {
						results3.push(x);
					},
					error() {
						results3.push('E');
					},
					complete() {
						results3.push('C');
					},
				});

				subject.next(11);

				subscription3.unsubscribe();

				a.equalValues(results1, [5, 6, 7]);
				a.equalValues(results2, [6, 7, 8]);
				a.equalValues(results3, [11]);
			},
		);

		it.should(
			'handle subscribers that arrive and leave at different times, ' +
				'subject completes',
			a => {
				const subject = new Subject<number>();
				const results1: (number | string)[] = [];
				const results2: (number | string)[] = [];
				const results3: (number | string)[] = [];

				subject.next(1);
				subject.next(2);
				subject.next(3);
				subject.next(4);

				const subscription1 = subject.subscribe({
					next(x) {
						results1.push(x);
					},
					error() {
						results1.push('E');
					},
					complete() {
						results1.push('C');
					},
				});

				subject.next(5);

				const subscription2 = subject.subscribe({
					next: x => results2.push(x),
					error: () => results2.push('E'),
					complete: () => results2.push('C'),
				});

				subject.next(6);
				subject.next(7);

				subscription1.unsubscribe();

				subject.complete();

				subscription2.unsubscribe();

				const subscription3 = subject.subscribe({
					next: x => results3.push(x),
					error: () => results3.push('E'),
					complete: () => results3.push('C'),
				});

				subscription3.unsubscribe();

				a.equalValues(results1, [5, 6, 7]);
				a.equalValues(results2, [6, 7, 'C']);
				a.equalValues(results3, ['C']);
			},
		);
		it.should(
			'handle subscribers that arrive and leave at different times, ' +
				'subject completes before nexting any value',
			a => {
				const subject = new Subject<number>();
				const results1: (number | string)[] = [];
				const results2: (number | string)[] = [];
				const results3: (number | string)[] = [];

				const subscription1 = subject.subscribe({
					next(x) {
						results1.push(x);
					},
					error() {
						results1.push('E');
					},
					complete() {
						results1.push('C');
					},
				});

				const subscription2 = subject.subscribe({
					next(x) {
						results2.push(x);
					},
					error() {
						results2.push('E');
					},
					complete() {
						results2.push('C');
					},
				});

				subscription1.unsubscribe();

				subject.complete();

				subscription2.unsubscribe();

				const subscription3 = subject.subscribe({
					next(x) {
						results3.push(x);
					},
					error() {
						results3.push('E');
					},
					complete() {
						results3.push('C');
					},
				});

				subscription3.unsubscribe();

				a.equalValues(results1, []);
				a.equalValues(results2, ['C']);
				a.equalValues(results3, ['C']);
			},
		);
		it.should('not next after completed', a => {
			const subject = new Subject<string>();
			const results: string[] = [];
			subject.subscribe({
				next: x => results.push(x),
				error: () => {
					/*noop*/
				},
				complete: () => results.push('C'),
			});
			subject.next('a');
			subject.complete();
			subject.next('b');
			a.equalValues(results, ['a', 'C']);
		});

		it.should('not next after error', a => {
			const error = new Error('wut?');
			const subject = new Subject<string>();
			const results: (string | Error)[] = [];
			subject.subscribe({
				next: x => results.push(x),
				error: err => results.push(err as Error),
			});
			subject.next('a');
			subject.error(error);
			subject.next('b');
			a.equalValues(results, ['a', error]);
		});
		it.should(
			'throw exception if any of the observers error handler throws an error',
			a => {
				const subject = new Subject<number>();
				subject.subscribe({
					error: _ => {
						throw 'Test Error';
					},
				});
				a.throws(() => subject.error(''), 'Test Error');
			},
		);
	});
});
