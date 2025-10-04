import { Component, Slot, component, styleAttribute } from './component.js';
import {
	Spacing,
	Elevation,
	SurfaceColorValue,
	css,
	media,
	spacingValues,
	scrollbarStyles,
	colorAttribute,
} from './theme.js';

declare module './component' {
	interface Components {
		'c-c': C;
	}
}

/**
 * The buildGridCss function is a helper for generating responsive grid layout styles.
 * It defines CSS classes that control the number of grid columns an element should
 * span based on screen size (extra small, small, medium, large, extra large).
 */
export function buildGridCss(display: 'block' | 'flex' = 'block') {
	const colStyles = ((r: Record<string, string>) => {
		for (let i = 12; i > 0; i--) {
			r.xl += `:host([xl="${i}"]){display:${display};grid-column-end:span ${i};}`;
			r.lg += `:host([lg="${i}"]){display:${display};grid-column-end:span ${i};}`;
			r.md += `:host([md="${i}"]){display:${display};grid-column-end:span ${i};}`;
			r.sm += `:host([sm="${i}"]){display:${display};grid-column-end:span ${i};}`;
			r.xs += `:host([xs="${i}"]){display:${display};grid-column-end:span ${i};}`;
		}
		return r;
	})({
		xl: '',
		lg: '',
		md: '',
		sm: '',
		xs: '',
	});

	return css(`
:host { box-sizing:border-box; display:${display}; }
${colStyles.xs}
:host([xs="0"]) { display:none }
:host([xsmall]) { display:${display} }
${media(
	'small',
	`
:host { grid-column-end: auto; }
:host([small]) { display:${display} }
${colStyles.sm}
:host([sm="0"]) { display:none }
`,
)}
${media(
	'medium',
	`
${colStyles.md}
:host([md="0"]) { display:none }
:host([medium]) { display:${display} }
`,
)}
${media(
	'large',
	`
${colStyles.lg}
:host([lg="0"]) { display:none }
:host([large]) { display:${display} }
`,
)}
${media(
	'xlarge',
	`
${colStyles.xl}
:host([xl="0"]) { display:none }
:host([xlarge]) { display:${display} }
`,
)}
`);
}

export const growAndFillStyles = css(`
:host([grow]) { flex-grow:1; flex-shrink: 1 }
:host([color]) { background-color: var(--cxl-color-surface); color: var(--cxl-color-on-surface); }
:host([fill]) { position: absolute; inset:0 }
:host([elevation]) { --cxl-color-on-surface: var(--cxl-color--on-surface); }
:host([elevation="0"]) { --cxl-color-surface: var(--cxl-color-surface-container-lowest); }
:host([elevation="1"]) { --cxl-color-surface: var(--cxl-color-surface-container-low); }
:host([elevation="2"]) { --cxl-color-surface: var(--cxl-color-surface-container); }
:host([elevation="3"]) { --cxl-color-surface: var(--cxl-color-surface-container-high); }
:host([elevation="4"]) { --cxl-color-surface: var(--cxl-color-surface-container-highest); }
${scrollbarStyles()}
${spacingValues.map(v => `:host([pad="${v}"]){padding:${v}px}`).join('')}
${spacingValues
	.map(v => `:host([vpad="${v}"]){padding-top:${v}px;padding-bottom:${v}px}`)
	.join('')}`);

/**
 * The BlockBase class provides a base for building reusable UI blocks.
 * It offers styles for common properties like background color, padding, sizing, and elevation.
 * @beta
 */
export abstract class Block extends Component {
	/**
	 * A boolean attribute indicating whether the block should grow to fill available space.
	 * @attribute
	 */
	grow = false;

	/**
	 * A boolean attribute indicating whether the block should fill its container entirely using absolute positioning.
	 * @attribute
	 */
	fill = false;

	/**
	 * Responsive sizing based on screen sizes (extra small)
	 * Value represent the number of grid columns to span.
	 * @attribute
	 */
	xs?: number;

	/**
	 * Responsive sizing based on screen sizes (small)
	 * Value represent the number of grid columns to span.
	 * @attribute
	 */
	sm?: number;

	/**
	 * Responsive sizing based on screen sizes (medium)
	 * Value represent the number of grid columns to span.
	 * @attribute
	 */
	md?: number;

	/**
	 * Responsive sizing based on screen sizes (large)
	 * Value represent the number of grid columns to span.
	 * @attribute
	 */
	lg?: number;

	/**
	 * Responsive sizing based on screen sizes (extra large)
	 * Value represent the number of grid columns to span.
	 * @attribute
	 */
	xl?: number;

	/**
	 * An attribute for applying uniform padding around the block content.
	 * @attribute
	 */
	pad?: Spacing;

	/**
	 * An attribute for applying vertical padding only (top and bottom).
	 * @attribute
	 */
	vpad?: Spacing;

	/**
	 * A color attribute allowing control over the block's background and text color.
	 * @attribute
	 */
	color?: SurfaceColorValue;

	/**
	 * A boolean attribute for horizontally centering the block content.
	 * @attribute
	 */
	center = false;

	/**
	 * A number attribute specifying the block's elevation (0-4).
	 * @attribute
	 */
	elevation?: Elevation;
}

component(Block, {
	init: [
		styleAttribute('sm'),
		styleAttribute('xs'),
		styleAttribute('md'),
		styleAttribute('lg'),
		styleAttribute('xl'),
		styleAttribute('vpad'),
		styleAttribute('pad'),
		styleAttribute('center'),
		styleAttribute('fill'),
		styleAttribute('grow'),
		styleAttribute('elevation'),
		colorAttribute('color'),
	],
});

/**
 * A generic container for grouping content with adjustable layout options,
 * responsive sizing, and visual elevation. Provides padding, color theming,
 * and grid-based sizing for consistent spacing and alignment across devices.
 *
 * Adjust block sizing at different breakpoints using the `xs`, `sm`, `md`,
 * `lg`, and `xl` attributes to control the number of columns the container
 * spans (1-12). Use `grow` to let the container expand within flex layouts,
 * and `fill` for absolute positioning that covers its parent. Surface color
 * can be set using the `color` attribute, while `elevation` (0-4) applies
 * a visual depth effect for hierarchy. The `pad` and `vpad` attributes apply
 * uniform or vertical-only padding, using predefined spacing steps. Enable
 * centered content alignment on all screen sizes via the `center` attribute.
 *
 * When placed inside a grid, specify responsive column count per breakpoint
 * using attributes. Hide the container entirely by setting the column value
 * to 0 for any given breakpoint (`xs="0"`, etc). Scrollbars will inherit
 * custom visual styles for consistency with branded surfaces.
 *
 * @title Responsive Block Container
 * @icon view_module
 * @tagName c-c
 * @beta
 */
export class C extends Block {}
component(C, {
	tagName: 'c-c',
	augment: [
		growAndFillStyles,
		buildGridCss(),
		css(`:host([center]) { text-align: center}`),
		Slot,
	],
});
