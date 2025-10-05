import {
	Component,
	create,
	attribute,
	component,
	attributeChanged,
	styleAttribute,
} from './component.js';
import { css } from './theme.js';
import { onAction } from './dom.js';
import { IconButton } from './icon-button.js';
import { AppbarLayout } from './appbar.js';
import { content } from './locale.js';

declare module './component' {
	interface Components {
		'c-appbar-contextual': AppbarContextual;
	}
}

/**
 * The `c-appbar-contextual` component enables top app bars to temporarily transform into contextual action bars,
 * offering context-aware actions for users (e.g., when multiple items are selected).
 *
 * It pairs with the parent `c-appbar` and is toggled via the `contextual` attribute, matching the `name`
 * property of this component.
 *
 * This component provides an accessible "back" icon button for dismissing the contextual state.
 * The button triggers closing via a tap/click, hiding the bar and dispatching a `close` event.
 *
 * @tagName c-appbar-contextual
 * @title Contextual App Bar
 * @icon arrow_back
 * @see Appbar
 * @demo
 * <c-appbar contextual="test">
 *   <c-navbar-toggle aria-label="Toggle Navbar"></c-navbar-toggle>
 *   <c-appbar-title>Appbar Title</c-appbar-title>
 *   <c-appbar-contextual name="test">Contextual Appbar</c-appbar-contextual>
 * </c-appbar>
 *
 * @demo <caption>RTL Support</caption>
 * <c-appbar dir="rtl" contextual="test">
 *   <c-navbar-toggle aria-label="Toggle Navbar"></c-navbar-toggle>
 *   <c-appbar-title>Appbar Title</c-appbar-title>
 *   <c-appbar-contextual name="test">Contextual Appbar</c-appbar-contextual>
 * </c-appbar>
 */
export class AppbarContextual extends Component {
	/**
	 * The name of the contextual menu. Used by the contextual property of the Appbar component.
	 * @attribute
	 */
	name?: string;

	/**
	 * Appbar size defines the dimensions of the app bar when it's rendered.
	 * @attribute
	 */
	size?: 'small' | 'medium' | 'large';

	/**
	 * Determines the visibility of the component when attached to an Appbar.
	 * @attribute
	 */
	open = false;

	/**
	 * The instance of the back Icon element.
	 */
	readonly backIcon = create(IconButton, {
		icon: 'arrow_back',
		className: 'icon',
		ariaLabel: content.get('core.close'),
		$: el => onAction(el).tap(() => (this.open = false)),
	});

	static {
		component(AppbarContextual, {
			tagName: 'c-appbar-contextual',
			init: [
				attribute('name'),
				styleAttribute('open'),
				styleAttribute('size'),
			],
			augment: [
				$ => $.backIcon,
				...AppbarLayout,
				css(`		
:host {
	display: none;
	flex-grow: 1;
	overflow-x: hidden;
	white-space: nowrap;
	text-overflow: ellipsis;
}
:host([open]) { display: flex }
:host(:dir(rtl)) .icon { scale: -1 1; }
`),
				$ =>
					attributeChanged($, 'open').tap(v => {
						if (!v) $.dispatchEvent(new Event('close'));
					}),
			],
		});
	}
}
