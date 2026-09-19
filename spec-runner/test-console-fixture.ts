import { spec } from '@cxl/spec';

console.log('browser console output');

export default spec('console fixture', s => {
	s.test('passes', a => {
		a.ok(true);
	});
});
