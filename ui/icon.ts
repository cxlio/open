import {
	Component,
	component,
	attribute,
	onUpdate,
	getShadow,
} from './component.js';
import { onVisible } from './dom.js';
import { css, getIcon } from './theme.js';
import { role } from './a11y.js';

declare module './component.js' {
	interface Components {
		'c-icon': Icon;
	}
}

/**
 * Displays vector-based or SVG icons in a consistent, customizable manner using a unique name identifier,
 * allowing icons to be centrally managed and shared across the application.
 *
 * Dynamically retrieves and renders an icon by its `name`, supporting optional `width`, `height`,
 * and a `fill` mode for filled or outlined icon styles.
 *
 * Automatically applies appropriate sizing to the icon based on the provided dimensions,
 * falling back to 24px if none are specified.
 *
 * The icon is lazily rendered: it will only be injected into the DOM once the component is visible,
 * optimizing performance for icon-heavy screens.
 * The icon definition is fetched using a centralized registry, so adding new icon names
 * or formats is possible without modifying this component.
 *
 * @tagName c-icon
 * @title Icon Display Component
 * @icon star
 * @demo
 * <c-icon name="public" alt="globe" width="48"></c-icon>
 */

export class Icon extends Component {
	/**
	 * A string representing the name or identifier of the icon to be displayed.
	 * This name is used to retrieve the icon definition from an external source.
	 * @attribute
	 */
	name = '';

	/**
	 * A number specifying the desired width of the icon in pixels.
	 * @attribute
	 */
	width?: number;

	/**
	 * A number specifying the desired height of the icon in pixels.
	 * @attribute
	 */
	height?: number;

	/**
	 * A string to be used as the alt attribute of the rendered icon element,
	 * @attribute
	 */
	alt?: string;

	/**
	 * Indicates whether the icon inside the button should use the fill styling.
	 * @attribute
	 * @demo
	 * <c-icon name="person" fill alt="filled icon of a person"></c-icon>
	 */
	fill = false;
}

component(Icon, {
	tagName: 'c-icon',
	init: [
		attribute('name'),
		attribute('width'),
		attribute('height'),
		attribute('fill'),
		attribute('alt'),
	],
	augment: [
		role('none'),
		css(`
		:host {
			display: inline-block;
			width: 24px;
			height: 24px;
			flex-shrink: 0;
			vertical-align: middle;
		}
		.icon { width: 100%; height: 100% }
		`),
		$ => {
			const css = new CSSStyleSheet();
			let icon: SVGSVGElement | undefined;
			$.shadowRoot?.adoptedStyleSheets.push(css);

			return onVisible($)
				.switchMap(() => onUpdate($))
				.debounceTime(0)
				.tap(() => {
					const width = $.width ?? $.height;
					const height = $.height ?? $.width;
					css.replace(
						`:host{${
							width === undefined ? '' : `width:${width}px;`
						}${height === undefined ? '' : `height:${height}px`}}`,
					);
					icon?.remove();
					icon = $.name
						? getIcon($.name, {
								className: 'icon',
								width,
								height,
								fill: $.fill,
								alt: $.alt,
						  })
						: undefined;

					if (icon) {
						icon.onerror = () => {
							if (icon && $.alt) icon.replaceWith($.alt);
						};
						getShadow($).append(icon);
					}
				});
		},
	],
});
