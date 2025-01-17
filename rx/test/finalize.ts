import { finalize, of, map, be } from '../index.js';
import { spec } from '@cxl/spec';

export default spec('finalize', it => {
	it.should('call finalize after complete', a => {
		const done = a.async();
		let completed = false;
		of(1, 2, 3)
			.pipe(
				finalize(() => {
					a.equal(completed, true);
					done();
				}),
			)
			.subscribe({
				complete() {
					completed = true;
				},
			});
	});

	it.should('call finalize after error', a => {
		const done = a.async();
		let thrown = false;
		of(1, 2, 3)
			.pipe(
				map(function (x) {
					if (x === 3) {
						throw x;
					}
					return x;
				}),
				finalize(() => {
					a.equal(thrown, true);
					done();
				}),
			)
			.subscribe({
				error() {
					thrown = true;
				},
			});
	});

	it.should('call finalize upon disposal', a => {
		const done = a.async();
		let disposed = false;
		const subscription = be(100)
			.pipe(
				finalize(() => {
					a.equal(disposed, true);
					done();
				}),
			)
			.subscribe();
		disposed = true;
		subscription.unsubscribe();
	});
});
