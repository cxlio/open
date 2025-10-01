import { spec } from '../spec/index.js';
import browserRunner from './runner-puppeteer.js';

export default spec('tester', s => {
	s.test('browser-runner', a => {
		a.ok(browserRunner);
	});
});
