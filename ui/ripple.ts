import {
	attribute,
	Component,
	component,
	getShadow,
	get,
} from './component.js';
import { observable, merge, timer, EMPTY } from './rx.js';
import { isHidden, on, onVisible, isKeyboardClick } from './dom.js';
import { animate } from './animation.js';
import { css } from './theme.js';

declare module './component' {
	interface Components {
		'c-ripple': Ripple;
	}
}

declare global {
	interface PointerEvent {
		cxlRipple?: HTMLElement;
	}
	interface MouseEvent {
		cxlRipple?: HTMLElement;
	}
}

function attachRipple<T extends HTMLElement>(
	hostEl: T,
	ev?: PointerEvent | MouseEvent | KeyboardEvent,
	rect = hostEl.getBoundingClientRect(),
) {
	const radius = rect.width > rect.height ? rect.width : rect.height;
	const ripple = new Ripple();
	const parent = hostEl.shadowRoot || hostEl;
	const { x, y } = (ev as MouseEvent) ?? {};
	// Add to shadow root if present to avoid layout changes
	const isKeyboard = x === undefined || !ev || isKeyboardClick(ev);
	const isOut =
		x > rect.right || x < rect.left || y > rect.bottom || y < rect.top;
	ripple.x = isKeyboard || isOut ? rect.width / 2 : x - rect.left;
	ripple.y = isKeyboard || isOut ? rect.height / 2 : y - rect.top;
	ripple.radius = radius;
	if (!ev) ripple.duration = 0;
	parent.prepend(ripple);
	return ripple;
}

export function activeRipple(
	host: Component & { selected: boolean },
	attachTo: HTMLElement = host,
) {
	let ripple: Ripple, ev: MouseEvent | undefined;
	let rect: DOMRect;
	const show = () => {
		ripple = attachRipple(
			attachTo,
			ev instanceof Event ? ev : undefined,
			rect,
		);
		ripple.duration = 600;
		ev = undefined;
	};
	return merge(
		// onVisible is needed so the element rect is defined for the ripple to display correctly.
		on(host, 'click').tap(event => {
			ev = event;
			rect = attachTo.getBoundingClientRect();
		}),
		get(host, 'selected')
			.raf()
			.switchMap(() => {
				if (host.selected) {
					if (!ripple?.parentNode) {
						if (isHidden(host)) {
							ev = undefined;
							return onVisible(host).tap(show);
						}
						show();
					}
				} else if (ripple) {
					animateRemove(ripple);
				}
				return EMPTY;
			}),
	).ignoreElements();
}

function animateRemove(ripple: Ripple) {
	return new Promise<void>(resolve => {
		const remove = animate({ target: ripple, animation: 'fadeOut' });
		remove.addEventListener('finish', () => {
			ripple.remove();
			resolve();
		});
	});
}

/**
 * Attaches a ripple element (c-ripple) to a host element upon a mouse or keyboard event.
 * Positions the ripple element based on the event coordinates.
 */
export function ripple(
	element: HTMLElement & { disabled?: boolean },
	eventElement = element,
) {
	let hasRipple = false,
		start = 0;
	return merge(on(eventElement, 'pointerdown'), on(eventElement, 'click'))
		.tap(ev => (ev.cxlRipple ??= element))
		.raf()
		.mergeMap(ev => {
			if (
				ev.cxlRipple === element &&
				!hasRipple &&
				!element.disabled &&
				element.parentNode
			) {
				start = Date.now();
				hasRipple = true;
				element.style.setProperty('--cxl-mask-hover', 'none');
				const ripple = attachRipple(element, ev);
				const time = ripple.duration;
				const done = () => {
					element.style.removeProperty('--cxl-mask-hover');
					animateRemove(ripple).then(() => {
						hasRipple = false;
					});
				};
				return ev.type === 'click'
					? timer(time).tap(done)
					: merge(
							on(document, 'pointerup'),
							on(document, 'pointercancel'),
					  )
							.first()
							.map(() => {
								const d = Date.now() - start;
								setTimeout(
									() => done(),
									d > time ? 32 : time - d,
								);
							});
			}
			return EMPTY;
		});
}

/**
 * The Ripple component adds a visual ripple effect to clickable elements.
 */
export class Ripple extends Component {
	/**
	 * Controls the horizontal position of the ripple effect's origin
	 * @attribute
	 */
	x = 0;
	/**
	 * Controls the vertical position of the ripple effect's origin.
	 * @attribute
	 */
	y = 0;

	/**
	 * Determines the size of the ripple wave.
	 * @attribute
	 */
	radius = 0;

	duration = 500;
}

component(Ripple, {
	tagName: 'c-ripple',
	init: [attribute('x'), attribute('y'), attribute('radius')],
	augment: [
		css(`
:host {
	display: block;
	position: absolute;
	overflow: hidden;
	top: 0;
	left: 0;
	right: 0;
	bottom: 0;
	pointer-events: none;
	direction: ltr;
}
.ripple {
	position: relative;
	background-image: inherit;
	border-radius: 100%;
	background-color: var(--cxl-color-ripple, color-mix(in srgb, var(--cxl-color-on-surface) 16%, transparent));
}`),
		host => {
			const el = document.createElement('div');
			el.className = 'ripple';

			return observable(() => {
				const style = el.style;
				style.translate = `${host.x - host.radius}px ${
					host.y - host.radius
				}px`;
				style.width = style.height = host.radius * 2 + 'px';
				if (!el.parentNode) getShadow(host).append(el);
				animate({
					target: el,
					animation: 'expand',
					options: { duration: host.duration },
				});
				animate({
					target: el,
					animation: 'fadeIn',
					options: { duration: host.duration / 2 },
				});
			});
		},
	],
});
