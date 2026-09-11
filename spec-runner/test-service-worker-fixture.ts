import { spec } from '../spec/index.js';

export default spec('service worker fixture', s => {
	s.test('module import', async a => {
		const registration = await navigator.serviceWorker.register(
			'./service-worker.js',
			{ type: 'module' },
		);
		try {
			const installing = registration.installing;
			if (installing && installing.state !== 'activated')
				await new Promise<void>((resolve, reject) => {
					installing.addEventListener('statechange', () => {
						if (installing.state === 'activated') resolve();
						else if (installing.state === 'redundant')
							reject(new Error('Service worker became redundant.'));
					});
				});
			const value = await new Promise<unknown>((resolve, reject) => {
				const channel = new MessageChannel();
				channel.port1.addEventListener(
					'message',
					event => resolve(event.data),
					{ once: true },
				);
				channel.port1.start();
				const worker =
					registration.active ??
					registration.waiting ??
					registration.installing;
				if (worker) worker.postMessage(undefined, [channel.port2]);
				else reject(new Error('Service worker is not running.'));
			});
			a.equal(value, 42);
		} finally {
			await registration.unregister();
		}
	});
});
