import { spec } from '@cxl/spec';
import {  } from './index.js';

export default spec('core', s => {
	s.test('should load', a => {
		a.ok(get);
	});
});
