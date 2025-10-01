import { spec } from './index.js';

export default spec('spec', s => {
	s.test('should load', a => {
		a.ok(spec);
	});
});
