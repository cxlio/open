import { interval } from '../index.js';
import { spec } from '@cxl/spec';

declare const setTimeout: (fn: (a?: unknown) => unknown, n?: number) => number;
declare let clearInterval: (n: number) => void;
declare let setInterval: (fn: () => unknown, n?: number) => number;

export default spec('interval', it => {
	function mockSetInterval(fn: (advance: (ms: number) => void) => void) {
		let id = 0;
		let lastCalled = 0;
		const intervals: Record<number, { cb: () => void; delay: number }> = {};
		const originalSet = setInterval;
		const originalClear = clearInterval;

		setInterval = (cb: () => unknown, delay = 0): number => {
			intervals[++id] = { cb, delay };
			return id;
		};
		clearInterval = (id: number) => {
			delete intervals[id];
		};

		fn((ms: number) => {
			const elapsedTime = ms - lastCalled;
			for (const { cb, delay } of Object.values(intervals)) {
				const timesToFire = Math.floor(elapsedTime / delay);
				for (let i = 0; i < timesToFire; i++) cb();
				lastCalled = Math.floor(ms / delay) * delay;
			}
		});

		setInterval = originalSet;
		clearInterval = originalClear;
	}

	it.should('emit values at specified intervals', a => {
		mockSetInterval(advance => {
			const period = 5;
			let emissions = 0;
			const subscription = interval(period).subscribe(() => emissions++);
			advance(20);
			subscription.unsubscribe();
			// Expecting approximately 20ms / 5ms = 4 emissions
			a.ok(emissions >= 3 && emissions <= 5);
		});
	});

	it.should('cancel interval on unsubscribe', a => {
		const done = a.async();
		let cleared = false;

		const originalClearInterval = clearInterval;
		clearInterval = () => (cleared = true);

		const subscription = interval(10).subscribe(() => {});
		subscription.unsubscribe();

		// Using a slight delay to ensure proper teardown
		setTimeout(() => {
			a.ok(cleared);
			clearInterval = originalClearInterval; // Restore the original method
			done();
		}, 10);
	});

	it.should('stop emissions on unsubscribe', async a => {
		let emissions = 0;
		const subscription = interval(5).subscribe(() => emissions++);
		await new Promise(resolve => setTimeout(resolve, 15));
		subscription.unsubscribe();

		const prevEmissions = emissions;
		await new Promise(resolve => setTimeout(resolve, 15));
		a.equal(emissions, prevEmissions);
	});

	it.should('not emit when created with a negative period', async a => {
		let emissions = 0;
		a.throws(() => {
			interval(-5).subscribe(() => emissions++);
		});
	});
});
