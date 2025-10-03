import { Component, attributeChanged, get, message } from './component.js';
import { on } from './dom.js';
import { merge } from './rx.js';

declare module './dom.js' {
	interface CustomEventMap {
		'focusable.change': void;
	}
}

export interface FocusableComponent extends Component {
	disabled: boolean;
	touched: boolean;
}

export function disabledAttribute(host: Component & { disabled: boolean }) {
	return get(host, 'disabled').tap(value =>
		value
			? host.setAttribute('aria-disabled', 'true')
			: host.removeAttribute('aria-disabled'),
	);
}

export function focusableDisabled<T extends Component & { disabled: boolean }>(
	host: T,
	element: HTMLElement = host,
	tabIndex = 0,
) {
	const initial = element.hasAttribute('tabindex')
		? element.tabIndex
		: tabIndex;

	return disabledAttribute(host).tap(value => {
		if (value) element.removeAttribute('tabindex');
		else element.tabIndex = initial;
	});
}

export function focusableEvents<
	T extends Component & { disabled: boolean; touched: boolean },
>(host: T, element: HTMLElement = host) {
	return merge(
		on(element, 'focusout').tap(() => (host.touched = true)),
		merge(
			attributeChanged(host as FocusableComponent, 'disabled'),
			attributeChanged(host as FocusableComponent, 'touched'),
		).tap(() => message(host, 'focusable.change')),
	);
}

export function focusable<
	T extends Component & { disabled: boolean; touched: boolean },
>(host: T, element: HTMLElement = host, tabIndex = 0) {
	return merge(
		focusableDisabled(host, element, tabIndex),
		focusableEvents(host, element),
	);
}
