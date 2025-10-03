import {
	Component,
	Slot,
	styleAttribute,
	component,
	get,
} from './component.js';
import { Typography, TypographyValues, css, font } from './theme.js';

declare module './component.js' {
	interface Components {
		'c-t': T;
	}
}

/**
 * Renders styled text content with configurable semantic heading levels.
 * Use to display headings or body text with automatic theme-based styles.
 *
 * Supports semantic heading structure via `font` prop, setting `role="heading"`
 * and correct `aria-level` for improved screen reader experience.
 *
 * Heading elements sized via the `font` value will be assigned appropriate margins and
 * display properties.
 *
 * All content is inline-block by default.
 *
 * @title Themed Typography Text Component
 * @icon title
 * @tagName c-t
 * @demo
 * <c-t font="display-medium">Display Medium</c-t>
 * <c-t font="body-large">Body Large</c-t>
 * <c-t font="headline-large">Headline Large</c-t>
 */
export class T extends Component {
	/**
	 * Specifies the typography style to be applied to the component.
	 */
	font?: Typography | 'h1' | 'h2' | 'h3' | 'h4' | 'h5' | 'h6';
}

component(T, {
	tagName: 'c-t',
	init: [styleAttribute('font')],
	augment: [
		css(
			`:host{display:inline-block;font:var(--cxl-font-body-medium);}${TypographyValues.map(
				t =>
					`:host([font="${t}"]){font:var(--cxl-font-${t});letter-spacing:var(--cxl-letter-spacing-${t})}`,
			).join('')}
:host([font=h1]) { ${font(
				'display-large',
			)} display:block;margin-top: 64px; margin-bottom: 24px; }
:host([font=h2]) { ${font(
				'display-medium',
			)} display:block;margin-top: 56px; margin-bottom: 24px; }
:host([font=h3]) { ${font(
				'display-small',
			)} display:block; margin-top: 48px; margin-bottom: 16px; }
:host([font=h4]) { ${font(
				'headline-medium',
			)} display:block; margin-top: 40px; margin-bottom: 16px; }
:host([font=h5]) { ${font(
				'title-large',
			)} display:block;margin-top: 32px; margin-bottom: 12px; }
:host([font=h6]) { ${font(
				'title-medium',
			)} display:block;margin-top: 24px; margin-bottom: 8px; }
:host([font=h1]:first-child),:host([font=h2]:first-child),:host([font=h3]:first-child),:host([font=h4]:first-child),:host([font=h5]:first-child),:host([font=h6]:first-child){margin-top:0}
			`,
		),
		Slot,
		$ =>
			get($, 'font').tap(font => {
				switch (font) {
					case 'h1':
					case 'h2':
					case 'h3':
					case 'h4':
					case 'h5':
					case 'h6':
						$.role = 'heading';
						$.ariaLevel = font.slice(1);
						break;
					default:
						$.role = $.ariaLevel = null;
				}
			}),
	],
});
