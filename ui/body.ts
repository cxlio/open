import { Component, Slot, component } from './component.js';
import { css, media } from './theme.js';

/**
 * Container for main app content that adapts to various layout needs. Maintains a
 * scrollable region when content overflows, and supports responsive spacing for
 * different screen sizes.
 *
 * Automatically applies app background and text color
 * variables. Ensures content width is constrained for readability and centers
 * content on medium and larger screens.
 *
 * When embedded within a flex parent, the container will expand to fill available
 * space. Touch device users get native fling-scroll support. Top-level
 * slot content is limited to 1200px for optimal line length. The background and
 * text colors are controlled by CSS variables, allowing easy theme
 * customizations.
 *
 * Users may apply custom styles by targeting the `:host` selector in CSS, enabling
 * tweaks such as padding, margin, or scroll behavior. The slot always takes up full
 * width but is centered automatically at medium breakpoints (768px and above).
 *
 * @title App Content Container
 * @icon view_compact
 *
 * @tagName c-body
 * @alpha
 */
export class Body extends Component {}

component(Body, {
	tagName: 'c-body',
	augment: [
		css(`
:host {
	position: relative;
	display: flex;
	flex-direction: column;
	flex-grow: 1;
	overflow-x:hidden;
	overflow-y: auto;
	-webkit-overflow-scrolling: touch;
	background-color: var(--cxl-color-background);
	color: var(--cxl-color-on-background);
}
slot { display: flex; flex-direction: column; max-width: 1200px; flex-grow: 1; }

${media(
	'medium',
	`
	:host{padding:32px;}
	slot { margin: 0 auto; width:100%; }
`,
)}

		`),
		Slot,
	],
});
