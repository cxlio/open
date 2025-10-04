import { component, styleAttribute } from './component.js';
import { css, scrollbarStyles, surface, font } from './theme.js';
import { C } from './c.js';

declare module './component' {
	interface Components {
		'c-card': Card;
	}
}

export const cardStyles = css(`
:host {
	${surface('surface-container')}
	${font('body-medium')}
	border-radius: var(--cxl-shape-corner-medium);
	overflow: hidden;
}
:host([variant=elevated]:not([color])) {
	--cxl-color-surface: var(--cxl-color-surface-container-low);
	z-index: 1;
	box-shadow: var(--cxl-elevation-1);
}
:host([variant=outlined]) {
	${surface('surface')}
	border: 1px solid var(--cxl-color-outline-variant);
}
${scrollbarStyles()}
`);

/**
 * The Card component represents a content block focused on a single subject.
 * It provides a standard visual container for displaying information, actions,
 * and potentially an image related to that subject.
 *
 * @tagName c-card
 * @title Surface container for modular content
 * @icon cards
 * @example
 * <c-card pad="16" style="width:200px;height:120px">Filled</c-card>
 */
export class Card extends C {
	/**
	 * Specifies the visual style of the card.
	 * `elevated` Renders the button with a raised shadowed appearance.
	 * `outline` Displays the button with a border and no background fill.
	 *
	 * @attribute
	 * @demo
	 * <c-card pad="16" style="width:200px;height:120px" variant="elevated">Elevated</c-card>
	 * <c-card pad="16" style="width:200px;height:120px" variant="outlined">Outlined</c-card>
	 */
	variant?: 'elevated' | 'outlined' | 'filled';
}

component(Card, {
	tagName: 'c-card',
	init: [styleAttribute('variant')],
	augment: [cardStyles],
});
