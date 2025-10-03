import { component, attribute, get, create } from './component.js';
import { ButtonRound } from './button-round.js';
import { Icon } from './icon.js';

declare module './component' {
	interface Components {
		'c-icon-button': IconButton;
	}
}

/**
 * An interactive element that presents a single icon as a clickable button, optimized for
 * compact actions with optional size and fill customization.
 *
 * Suitable for toolbar, command bar, and consistent icon-only actions.
 *
 * @tagName c-icon-button
 * @title Icon Button
 * @icon radio_button_checked
 * @example
 * <c-icon-button icon="search" aria-label="search icon button"></c-icon-button>
 *
 * @demo <caption>Variants</caption>
 * <c-icon-button variant="outlined" icon="search" aria-label="search icon button"></c-icon-button>
 * &nbsp;&nbsp;&nbsp;&nbsp;
 * <c-icon-button variant="text" icon="globe" aria-label="globe icon button"></c-icon-button>
 * &nbsp;&nbsp;&nbsp;&nbsp;
 * <c-icon-button color="secondary-container" icon="person" aria-label="person icon button"></c-icon-button>
 *
 */
export class IconButton extends ButtonRound {
	/**
	 * A string representing the name of the icon to be displayed within the button.
	 * @attribute
	 */
	icon = '';

	/**
	 * A number specifying the desired width of the icon in pixels.
	 * @attribute
	 * @demo
	 * <c-icon-button icon="help" width="48" aria-label="help icon button"></c-icon-button>
	 */
	width?: number;

	/**
	 * A number specifying the desired height of the icon in pixels.
	 * @attribute
	 */
	height?: number;

	/**
	 * Indicates whether the icon inside the button should use the fill styling.
	 * @attribute
	 * @demo
	 * <c-icon-button fill variant="outlined" icon="photo_camera" aria-label="search icon button"></c-icon-button>
	 */
	fill = false;

	/**
	 * This attribute determines the appearance and behavior of the button,
	 * @attribute
	 */
	variant?: 'elevated' | 'outlined' | 'text' | 'filled' = 'text';

	alt?: string;
}

component(IconButton, {
	tagName: 'c-icon-button',
	init: [
		attribute('icon'),
		attribute('width'),
		attribute('height'),
		attribute('alt'),
		attribute('fill'),
	],
	augment: [
		$ =>
			create(Icon, {
				className: 'icon',
				width: get($, 'width'),
				height: get($, 'height'),
				name: get($, 'icon'),
				fill: get($, 'fill'),
				alt: get($, 'alt'),
			}),
	],
});
