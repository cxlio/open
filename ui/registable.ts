import { Observable } from './rx.js';
import { Component, message, onMessage } from './component.js';

import type { Input } from './input.js';

declare module './dom.js' {
	interface CustomEventMap extends Events {}
}

/*eslint @typescript-eslint/no-empty-object-type: off */
export interface RegistableMap {
	form: Input;
}

export interface RegistableDetail<K extends keyof RegistableMap> {
	id: K;
	controller?: RegistableMap[K];
	unsubscribe?: () => void;
	target: EventTarget;
}

export interface RegistableEvent<T> {
	type: 'connect' | 'disconnect';
	target: T;
	element: EventTarget;
	elements: Set<T>;
}

export interface OrderedRegistableEvent<T> {
	type: 'connect' | 'disconnect';
	target: T;
	//element: EventTarget;
	elements: readonly T[];
}

type ElementRegistable = {
	[K in keyof RegistableMap]: RegistableMap[K] extends HTMLElement
		? RegistableMap[K]
		: never;
};

export function registable<K extends keyof RegistableMap>(
	id: K,
	target: RegistableMap[K] extends Element ? RegistableMap[K] : never,
): Observable<never>;
export function registable<K extends keyof RegistableMap>(
	id: K,
	target: Component,
	controller: RegistableMap[K],
): Observable<never>;
export function registable<K extends keyof RegistableMap>(
	id: K,
	target: Component,
	controller?: RegistableMap[K],
) {
	return new Observable(subs => {
		const detail: RegistableDetail<K> = { id, controller, target };
		/*onLoad().subscribe({
			next: () => message(target, `registable.${id}`, detail),
			signal: subs.signal,
		});*/
		message(target, `registable.${id}`, detail);
		subs.signal.subscribe(() => detail.unsubscribe?.());
	});
}

/**
 * We use a callback here because when the host element disconnects, the observable closes.
 * This ensures any cleanup or updates can happen right before everything shuts down.
 */
export function registableHostOrdered<K extends keyof ElementRegistable>(
	id: K,
	host: Component,
	elements: ElementRegistable[K][],
	callback?: (ev: OrderedRegistableEvent<ElementRegistable[K]>) => void,
) {
	return new Observable<void>(subs => {
		function register(ev: RegistableDetail<keyof RegistableMap>) {
			const target = ev.target as ElementRegistable[K];
			ev.unsubscribe = () => {
				const i = elements.indexOf(target);
				if (i !== -1) elements.splice(i, 1);
				callback?.({ type: 'disconnect', target, elements });
				subs.next();
			};

			const existing = elements.indexOf(target);
			if (existing !== -1) elements.splice(existing, 1);

			const index = elements.findIndex(
				el =>
					el.compareDocumentPosition(target) &
					Node.DOCUMENT_POSITION_PRECEDING,
			);

			if (index === -1) elements.push(target);
			else elements.splice(index, 0, target);

			callback?.({ type: 'connect', target: target, elements });
			subs.next();
		}

		// The event id needs to be unique, so we don't interfere with other registable events.
		const inner = onMessage(host, `registable.${id}`).subscribe(register);
		subs.signal.subscribe(inner.unsubscribe);
	});
}

export function registableHost<K extends keyof RegistableMap>(
	id: K,
	host: Component,
	elements = new Set<RegistableMap[K]>(),
) {
	return new Observable<RegistableEvent<RegistableMap[K]>>(subs => {
		function register(ev: RegistableDetail<keyof RegistableMap>) {
			const element = ev.target;
			const target = (ev.controller || ev.target) as RegistableMap[K];
			ev.unsubscribe = () => {
				elements.delete(target);
				subs.next({
					type: 'disconnect',
					target,
					element,
					elements,
				});
			};
			elements.add(target);
			subs.next({ type: 'connect', target, element, elements });
		}

		// The event id needs to be unique, so we don't interfere with other registable events.
		const inner = onMessage(host, `registable.${id}`).subscribe(register);
		subs.signal.subscribe(inner.unsubscribe);
	});
}

type Events = {
	[K in keyof RegistableMap as `registable.${K}`]: RegistableDetail<
		keyof RegistableMap
	>;
};
