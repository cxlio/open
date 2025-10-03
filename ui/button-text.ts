import { Slot, component } from './component.js';
import { css, font } from './theme.js';
import { ButtonBase, buttonBaseStyles } from './button.js';
import { ripple } from './ripple.js';

declare module './component.js' {
	interface Components {
		'c-button-text': ButtonText;
	}
}

/**
 * This component extends the base `Button` component and provides a minimalistic,
 * text-only button style suitable for inline actions or secondary UI elements.
 *
 * @see Button
 *
 * @tagName c-button-text
 * @title Minimal inline action button
 * @icon touch_app
 * @demo
 * <c-button-text>Text Button</c-button-text>
 * <c-button-text disabled>Disabled Button</c-button-text>
 */
export class ButtonText extends ButtonBase {}

component(ButtonText, {
	tagName: 'c-button-text',
	augment: [
		...buttonBaseStyles,
		css(`
:host {
	${font('label-large')}
	padding: 0 12px; border-radius: var(--cxl-shape-corner-full);
	flex-shrink: 0;
	margin: -10px -12px;
	background-color: transparent;
	color: var(--cxl-color-primary);
	cursor: pointer;
	overflow: hidden;
	display: inline-flex;
	justify-content: center;
	align-items: center;
	column-gap: 8px;
	line-height: unset;
	min-height: 40px;
	align-self: center;
}
:host([disabled]) {
	color: color-mix(in srgb, var(--cxl-color--on-surface) 38%, transparent);
	background-color: transparent;
}
:host(:hover) { box-shadow: none; }
		`),
		ripple,
		Slot,
	],
});
