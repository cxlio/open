import { spec } from '../spec/index.js';

export default spec('iframe URL', s => {
	s.test('resolves relative URLs from browser document URLs', a => {
		const expected = new URL('./', import.meta.url).href;
		a.equal(new URL('./', location.href).href, expected);
		a.equal(new URL('./', document.baseURI).href, expected);
	});
});
