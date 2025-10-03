import {
	Component,
	component,
	Slot,
	styleAttribute,
	get,
} from './component.js';
import { EMPTY, merge } from './rx.js';
import { onKeyAction } from './dom.js';
import { Size, colorAttribute, sizeAttribute } from './theme.js';

import { role } from './a11y.js';
import { focusable } from './focusable.js';
import {
	SurfaceColorValue,
	css,
	disabledStyles,
	maskStyles,
	font,
} from './theme.js';
import { ripple } from './ripple.js';

declare module './component' {
	interface Components {
		'c-button': Button;
	}
}

export const buttonBaseStyles = [
	disabledStyles,
	maskStyles,
	css(`
:host {
	box-sizing: border-box;
	position: relative;
	transition: box-shadow var(--cxl-speed);
}
:host(:hover) {
	box-shadow: var(--cxl-elevation-1);
}
:host(:active) { box-shadow: var(--cxl-elevation-0); }
:host(:focus-visible) {
	outline: 3px auto var(--cxl-color-secondary);
}
:host([disabled]) {
	background-color: color-mix(in srgb, var(--cxl-color--on-surface) 12%, transparent);
	color: color-mix(in srgb, var(--cxl-color--on-surface) 38%, transparent);
}
:host([variant=elevated]) {
	--cxl-color-surface: var(--cxl-color--surface-container-low);
	box-shadow: var(--cxl-elevation-1);
}
:host([variant=elevated]:hover) {
	box-shadow: var(--cxl-elevation-2);
}
:host([variant=elevated]:active) {
	box-shadow: var(--cxl-elevation-1);
}
:host([variant=elevated][disabled]) { box-shadow: none; }
:host([variant=outlined][disabled]) {
	border-color: color-mix(in srgb, var(--cxl-color-on-surface) 12%, transparent);
}	
:host([variant=outlined][disabled]),:host([variant=text][disabled]) {
	background-color: transparent;
	box-shadow: none;
}`),
];

export const buttonStyles = css(`
:host {
	${font('label-large')}
	user-select: none;
	cursor: pointer;
	overflow: hidden;
	display: inline-flex;
	justify-content: center;
	align-items: center;
	column-gap: 8px;
	line-height: unset;
	white-space: nowrap;
	border-radius: var(--cxl-shape-corner-full);
	align-self: center;
}
:host([variant=outlined]:hover),:host([variant=text]:hover) {
	box-shadow: none;
}
:host([variant=text]) { margin: -10px -12px; }
:host([variant=text]:not([disabled])) {
	background-color: transparent;
	color: var(--cxl-color-primary);
}
:host([variant=text]),:host([variant=outlined]) {
	--cxl-color-on-surface: var(--cxl-color--primary);
	--cxl-color-surface: var(--cxl-color--surface);
}
:host([variant=outlined]) {
	border: 1px solid var(--cxl-color-outline);
	background-color: transparent;
}
:host([variant=elevated]) {
	--cxl-color-on-surface: var(--cxl-color-primary);
}
`);

export function buttonKeyboardBehavior(
	host: Component & { disabled: boolean },
) {
	return get(host, 'disabled').switchMap(value =>
		value
			? EMPTY
			: onKeyAction(host).tap(ev => {
					ev.stopPropagation();
					host.click();
			  }),
	);
}

export function buttonBehavior(
	host: Component & { disabled: boolean; touched: boolean },
) {
	return merge(buttonKeyboardBehavior(host), focusable(host));
}

/**
 * The ButtonBase component serves as the foundation for various button types.
 * It provides a core set behaviors, and interaction logic, which can be extended
 * by other button components to offer more specific appearances and functionalities.
 */
export class ButtonBase extends Component {
	/**
	 * When set to true, disables the button interaction.
	 * @attribute
	 */
	disabled = false;

	/**
	 * Indicates whether the item has been interacted with.
	 * @attribute
	 */
	touched = false;
}

component(ButtonBase, {
	init: [styleAttribute('disabled'), styleAttribute('touched')],
	augment: [role('button'), buttonBehavior],
});

/**
 * The Button component extends ButtonBase to provide a fully styled, interactive button element.
 * It offers customization options such as color, size, and elevation.
 * It supports keyboard navigation and visual feedback for interactions.
 *
 * @tagName c-button
 * @title Button component
 * @icon smart_button
 * @example
 *   <c-button>Filled button</c-button>
 * @demo <caption>Disabled</caption>
	<c-button disabled>Button</c-button>
	<c-button disabled color="primary">Primary</c-button>
	<c-button disabled variant="outlined" color="secondary">Secondary</c-button>
	<c-button disabled variant="text" color="error">Error</c-button>
	<c-button disabled variant="elevated" color="secondary">Secondary</c-button>
 * @demo <caption>With Icon</caption>
	<c-button><c-icon name="help"></c-icon> Help</c-button>
	<c-button color="inverse-surface"><c-icon name="help"></c-icon> Help</c-button>	
 */
export class Button extends ButtonBase {
	/**
	 * Set the `size` attribute to scale button dimensions and text.
	 *
	 * @attribute
	 * @demo
		 <c-button size="-1">Button</c-button>
		 <c-button size="0" color="secondary">Secondary</c-button>
		 <c-button size="1" color="tertiary">Tertiary</c-button>
		 <c-button size="2" color="error">Error</c-button>
		 <c-button size="3" color="success">Success</c-button>
		 <c-button size="4" color="warning">Warning</c-button>
	 */
	size?: Size;

	/**
	 * Sets the color of the button. This applies to both the button text and the ripple effect.
	 *
	 * @attribute
	 * @demo
		<c-button>Button</c-button>
		<c-button color="secondary">Secondary</c-button>
		<c-button color="tertiary">Tertiary</c-button>
		<c-button color="secondary-container">Tonal</c-button>
	 */
	color?: SurfaceColorValue;

	/**
	 * Specifies the visual style of the button.
	 * `filled` (default): Solid button with primary color background.
	 * `elevated` Renders the button with a raised shadowed appearance.
	 * `outlined` Displays the button with a border and no background fill.
	 * `text` Renders the button with no elevation and a flat appearance.
	 *
	 * @attribute
	 * @demo
	 * <c-button variant="elevated">Elevated Button</c-button>
	 * <c-button variant="outlined">Outlined Button</c-button>
	 * <c-button variant="text">Text Button</c-button>
	 */
	variant?: 'elevated' | 'outlined' | 'text' | 'filled';
}

component(Button, {
	tagName: 'c-button',
	init: [
		sizeAttribute(
			'size',
			s => `{
			font-size: ${14 + s * 4}px;
			min-height: ${40 + s * 8}px;
			padding-right: ${16 + s * 4}px;
			padding-left: ${16 + s * 4}px;
		}`,
		),
		colorAttribute('color', 'primary'),
		styleAttribute('variant'),
	],
	augment: [...buttonBaseStyles, buttonStyles, ripple, Slot],
});
