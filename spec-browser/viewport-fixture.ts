import { spec } from '../spec/index.js';

export default spec('iframe viewport', s => {
	s.test('matches parent dimensions', a => {
		a.equal(window.innerWidth, parent.innerWidth);
		a.equal(window.innerHeight, parent.innerHeight);
	});
});
