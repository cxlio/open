import { spec } from '../spec/index.js';

export default spec('managed proxy fixture', async s => {
	await s.proxy('/managed', {
		target: 'http://127.0.0.1:43123',
		command: 'node',
		args: ['./test-proxy-server.js'],
	});
	await new Promise(resolve => setTimeout(resolve, 200));

	s.test('forwards requests', async a => {
		const response = await fetch('/managed/hello?value=1');
		a.equal(await response.text(), 'GET /hello?value=1 ');
	});
});
