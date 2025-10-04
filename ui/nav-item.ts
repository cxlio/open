import { Slot, component } from './component.js';
import { ItemBase } from './item.js';
import {
	Size,
	sizeAttribute,
	css,
	disabledStyles,
	buildMask,
	font,
} from './theme.js';
import { activeRipple } from './ripple.js';
import { role } from './a11y.js';

declare module './component' {
	interface Components {
		'c-nav-item': NavItem;
	}
}

export const navItemComponent = [
	css(`
:host {
	--cxl-color-on-surface: var(--cxl-color-on-surface-variant);
	--cxl-color-ripple: var(--cxl-color-secondary-container);
	background-color: var(--cxl-color-surface);
	color: var(--cxl-color-on-surface);
	${font('label-large')}
	box-sizing: border-box;
	position: relative;
	cursor: pointer;
	border-radius: 28px;
	overflow:hidden;
	display: flex;
	padding: 4px 16px;
	min-height: 56px;
	align-items: center;
	column-gap: 16px;
	-webkit-tap-highlight-color: transparent;
	z-index: 0;
}
:host(:focus-visible) { z-index: 1; }
:host(:focus-visible) slot {
	outline: 3px auto var(--cxl-color-secondary);
}
:host([selected]) {
	--cxl-color-on-surface: var(--cxl-color-on-secondary-container);
	background-color: var(--cxl-color-secondary-container);
	font-weight: var(--cxl-font-weight-label-large-prominent);
}
/** Avoid accessibility errors with background */
:host([selected]) c-ripple { background-color: var(--cxl-color-surface); }
c-ripple { z-index: -1 }
:host([dense]) { min-height:48px; }
${buildMask('c-ripple')}
	`),
	disabledStyles,
	activeRipple,
	Slot,
];

/**
 * Navigation item component intended for use within menus or navigational lists.
 *
 * @title Interactive Navigation List Element
 * @icon list
 * @tagName c-nav-item
 * @demo
 * <script>
 * function toggle(ev) {
 *   for(const child of document.body.querySelectorAll('c-nav-item')) child.selected=false;
 *   ev.currentTarget.selected = !ev.currentTarget.selected;
 * }
 * </script>
 * <div style="width: 240px">
 *   <c-nav-item selected onclick="toggle(event)"><c-icon role="none" name="inbox"></c-icon> Selected Item</c-nav-item>
 *   <c-nav-item onclick="toggle(event)"><c-icon role="none" name="send"></c-icon> Navigation Item</c-nav-item>
 *   <c-nav-item onclick="toggle(event)"><c-icon role="none" name="favorite"></c-icon> Navigation Item</c-nav-item>
 * </div>
 */
export class NavItem extends ItemBase {
	/**
	 * Specifies the size of the navigation item. Adjusts the component's minimum height accordingly.
	 *
	 * @attribute
	 * @demo
	 * <div style="width: 240px">
	 *   <c-nav-item size="-1" selected><c-icon role="none" name="inbox"></c-icon> Selected Item</c-nav-item>
	 *   <c-nav-item size="-1"><c-icon role="none" name="send"></c-icon> Navigation Item</c-nav-item>
	 * </div>
	 */
	size?: Size;
}

component(NavItem, {
	tagName: 'c-nav-item',
	init: [sizeAttribute('size', size => `{min-height:${56 + size * 8}px}`)],
	augment: [role('option'), ...navItemComponent],
});
