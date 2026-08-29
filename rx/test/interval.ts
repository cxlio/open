import { interval } from '../index.js';
import { spec } from '../../spec/index.js';

export default spec('interval', it => {
	it.should('emit values at specified intervals', a => {
		const time = a.mockSetInterval();
		const period = 5;
		let emissions = 0;
		const subscription = interval(period).subscribe(() => emissions++);
		time.advance(20);
		subscription.unsubscribe();
		a.equal(emissions, 4);
	});

	it.should('stop emissions on unsubscribe', a => {
		const time = a.mockSetInterval();
		let emissions = 0;
		const subscription = interval(5).subscribe(() => emissions++);
		time.advance(15);
		subscription.unsubscribe();

		const prevEmissions = emissions;
		time.advance(30);
		a.equal(emissions, prevEmissions);
	});

	it.should('not emit when created with a negative period', a => {
		let emissions = 0;
		a.throws(() => {
			interval(-5).subscribe(() => emissions++);
		});
	});
});
