import { spec } from '../spec/index.js';

console.log('browser console output');

export default spec('console fixture', s => {
	s.test('passes', a => {
		a.ok(true);
	});
});
