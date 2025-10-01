import {
	EMPTY,
	Observable,
	defer,
	of,
	concat,
	operator,
	merge,
	combineLatest,
} from '../rx/index.js';

export interface CustomEventMap {
	core: unknown;
	'toggle.close': string | void;
	'toggle.open': string | undefined;
}

export type AttributeMutationEvent<T extends EventTarget> = {
	type: 'attribute';
	target: T;
	value: unknown;
};

export type MutationEvent<T extends EventTarget = EventTarget> =
	| {
			type: 'added' | 'removed';
			target: T;
			value: Node;
	  }
	| {
			type: 'characterData';
			target: T;
	  }
	| AttributeMutationEvent<T>;

export function empty(el: Element | DocumentFragment) {
	let c: Node;
	while ((c = el.childNodes[0])) el.removeChild(c);
}

export function on<K extends keyof WindowEventMap>(
	element: Window,
	event: K,
	options?: AddEventListenerOptions,
): Observable<WindowEventMap[K]>;
export function on<K extends keyof HTMLElementEventMap>(
	element: EventTarget,
	event: K,
	options?: AddEventListenerOptions,
): Observable<HTMLElementEventMap[K]>;
export function on<T extends HTMLElement, K extends string>(
	element: T,
	event: K,
	options?: AddEventListenerOptions,
): Observable<CustomEvent<EventDetail<T, K>>>;
export function on(
	element: EventTarget | Window,
	event: string,
	options?: AddEventListenerOptions,
): Observable<Event> {
	return new Observable<Event>(subscriber => {
		const handler = subscriber.next.bind(subscriber);
		element.addEventListener(event, handler, options);
		subscriber.signal.subscribe(() =>
			element.removeEventListener(event, handler, options),
		);
	});
}

export function onChildrenMutation(target: Node) {
	return onMutation(target, { childList: true });
}

export function onAttributeMutation(target: Node, attributeFilter?: string[]) {
	return onMutation(target, {
		attributes: true,
		attributeFilter,
	});
}

export function onMutation(
	target: Node,
	options: MutationObserverInit = { attributes: true, childList: true },
) {
	return new Observable<MutationEvent>(subs => {
		const observer = new MutationObserver(events =>
			events.forEach(ev => {
				for (const value of ev.addedNodes)
					subs.next({ type: 'added', target, value });
				for (const value of ev.removedNodes)
					subs.next({ type: 'removed', target, value });
				if (ev.type === 'characterData')
					subs.next({
						type: 'characterData',
						target,
					});
				else if (ev.attributeName)
					subs.next({
						type: 'attribute',
						target,
						value: ev.attributeName,
					});
			}),
		);
		observer.observe(target, options);
		subs.signal.subscribe(() => observer.disconnect());
	});
}

export function onKeyAction(el: Element) {
	return on(el, 'keydown').filter(ev => {
		if (ev.key === ' ' || ev.key === 'Enter') {
			ev.preventDefault();
			return true;
		}
		return false;
	});
}

export function onAction(el: Element) {
	return on(el, 'click');
}

export function onIntersection(
	target: Element,
	options?: IntersectionObserverInit,
) {
	return new Observable<IntersectionObserverEntry>(subs => {
		const observer = new IntersectionObserver(events => {
			for (const ev of events) subs.next(ev);
		}, options);
		observer.observe(target);
		subs.signal.subscribe(() => observer.disconnect());
	});
}

/**
 * Emits a boolean indicating whether the target element is currently visible within the viewport.
 * Useful for monitoring visibility changes of elements for conditional behaviors.
 */
export function onVisibility(target: Element) {
	return onIntersection(target).map(ev => ev.isIntersecting);
}

/**
 * This utility function creates an observable that emits when the target element
 * becomes visible.
 * Ideal for triggering one-time behaviors when an element becomes visible to the user.
 */
export function onVisible(target: Element) {
	return onIntersection(target)
		.filter(ev => ev.isIntersecting)
		.first();
}

export function debounceRaf<A extends unknown[], R>(fn: (...a: A) => R) {
	let to: number;
	return function (this: unknown, ...args: A) {
		if (to) cancelAnimationFrame(to);
		to = requestAnimationFrame(() => {
			fn.apply(this, args);
			to = 0;
		});
	};
}

export function debounceImmediate<A extends unknown[], R>(fn: (...a: A) => R) {
	let to: boolean;
	return function (this: unknown, ...args: A) {
		if (to) return;
		to = true;
		queueMicrotask(() => {
			to = false;
			fn.apply(this, args);
		});
	};
}

export function raf<T>(fn?: (val: T) => void) {
	return operator<T>(subscriber => {
		const next = debounceRaf((val: T) => {
			if (subscriber.closed) return;
			if (fn) fn(val);
			subscriber.next(val);
			if (completed) subscriber.complete();
		});
		let completed = false;
		return {
			next,
			complete: () => (completed = true),
		};
	});
}

/**
 * Creates an observable that emits once the DOM is fully loaded.
 * Useful for deferring actions dependent on document readiness.
 */
export function onReady() {
	return defer(() =>
		document.readyState !== 'loading'
			? of(true)
			: on(window, 'DOMContentLoaded')
					.first()
					.map(() => true),
	);
}

/*export function fontsReady() {
	return new Promise<void>(resolve => {
		const done = () => {
			if (document.fonts.status === 'loaded') {
				document.fonts.removeEventListener('loadingdone', done);
				resolve();
			}
		};
		requestAnimationFrame(() => {
			if (document.fonts.status === 'loaded') done();
			else document.fonts.addEventListener('loadingdone', done);
		});
	});
}*/

export function trigger<
	K extends keyof HTMLElementEventMap | keyof WindowEventMap,
>(el: EventTarget, event: K, options?: CustomEventInit): void;
export function trigger<T extends HTMLElement, K extends string>(
	el: T,
	event: K,
	options: CustomEventInit<EventDetail<T, K>>,
): void;
export function trigger(
	el: EventTarget,
	event: string,
	options?: CustomEventInit,
) {
	const ev = new CustomEvent(event, options);
	el.dispatchEvent(ev);
}

export function observeChildren(
	el: Element,
	options?: { subtree?: boolean },
): Observable<void> {
	let children: NodeListOf<ChildNode>;
	return merge(
		defer(() => {
			children = el.childNodes;
			return children ? of(children) : EMPTY;
		}),
		onMutation(el, { childList: true, ...options }),
		onLoad().switchMap(() => {
			if (el.childNodes !== children) {
				children = el.childNodes;
				return of(children);
			}
			return EMPTY;
		}),
	) as unknown as Observable<void>;
}

export function onLoad() {
	return defer(() =>
		document.readyState === 'complete'
			? of(true)
			: on(window, 'load')
					.first()
					.map(() => true),
	);
}

export function onResize(...els: Element[]) {
	return new Observable<ResizeObserverEntry>(subs => {
		const observer = new ResizeObserver(ev =>
			ev.forEach(r => subs.next(r)),
		);
		for (const el of els) observer.observe(el);
		subs.signal.subscribe(() => observer.disconnect());
	});
}

/**
 * @deprecated
 * This function might cause layout recalculation.
 */
export function isHidden(target: HTMLElement) {
	return (
		target.offsetParent === null &&
		!(target.offsetWidth && target.offsetHeight)
	);
}

export function isFocusable(el: Node): boolean {
	return (
		!(el as HTMLInputElement).disabled &&
		el instanceof HTMLElement &&
		(el.offsetParent !== null || !!(el.offsetWidth && el.offsetHeight)) &&
		(el.tabIndex !== -1 ||
			el.contentEditable === 'true' ||
			el.hasAttribute('tabindex'))
	);
}

export function nodeSort(a: Node, b: Node) {
	return a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_PRECEDING
		? 1
		: -1;
}

export function onEvent(
	css: string,
	onEv: keyof HTMLElementEventMap,
	offEv: keyof HTMLElementEventMap,
) {
	return ($: Element) =>
		concat(
			of(css ? $.matches(css) : false),
			on($, onEv).switchMap(() =>
				merge(
					of(true),
					on($, offEv).map(() => (css ? $.matches(css) : false)),
				),
			),
		);
}

export const animated = onEvent('', 'animationstart', 'animationend');

export const hovered = onEvent('', 'mouseenter', 'mouseleave');
export const focused = onEvent(':focus,:focus-within', 'focusin', 'focusout');
export const hoveredOrFocused = ($: Element) =>
	combineLatest(hovered($), focused($)).map(([a, b]) => a || b);

export function onKeypress(
	el: Element | Window,
	key?: string,
	options?: AddEventListenerOptions,
) {
	key = key?.toLowerCase();
	return on(el, 'keydown', options).filter(
		// ev.key can be undefined in chrome, when autofilling
		(ev: KeyboardEvent) => !key || ev.key?.toLowerCase() === key,
	);
}

export function isKeyboardClick(ev: Event) {
	// Safari might not fire pointer event
	return (
		(ev instanceof PointerEvent && ev.pointerType === '') ||
		(ev instanceof MouseEvent && ev.type === 'click' && ev.detail === 0)
	);
}

export function getRoot($: Node) {
	const root = $.getRootNode();
	return root instanceof Document || root instanceof ShadowRoot
		? root
		: undefined;
}

export function getActiveElement($: Node) {
	return getRoot($)?.activeElement ?? null;
}

export type EventDetail<T, K extends string> = T[Extract<
	keyof T,
	`on${K}`
>] extends ((e: CustomEvent<infer D>) => void) | undefined
	? D
	: never;
