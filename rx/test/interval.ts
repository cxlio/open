import { interval } from '../index.js';
import { spec } from '../../spec/index.js';
import { mockSetInterval } from './util.js';

declare const setTimeout: (fn: (a?: unknown) => unknown, n?: number) => number;
declare let clearInterval: (n: number) => void;
declare let setInterval: (fn: () => unknown, n?: number) => number;

export default spec('interval', it => {
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
