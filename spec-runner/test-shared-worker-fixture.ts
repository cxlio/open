import { spec } from '../spec/index.js';

export default spec('shared worker fixture', s => {
	s.test('dynamic import', async a => {
		const worker = new SharedWorker('./test-shared-worker.js', {
			type: 'module',
		});
		const value = await new Promise<unknown>((resolve, reject) => {
			worker.port.addEventListener('message', event => resolve(event.data), {
				once: true,
			});
			worker.addEventListener('error', reject, { once: true });
			worker.port.start();
		});
		worker.port.close();
		a.equal(value, 42);
	});
});
