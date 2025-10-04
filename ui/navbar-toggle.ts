import { toggleComponent } from './toggle.js';
import { attribute, component, property } from './component.js';
import { IconButton } from './icon-button.js';

import type { ToggleTarget } from './toggle-target.js';

declare module './component' {
	interface Components {
		'c-navbar-toggle': NavbarToggle;
	}
}

/**
 * Represents a button that controls the open state of a target navigation element.
 * Intended for use in responsive layouts to toggle visibility of a connected nav
 * container, such as a side drawer, using a reference by ID or direct element.
 *
 * @title Navbar Menu Toggle Button
 * @icon menu
 * @see Appbar
 * @tagName c-navbar-toggle
 * @demo
 * <div style="height:140px;width:100%">
 * <c-appbar>
 *   <c-navbar-toggle title="Open navigation menu" target="drawer"></c-navbar-toggle>
 *   <c-appbar-title>Appbar Title</c-appbar-title>
 * </c-appbar>
 * <c-drawer id="drawer">Navbar</c-drawer>
 * </div>
 */
export class NavbarToggle extends IconButton {
	/**
	 * This attribute controls the initial visibility state of the target element.
	 */
	open = false;

	/**
	 * This attribute specifies the ID or a reference to the element that should be shown/hidden when the toggle is interacted with.
	 * @attribute
	 */
	target?: string | ToggleTarget;

	icon = 'menu';
}

component(NavbarToggle, {
	tagName: 'c-navbar-toggle',
	init: [attribute('target'), property('open')],
	augment: [
		$ => toggleComponent($).tap(({ target, open }) => (target.open = open)),
	],
});
