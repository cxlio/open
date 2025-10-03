import { component } from './component.js';
import { css } from './theme.js';
import { Button } from './button.js';

declare module './component.js' {
	interface Components {
		'c-button-round': ButtonRound;
	}
}

/**
 * The `c-button-round` web component extends the base `Button` to provide a compact,
 * circular button ideal for scenarios where icons are used instead of text.
 *
 * Its shape and size make it suitable for toolbars, tool palettes, floating action buttons (FABs), and quick-access actions.
 *
 * @title Round Button component
 * @icon circle
 * @see Icon
 * @see IconButton
 *
 * @tagName c-button-round
 * @demo
 * <c-button-round variant="text" aria-label="search">
 *   <c-icon name="search"></c-icon>
 * </c-button-round>
 * <c-button-round  color="primary" aria-label="notifications icon">
 *   <c-icon  name="notifications" width="48"></c-icon>
 * </c-button>
 */
export class ButtonRound extends Button {}

component(ButtonRound, {
	tagName: 'c-button-round',
	augment: [
		css(`
:host { min-width:40px; min-height: 40px; padding: 4px; border-radius: 100%; flex-shrink: 0; }
:host([variant=text]) { margin: -8px; }
:host([variant=text]:not([disabled])) { color: inherit; }
:host(:hover) { box-shadow:none; }
		`),
	],
});
