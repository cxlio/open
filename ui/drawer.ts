import {
	Component,
	Slot,
	styleAttribute,
	component,
	attribute,
	attributeChanged,
	create,
	get,
	getShadow,
} from './component.js';
import { be, merge, of } from './rx.js';
import {
	BreakpointKey,
	breakpoint,
	css,
	theme,
	media,
	surface,
} from './theme.js';
import { animate } from './animation.js';
import { on } from './dom.js';
import { Backdrop } from './backdrop.js';
import { TogglePanel } from './toggle-panel.js';
import { popupManager } from './popup-manager.js';

declare module './component' {
	interface Components {
		'c-drawer': Drawer;
	}
}

/*
 * Drawers cannot have padding, so elements can Hr can display propertly.
 */
export const drawerStyles = css(`
#drawer {
	box-sizing: border-box;
    background-color: var(--cxl-color-surface);
    color: var(--cxl-color-on-surface);
    position: absolute;
	display: block;
    width: 85%;
	min-width: 256px;

    overflow-y: auto;
    overflow-x: hidden;
    z-index: 5;
}
${media('small', '#drawer { width: 360px }')}

#dialog {
    margin: 0;
    padding: 0;
    border-width: 0;
    max-width: none;
    max-height: none;
    width: 100%;
    height: 100%;
    background-color: transparent;
    overflow-x: hidden;
    overflow-y: hidden;
    text-align: initial;
}

#dialog::backdrop {
    background-color: transparent;
}
`);

/**
 * The Drawer component represents a drawer element that slides in from the left or right side of the screen.
 * It provides a way to display supplementary content alongside the main content area,
 * typically used for navigation, settings, or additional information.
 *
 * @tagName c-drawer
 * @title Slide-In Panel
 * @icon menu_open
 * @demo
 * <c-drawer position="right" open>
 *   <div style="padding:8px">
 *     <p><c-t font="title-large">Right Drawer Title</c-t></p>
 *     <p><c-t>Right Drawer Content</c-t></p>
 *   </div>
 * </c-drawer>
 *
 * @demo <caption>RTL Support</caption>
 * <c-drawer open dir="rtl">
 *   <div style="padding:8px">
 *     <p><c-t font="title-large">RTL Drawer Title</c-t></p>
 *     <p><c-t>RTL Drawer Content</c-t></p>
 *   </div>
 * </c-drawer>
 *
 */
export class Drawer extends Component {
	/**
	 * Controls the visibility of the drawer
	 * @attribute
	 */
	open = false;

	/**
	 * Defines the position of the drawer.
	 * The "static" value will render the drawer as a static, inline block rather than sliding in from a side
	 *
	 * @attribute
	 * @demo
	 * <c-drawer position="left" open>
	 *   <div style="padding:8px">
	 *     <p><c-t font="title-large">Left Drawer</c-t></p>
	 *     <p><c-t>Left Drawer Content</c-t></p>
	 *   </div>
	 * </c-drawer>
	 */
	position?: 'left' | 'right' | 'static';

	/**
	 * A breakpoint or breakpoint key that determines when the drawer switches
	 * to a full-screen modal behavior on smaller screens.
	 * @attribute
	 */
	responsive?: BreakpointKey;

	/**
	 * Controls whether the drawer acts as a permanent side panel
	 * @attribute
	 */
	permanent = false;
}

component(Drawer, {
	tagName: 'c-drawer',
	init: [
		styleAttribute('open'),
		styleAttribute('position'),
		attribute('responsive'),
		attribute('permanent'),
	],
	augment: [
		drawerStyles,
		css(`
:host { max-width: 360px; }
#drawer.permanent {
	${surface('surface')}
    overflow-y: auto;
    overflow-x: hidden;
    position: relative;
    width: 100%;
    height: 100%;
	z-index: 0;
}
#drawer {
    top: 0;
    bottom: 0;
}
#drawer, :host([position=left]) #drawer {
	left: 0;
	border-radius: 0 var(--cxl-shape-corner-large) var(--cxl-shape-corner-large) 0;
}
:host([position=right]) #drawer,:host(:not([position]):dir(rtl)) #drawer {
	right: 0;
	left: auto;
	border-radius: var(--cxl-shape-corner-large) 0 0 var(--cxl-shape-corner-large);
}
:host([responsiveon]) #backdrop { display: none; }
:host([responsiveon]) #dialog { display: contents; }
`),
		host => {
			const showPermanent = be(false);
			const animation$ = merge(
				get(host, 'position'),
				showPermanent,
			).raf();
			const isRight = () =>
				host.position === 'right' ||
				getComputedStyle(host).direction === 'rtl';
			const popup = create(
				TogglePanel,
				{
					id: 'drawer',
					'motion-in': animation$.map(() =>
						host.permanent && showPermanent.value
							? undefined
							: isRight()
							? 'slideInRight'
							: 'slideInLeft',
					),
					'motion-out': animation$.map(() =>
						host.permanent && showPermanent.value
							? undefined
							: isRight()
							? 'slideOutRight'
							: 'slideOutLeft',
					),
				},
				Slot,
			);

			const backdrop = new Backdrop();
			backdrop.id = 'backdrop';
			const dialog = create('dialog', { id: 'dialog' }, backdrop, popup);

			getShadow(host).append(dialog);

			return merge(
				on(popup, 'close').tap(() => dialog.close()),
				on(dialog, 'close').tap(() => (host.open = false)),
				attributeChanged(popup, 'open').tap(v => (host.open = v)),
				attributeChanged(host, 'open').raf(v => {
					if (!v) popup.scrollTo(0, 0);
				}),
				on(backdrop, 'click').tap(() => (host.open = false)),
				on(dialog, 'cancel').tap(ev => {
					ev.preventDefault();
					host.open = false;
				}),

				get(host, 'open')
					.tap(v => {
						if (showPermanent.value && host.permanent)
							return (popup.open = true);
						if (v) {
							if (!showPermanent.value) {
								popupManager.openModal({
									element: dialog,
									close: () => (host.open = false),
								});
								// Force reflow in safari
								dialog.getBoundingClientRect();
							}
						} else if (
							popupManager.currentModal?.element === dialog
						)
							popupManager.modalClosed();
					})
					.raf(v => {
						popup.open = v;
					}),

				get(host, 'responsive')
					.switchMap<BreakpointKey>(v =>
						v !== undefined
							? breakpoint(document.body)
							: of('xsmall'),
					)
					.switchMap(bp => {
						const bpval =
							theme.breakpoints[host.responsive || 'large'];
						const show = theme.breakpoints[bp] >= bpval;
						showPermanent.next(show);
						// Hide if going to modal view
						if (show && popup.className !== 'permanent')
							dialog.close();
						else if (!show && popup.className === 'permanent')
							host.open = false;
						if (show && host.open === false)
							host.open = host.permanent;
						host.toggleAttribute('responsiveon', show);
						popup.className = show ? 'permanent' : 'drawer';
						return attributeChanged(host, 'open').tap(v => {
							if (!host.hasAttribute('responsiveon'))
								animate({
									target: backdrop,
									animation: v ? 'fadeIn' : 'fadeOut',
									options: {
										fill: 'forwards',
									},
								});
						});
					}),
			);
		},
	],
});
