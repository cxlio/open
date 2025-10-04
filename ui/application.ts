import {
	Component,
	component,
	create,
	attributeChanged,
	getShadow,
	styleAttribute,
	onMessage,
} from './component.js';
import { css, newStylesheet, surface, scrollbarStyles } from './theme.js';
import { animate } from './animation.js';
import { popupManager } from './popup-manager.js';
import { metaBehavior } from './meta.js';
import { merge, observable } from './rx.js';

declare module './component' {
	interface Components {
		'c-application': Application;
	}
}

function animateSheet(
	target: HTMLElement,
	prop: 'marginRight' | 'marginLeft',
	dir: 'in' | 'out',
) {
	if (dir === 'in') target.style.display = '';
	const to = target.offsetWidth;
	const animation = animate({
		target,
		animation: {
			kf: {
				[prop]: dir === 'in' ? [`-${to}px`, '0'] : ['0', `-${to}px`],
			},
		},
	});
	if (dir === 'out')
		animation.onfinish = () => (target.style.display = 'none');
}

/**
 * Provides an application container that manages layout and supports the addition
 * of persistent navigation drawers on both start and end sides. Automatically
 * accommodates side drawers through named slots and toggles their visibility
 * with smooth sliding transitions.
 *
 * Intended as the layout root for most web
 * applications, so global styles such as html/body overflow are handled and the
 * application area fills the viewport.
 *
 * Use the `sheetstart` and `sheetend` attributes to toggle visibility of the
 * start and end side drawers.
 *
 * Persistent drawers, e.g. sidebars or navigation menus, should be slotted into
 * the `start` and `end` named slots.
 *
 * ### Slots
 *
 * @slot start: Place persistent or temporary content for start side
 * @slot end:   Place persistent or temporary content for end side
 *
 * @title Application Shell
 * @icon dashboard
 * @tagName c-application
 * @beta
 */
export class Application extends Component {
	/**
	 * When set to `true`, the start drawer is shown and sliding in; set to `false`
	 * to hide with a slide-out transition.
	 */
	'sheetstart' = false;

	/**
	 * When set to `true`, the end drawer is shown and sliding in; set to `false`
	 * to hide with a slide-out transition.
	 */
	'sheetend' = false;
}

component(Application, {
	tagName: 'c-application',
	init: [styleAttribute('sheetstart'), styleAttribute('sheetend')],
	augment: [
		css(`
:host {
	display: flex;
	position: absolute;
	inset: 0;
	${surface('background')}
	overflow: hidden;
}
#body {
	display: flex;
	flex-direction: column;
	flex-grow: 1;
	overflow: hidden;
}
slot[name=end],slot[name=start] { display:block; flex-shrink: 0; }
${scrollbarStyles()}
	`),

		metaBehavior,
		$ =>
			onMessage($, 'toggle.open').tap(id => {
				if (id === 'sheetend' || id === 'sheetstart') $[id] = true;
			}),
		$ =>
			onMessage($, 'toggle.close').tap(id => {
				if (id === 'sheetend' || id === 'sheetstart') $[id] = false;
			}),
		$ => {
			const start = create('slot', { name: 'start' });
			const slot = create('slot', { id: 'body' });
			const end = create('slot', { name: 'end' });
			const htmlCss = newStylesheet('html { overflow: hidden }');

			getShadow($).append(start, slot, end);

			if (!$['sheetstart']) start.style.display = 'none';
			if (!$['sheetend']) end.style.display = 'none';
			popupManager.popupContainer = $;

			return merge(
				observable(subs => {
					const styles = ($.ownerDocument ?? document)
						.adoptedStyleSheets;
					styles.push(htmlCss);
					subs.signal.subscribe(() => {
						const i = styles.indexOf(htmlCss);
						if (i !== -1) styles.splice(i, 1);
					});
				}),
				attributeChanged($, 'sheetstart').tap(val =>
					animateSheet(start, 'marginLeft', val ? 'in' : 'out'),
				),
				attributeChanged($, 'sheetend').tap(val =>
					animateSheet(end, 'marginRight', val ? 'in' : 'out'),
				),
			);
		},
	],
});
