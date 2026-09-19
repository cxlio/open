import { cold, expectLog } from './util.js';
import { Observable, publishLast } from '../index.js';
import { spec } from '@cxl/spec';

export default spec('publishLast', it => {
	it.should('emit last notification of a simple source Observable', a => {
		const source = cold('--1-2---3-4--5-|');
		const sourceSubs = '^              !';
		const published = source.pipe(publishLast());
		const expected = '---------------(5|)';

		expectLog(a, published, expected);
		a.equal(source.subscriptions, sourceSubs);
	});

	it.should('multicast the same values to multiple observers', a => {
		const source = cold('-1-2-3----4-|');
		const sourceSubs = '^           !';
		const published = source.pipe(publishLast());
		const o1 = published.mergeMap(a => cold('a|', { a }));
		const expected1 = '------------4|';
		const o2 = published.mergeMap(b => cold('b|', { b }));
		const expected2 = '4|';
		const o3 = published.mergeMap(c => cold('c|', { c }));
		const expected3 = '4|';

		expectLog(a, o1, expected1);
		expectLog(a, o2, expected2);
		expectLog(a, o3, expected3);

		a.equal(source.subscriptions, sourceSubs);
	});

	it.should('multicast an empty source', a => {
		const source = cold('|');
		const sourceSubs = '(^!)';
		const published = source.publishLast();
		const expected = '|';

		expectLog(a, published, expected);
		a.equal(source.subscriptions, sourceSubs);
	});

	it.should('multicast a throw source', a => {
		const source = cold('#');
		const sourceSubs = '(^!)';
		const published = source.publishLast();
		const expected = '#';

		expectLog(a, published, expected);
		a.equal(source.subscriptions, sourceSubs);
	});

	it.should('multicast one observable to multiple observers', a => {
		const results1: number[] = [];
		const results2: number[] = [];
		let subscriptions = 0;

		const source = new Observable<number>(observer => {
			subscriptions++;
			observer.next(1);
			observer.next(2);
			observer.next(3);
			observer.next(4);
			observer.complete();
		});

		const connectable = source.pipe(publishLast());

		connectable.subscribe(x => {
			results1.push(x);
		});

		connectable.subscribe(x => {
			results2.push(x);
		});

		a.equalValues(results1, [4]);
		a.equalValues(results2, [4]);
		a.equal(subscriptions, 1);
	});
});
