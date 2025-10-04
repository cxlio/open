import {
	Component,
	Slot,
	component,
	create,
	styleAttribute,
	get,
} from './component.js';
import { on, onIntersection, onChildrenMutation } from './dom.js';
import { EMPTY, merge } from './rx.js';
import { css, font } from './theme.js';
import type { AppbarContextual } from './appbar-contextual.js';

declare module './component' {
	interface Components {
		'c-appbar': Appbar;
	}
}

/**
 * Used internally by appbar and appbar-contextual
 */
export const AppbarLayout = [
	css(`
:host {
	box-sizing: border-box;
	background-color: var(--cxl-color-surface);
	color: var(--cxl-color-on-surface);
	flex-shrink: 0;
	display: flex;
	align-items: center;
	column-gap: 24px;
	min-height: 64px;
	padding: 4px 16px;
	${font('title-large')}
}
:host([size=medium]) {
	height: 112px;
	padding: 20px 16px 24px 16px;
	${font('headline-small')}
	flex-wrap: wrap;
}
:host([size=medium]) slot[name=title],:host([size=large]) slot[name=title]  { width: 100%; display: block; margin-top:auto; }
:host([size=large]) {
	height: 152px; padding: 20px 16px 28px 16px;
	${font('headline-medium')}
	flex-wrap: wrap;
}`),
	Slot,
	() => create('slot', { name: 'title' }),
];

function isContextual(el: Element): el is AppbarContextual {
	return el.tagName === 'C-APPBAR-CONTEXTUAL';
}

/**
 * The `c-appbar` component provides a flexible, responsive container designed for application headers.
 * It organizes navigation controls, branding, contextual actions, and supports both regular and contextual
 * states for primary and secondary toolbars.
 *
 * The `size` attribute customizes its height and typography
 * with `small`, `medium`, or `large` values to fit different layout requirements; slot-based design enables
 * composition with custom elements, including titles, actions, and back navigation.
 *
 * ### Named Slots
 *
 * - **title**: Place elements (typically `c-appbar-title`) in this slot to align them according to
 *   the selected size. When using `medium` or `large`, this title stretches full-width below any action or nav controls.
 * - **contextual**: For contextual app bars only, slot a `ContextualAppbar` child here with a matching `name`.
 *   All non-contextual content is hidden while contextual content displays.
 *
 * @see AppbarContextual
 * @see AppbarTitle
 * @see NavbarToggle
 *
 * @tagName c-appbar
 * @title Responsive App Header for Navigation and Context
 * @icon toolbar
 *
 * @demo
 * <c-appbar style="max-width:400px;">
 *   <c-navbar-toggle title="Toggle Navigation Bar"></c-navbar-toggle>
 *   <c-appbar-title>Appbar Title</c-appbar-title>
 *   <c-icon-button title="Attach File" style="margin-inline-start:auto" icon="attach_file"></c-icon-button>
 *   <c-icon-button title="Calendar" icon="today"></c-icon-button>
 *   <c-icon-button title="More" icon="more_vert"></c-icon-button>
 * </c-appbar>
 *
 * @demoonly
 * <c-appbar style="max-width:400px;">
 *   <c-navbar-toggle title="Toggle Navigation Bar"></c-navbar-toggle>
 *   <c-appbar-title style="text-align:center">Appbar Title</c-appbar-title>
 *   <c-icon-button icon="more_vert" aria-label="More Button"></c-icon-button>
 * </c-appbar>
 *
 * @demo <caption>RTL Support</caption>
 * <c-appbar dir="rtl" style="max-width:400px;">
 *   <c-navbar-toggle title="Toggle Navigation Bar"></c-navbar-toggle>
 *   <c-appbar-title>Appbar Title</c-appbar-title>
 *   <c-icon-button title="More" icon="more_vert"></c-icon-button>
 * </c-appbar>
 */
export class Appbar extends Component {
	/**
	 * Specifies the size of the Appbar. The available options are:
	 *   - `small`: Compact height suitable for minimal designs.
	 *   - `medium`: Default size for balanced layouts.
	 *   - `large`: Expanded height for better visual emphasis on branding or titles.
	 *
	 * @attribute
	 * @demo <caption>Medium Appbar</caption>
	 * <c-appbar size="medium">
	 *   <c-navbar-toggle title="Toggle Navigation Bar"></c-navbar-toggle>
	 *   <c-icon-button title="Attach File" style="margin-inline-start:auto" icon="attach_file"></c-icon-button>
	 *   <c-icon-button title="Calendar" icon="today"></c-icon-button>
	 *   <c-icon-button title="More" icon="more_vert"></c-icon-button>
	 *   <c-appbar-title slot="title">Headline Small</c-appbar-title>
	 * </c-appbar>
	 * <c-appbar dir="rtl" size="medium">
	 *   <c-navbar-toggle title="Toggle Navigation Bar"></c-navbar-toggle>
	 *   <c-icon-button title="Attach File" style="margin-inline-start:auto" icon="attach_file"></c-icon-button>
	 *   <c-icon-button title="Calendar" icon="today"></c-icon-button>
	 *   <c-icon-button title="More" icon="more_vert"></c-icon-button>
	 *   <c-appbar-title slot="title">Headline Small</c-appbar-title>
	 * </c-appbar>
	 * @demo <caption>Large Appbar</caption>
	 * <c-appbar size="large">
	 *   <c-navbar-toggle title="Toggle Navigation Bar"></c-navbar-toggle>
	 *   <c-appbar-title slot="title">Headline Large</c-appbar-title>
	 *   <c-icon-button title="Attach File" style="margin-inline-start:auto" icon="attach_file"></c-icon-button>
	 *   <c-icon-button title="Calendar" icon="today"></c-icon-button>
	 *   <c-icon-button title="More" icon="more_vert"></c-icon-button>
	 * </c-appbar>
	 * <c-appbar dir="rtl" size="large">
	 *   <c-navbar-toggle title="Toggle Navigation Bar"></c-navbar-toggle>
	 *   <c-appbar-title slot="title">Headline Large</c-appbar-title>
	 *   <c-icon-button title="Attach File" style="margin-inline-start:auto" icon="attach_file"></c-icon-button>
	 *   <c-icon-button title="Calendar" icon="today"></c-icon-button>
	 *   <c-icon-button title="More" icon="more_vert"></c-icon-button>
	 * </c-appbar>
	 */
	size?: 'small' | 'medium' | 'large';

	/**
	 * Indicates whether the Appbar remains fixed at the top of the viewport when scrolled.
	 * When the viewport is scrolled, the Appbar's color transitions to "surface-container".
	 *
	 * @attribute
	 * @demoonly
	 * <div style="width:100%;max-height:160px;overflow-y:auto;">
	 * <c-appbar sticky>
	 *   <c-navbar-toggle title="Toggle Navigation Bar"></c-navbar-toggle>
	 *   <c-appbar-title>Appbar Title</c-appbar-title>
	 *   <c-icon-button title="Attach File" style="margin-inline-start:auto" icon="attach_file"></c-icon-button>
	 *   <c-icon-button title="Calendar" icon="today"></c-icon-button>
	 *   <c-icon-button title="More" icon="more_vert"></c-icon-button>
	 * </c-appbar>
	 * <c-t font="title-large">Lorem Ipsum is simply dummy text of the printing and typesetting industry. Lorem Ipsum has been the industry's standard dummy text ever since the 1500s, when an unknown printer took a galley of type and scrambled it to make a type specimen book. It has survived not only five centuries, but also the leap into electronic typesetting, remaining essentially unchanged. It was popularised in the 1960s with the release of Letraset sheets containing Lorem Ipsum passages, and more recently with desktop publishing software like Aldus PageMaker including versions of Lorem Ipsum.</c-t>
	 * </div>
	 */
	sticky = false;

	/**
	 * Determines the currently active contextual appbar.
	 * A contextual appbar includes a back button that transitions back to the primary appbar view.
	 * To use this, you must define a `ContextualAppbar` child component within the contextual slot.
	 * The child's `name` attribute should match this attribute to become visible.
	 * @attribute
	 * @see AppbarContextual
	 */
	contextual?: string;
}

component(Appbar, {
	tagName: 'c-appbar',
	init: [
		styleAttribute('size'),
		styleAttribute('sticky'),
		styleAttribute('contextual'),
	],
	augment: [
		css(`
:host {
	z-index: 2;
	width:100%;
}
:host([sticky]) { position: sticky; top: -1px; }
:host([scroll]) {
 	transition: background-color var(--cxl-speed);
	border-top: 1px solid var(--cxl-color-surface-container); background-color: var(--cxl-color-surface-container)
}
:host([contextual]) { padding: 0; }
:host([contextual]) slot:not([name=contextual]) { display:none; }
		`),
		...AppbarLayout,
		() => create('slot', { name: 'contextual' }),
		$ =>
			get($, 'sticky').switchMap(v =>
				v
					? onIntersection($, {
							threshold: [1],
					  }).tap(ev =>
							$.toggleAttribute(
								'scroll',
								ev.intersectionRatio < 1,
							),
					  )
					: EMPTY,
			),
		$ => {
			let active: AppbarContextual | undefined;
			return merge(onChildrenMutation($), get($, 'contextual'))
				.raf()
				.switchMap(() => {
					for (const el of $.children)
						if (isContextual(el)) {
							el.slot = 'contextual';
							el.open = el.name === $.contextual;
							if (el.open) {
								active = el;
								return on(el, 'close').tap(
									() => ($.contextual = undefined),
								);
							}
						}
					if (active) active.open = false;
					active = undefined;
					return EMPTY;
				});
		},
	],
});
