import {
	Component,
	Slot,
	component,
	create,
	styleAttribute,
} from './component.js';
import { role } from './a11y.js';
import { buttonBehavior, buttonBaseStyles } from './button.js';
import {
	Size,
	colorAttribute,
	sizeAttribute,
	css,
	font,
	surface,
	SurfaceColorValue,
} from './theme.js';
import { ripple } from './ripple.js';

declare module './component' {
	interface Components {
		'c-chip': Chip;
	}
}

/**
 * Chips are compact elements that represent an input, attribute, or action.
 * Chips allow users to enter information, make selections, filter content, or trigger actions.
 *
 * @tagName c-chip
 * @title Chip component for compact action, input, or filter UI.
 * @icon voting_chip
 * @example
 *   <c-chip>Single Chip</c-chip>
 *   <c-chip><c-icon width="18" name="tag" slot="leading"></c-icon>Chip with Icon</c-chip>
 *   <c-chip disabled><c-icon slot="leading" width="18" name="tag"></c-icon>Disabled Chip</c-chip>
 */
export class Chip extends Component {
	/**
	 * Determines if the chip is disabled.
	 * @attribute
	 */
	disabled = false;

	/**
	 * Captures touch interaction state.
	 * @attribute
	 */
	touched = false;

	/**
	 * Indicates whether the chip is in a selected state,
	 * @attribute
	 * @demo
	 * <c-chip selected><c-icon width="18" name="tag" slot="trailing"></c-icon>Selected Chip</c-chip>
	 */
	selected = false;

	/**
	 * Sets the background and text color of the chip.
	 * @attribute
	 */
	color?: SurfaceColorValue;

	/**
	 * Controls the size of the chip, affecting dimensions and font size.
	 * @attribute
	 */
	size: Size = 0;
}

component(Chip, {
	tagName: 'c-chip',
	init: [
		styleAttribute('disabled'),
		styleAttribute('touched'),
		styleAttribute('selected'),
		colorAttribute('color', 'surface-container-low'),
		sizeAttribute(
			'size',
			s => `{
			padding: 2px ${s < 0 ? 2 : 8}px;
			font-size: ${14 + s * 2}px;
			height: ${32 + s * 6}px;
		}`,
		),
	],
	augment: [
		role('button'),
		buttonBehavior,
		...buttonBaseStyles,
		css(`
:host {
	box-sizing: border-box;
	border: 1px solid var(--cxl-color-outline-variant);
	border-radius: var(--cxl-shape-corner-small);
	${font('label-large')}
	display: inline-flex;
	align-items: center;
 	position: relative;
	overflow: hidden;
 	column-gap: 8px;
	flex-shrink: 0;
	cursor: pointer;
	flex-wrap: nowrap;
	align-self: center;
}
:host([disabled]) {
	background-color: color-mix(in srgb, var(--cxl-color--on-surface) 12%, transparent);
	color: color-mix(in srgb, var(--cxl-color--on-surface) 38%, transparent);
	border-color: color-mix(in srgb, var(--cxl-color-on-surface) 12%, transparent);
}
:host([selected]) {
	border-color: var(--cxl-color-secondary-container);
	${surface('secondary-container')}
}
:host(:hover) { box-shadow: none; }
slot[name] { display: inline-block; }
		`),
		ripple,
		() => create('slot', { name: 'leading' }),
		Slot,
		() => create('slot', { name: 'trailing' }),
	],
});
