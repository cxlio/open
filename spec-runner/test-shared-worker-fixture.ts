import { spec } from '@cxl/spec';

export default spec('shared worker fixture', s => {
	s.test('dynamic import with missing import', async a => {
		const src = URL.createObjectURL(
			new Blob(
				['import "https://cxl-tester/missing-worker-import.js";'],
				{
					type: 'text/javascript',
				},
			),
		);
		const worker = new SharedWorker(src, { type: 'module' });
		const liveWorker = new SharedWorker('./shared-worker.js', {
			type: 'module',
		});
		try {
			const [error, value] = await Promise.all([
				new Promise<Event>(resolve => {
					worker.addEventListener(
						'error',
						event => {
							event.preventDefault();
							resolve(event);
						},
						{ once: true },
					);
					worker.port.start();
				}),
				new Promise<unknown>((resolve, reject) => {
					liveWorker.port.addEventListener(
						'message',
						event => resolve(event.data),
						{
							once: true,
						},
					);
					liveWorker.addEventListener('error', reject, {
						once: true,
					});
					liveWorker.port.start();
				}),
			]);
			a.equal(error.type, 'error');
			a.equal(value, 42);
		} finally {
			worker.port.close();
			liveWorker.port.close();
			URL.revokeObjectURL(src);
		}
	});
});
