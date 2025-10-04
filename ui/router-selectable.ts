import {
	Component,
	attribute,
	component,
	create,
	getShadow,
	message,
} from './component.js';
import { isKeyboardClick, on, onAction } from './dom.js';
import { defer, merge } from './rx.js';
import { bindHref, routerState, router } from './router.js';
import { displayContents } from './theme.js';

type Selectable = Component & { selected: boolean };

export function routerSelectable(
	host: RouterSelectable,
	clickHost: HTMLElement = host,
) {
	return merge(
		routerLink(host, clickHost).ignoreElements(),
		routerState.map(
			() => host.href !== undefined && router.isActiveUrl(host.href),
		),
	);
}

export function routerLink(host: Component, clickHost: HTMLElement = host) {
	const link = create('a', {
		tabIndex: -1,
		className: 'link',
		ariaLabel: 'link',
	});
	link.style.cssText = `
text-decoration: none;
outline: 0;
display: block;
position: absolute;
left: 0;
right: 0;
bottom: 0;
top: 0;
	`;
	getShadow(host).append(link);
	return merge(
		bindHref(host, link),
		on(link, 'click').tap(ev => {
			ev.stopPropagation();
			if (!isKeyboardClick(ev))
				host.dispatchEvent(new PointerEvent(ev.type, ev));
			message(host, 'toggle.close', undefined);
		}),
		onAction(clickHost).tap(ev => {
			// Handle keyboard click events received by the host
			if (isKeyboardClick(ev)) link.click();
		}),
	);
}

/**
 * Defines a custom element that integrates a selectable behavior with routing logic.
 *
 * @tagName c-router-selectable
 * @alpha
 */
export class RouterSelectable extends Component {
	href?: string;
}

component(RouterSelectable, {
	tagName: 'c-router-selectable',
	init: [attribute('href')],
	augment: [
		displayContents,
		() => create('slot'),
		$ =>
			defer(() => {
				const parent = $.parentElement as Selectable;
				return routerSelectable($, parent).raf(isSelected => {
					parent.selected = isSelected;
				});
			}),
	],
});
