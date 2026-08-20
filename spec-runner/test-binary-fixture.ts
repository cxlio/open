import { spec } from '../spec/index.js';

const expected = new Uint8Array([0, 127, 128, 255, 195, 40, 226, 40, 161]);

export default spec('binary fixture', s => {
	s.test('preserves binary static files', async a => {
		const response = await fetch('/spec-runner/test-binary-data.gbm');
		a.equal(response.headers.get('content-type'), 'application/octet-stream');
		a.equalBuffer(await response.arrayBuffer(), expected.buffer);
	});
});
