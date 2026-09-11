import { value } from './service-worker-dependency.js';

interface ExtendableEvent extends Event {
	waitUntil(promise: Promise<unknown>): void;
}

interface ServiceWorkerMessageEvent extends Event {
	readonly ports: readonly { postMessage(message: unknown): void }[];
}

const scope = globalThis as typeof globalThis & {
	clients: { claim(): Promise<void> };
	skipWaiting(): Promise<void>;
	addEventListener(
		type: 'install' | 'activate',
		listener: (event: ExtendableEvent) => void,
	): void;
	addEventListener(
		type: 'message',
		listener: (event: ServiceWorkerMessageEvent) => void,
	): void;
};

scope.addEventListener('install', event => {
	(event as ExtendableEvent).waitUntil(scope.skipWaiting());
});

scope.addEventListener('activate', event => {
	(event as ExtendableEvent).waitUntil(scope.clients.claim());
});

scope.addEventListener('message', event => {
	event.ports[0]?.postMessage(value);
});
