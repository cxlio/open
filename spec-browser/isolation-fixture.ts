import { spec } from '../spec/index.js';

export default spec('iframe fixture', s => {
	s.test('must not run', a => {
		a.ok(false);
	});

	s.test('has a fresh global scope', a => {
		a.equal(window.name, '');
		window.name = 'mutated';
	});
});
