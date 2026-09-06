interface SharedWorkerConnectEvent extends Event {
	readonly ports: MessagePort[];
}

const dependency = import('./test-shared-worker-dependency.js');
const scope = globalThis as typeof globalThis & {
	onconnect: ((event: SharedWorkerConnectEvent) => void) | null;
};

scope.onconnect = event => {
	const port = event.ports[0];
	dependency.then(
		module => port?.postMessage(module.value),
		error => port?.postMessage(String(error)),
	);
};
