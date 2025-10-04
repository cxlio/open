import {
	Component,
	Slot,
	component,
	get,
	styleAttribute,
} from './component.js';
import { role } from './a11y.js';
import {
	Size,
	sizeAttribute,
	css,
	font,
	disabledStyles,
	maskStyles,
} from './theme.js';
import { buttonKeyboardBehavior } from './button.js';
import { ripple } from './ripple.js';
import { focusable } from './focusable.js';
import { registable } from './registable.js';
import { merge } from './rx.js';

declare module './component' {
	interface Components {
		'c-item': Item;
	}
}

declare module './registable' {
	interface RegistableMap {
		list: Component;
	}
}

export const itemStyles = css(`
:host {
	box-sizing: border-box;
	position: relative;
	display: flex;
	padding: 4px 16px;
	min-height: 56px;
	align-items: center;
	column-gap: 16px;
	${font('body-medium')}
}
:host([disabled]) { color: color-mix(in srgb, var(--cxl-color-on-surface) 38%, transparent); }
:host([selected]) {
	background-color: var(--cxl-color-secondary-container);
	color: var(--cxl-color-on-secondary-container);
}
`);

export function itemBehavior($: ItemBase) {
	return merge(
		registable('list', $),
		get($, 'selected').tap(v => ($.ariaSelected = String(v))),
	);
}

export function itemButtonBehavior($: ItemBase) {
	return merge(
		buttonKeyboardBehavior($),
		focusable($, $, -1),
		itemBehavior($),
	);
}

/**
 * The ItemBase class serves as the base class for menu items and potentially other similar components.
 */
export class ItemBase extends Component {
	/**
	 * A boolean indicating whether the item is disabled.
	 * @attribute
	 */
	disabled = false;

	/**
	 * Indicates whether the item has been interacted with via touch.
	 * @attribute
	 */
	touched = false;

	/**
	 * Indicates whether the item is selected.
	 * @attribute
	 */
	selected = false;
}

component(ItemBase, {
	init: [
		styleAttribute('disabled'),
		styleAttribute('touched'),
		styleAttribute('selected'),
	],
	augment: [itemButtonBehavior],
});

/**
 * Represents a flexible, interactive entry for menus, lists, or navigation panes.
 *
 * Can display icons, avatars, checkboxes, or any custom content by composition.
 *
 * Supports disabled and selected states, and visually adapts based on these states.
 *
 * Uses the `menuitem` ARIA role by default.
 *
 * @title List/Menu Item Component
 * @icon list
 * @tagName c-item
 * @example
 * <c-list aria-label="Item List">
 *   <c-item>
 *     <c-icon name="check" alt=""></c-icon>
 *     Single Line Icon
 *   </c-item>
 * </c-list>
 *
 * @example <caption>Two Line</caption>
 * <c-item>
 *   <c-icon name="person"></c-icon>
 *   <c-flex vflex>
 *     <c-t font="body-large">Headline</c-t>
 *     <c-t font="body-medium">Supporting Text</c-t>
 *   </c-flex>
 * </c-item>
 */
export class Item extends ItemBase {
	size?: Size;
}

component(Item, {
	tagName: 'c-item',
	init: [sizeAttribute('size', s => `{min-height:${56 + s * 8}px}`)],
	augment: [
		itemStyles,
		disabledStyles,
		maskStyles,
		role('option'),
		Slot,
		ripple,
	],
});
