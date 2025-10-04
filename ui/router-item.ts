import { attribute, component } from './component.js';
import { NavItem } from './nav-item.js';
import { routerSelectable } from './router-selectable.js';

/**
 * Defines a navigation item component with router integration, supporting dynamic
 * href binding, external links, and keyboard interaction handling.
 * @beta
 */
export class RouterItem extends NavItem {
	href?: string;
	external = false;
	target?: '_blank';
}

component(RouterItem, {
	tagName: 'c-router-item',
	init: [attribute('href'), attribute('external'), attribute('target')],
	augment: [
		$ =>
			routerSelectable($).tap(isSelected => {
				$.selected = isSelected;
			}),
	],
});
