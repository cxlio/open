import {
	Component,
	Slot,
	attribute,
	attributeChanged,
	component,
	styleAttribute,
	get,
	message,
} from './component.js';
import { on, onAction, onReady, hoveredOrFocused, getRoot } from './dom.js';
import { EMPTY, Observable, from, merge, combineLatest } from './rx.js';

import { getAriaId } from './a11y.js';
import { getTargetById } from './util.js';
import { displayContents } from './theme.js';
import { popupManager } from './popup-manager.js';

import type { ToggleTargetLike } from './toggle-target.js';

declare module './component' {
	interface Components {
		'c-toggle': Toggle;
	}
}

export interface ToggleComponent<T extends HTMLElement> extends Component {
	open: boolean;
	target?: string | T | T[];
	trigger?: 'click' | 'hover' | 'checked';
}

export const toggleClose = (el: Element, id?: string, host = el) =>
	onAction(el).tap(() => message(host, 'toggle.close', id));

export const toggleOpen = (el: Element, id?: string, host = el) =>
	onAction(el).tap(() => message(host, 'toggle.open', id));

export function getTargets<T extends HTMLElement>(host: ToggleComponent<T>) {
	const target = host.target;
	if (!target) return;
	if (typeof target === 'string')
		return target.split(' ').flatMap(t => {
			const result = getTargetById<T | string>(host, t);
			return result ? [result] : [];
		});

	return Array.isArray(target) ? target : [target];
}

export function toggleBehavior<T extends ToggleTargetLike>(
	trigger: Element,
	getTarget: () => T[] | undefined,
	isVisible: () => boolean,
	opened: Observable<boolean>,
	triggerAction = on(trigger, 'click').map(() => !isVisible()),
) {
	return merge(opened, triggerAction).switchMap(open => {
		const target = getTarget();
		if (!target) return EMPTY;
		return from(target.map(t => ({ target: t, open })));
	});
}

/**
 * This function provides a reusable behavior for toggling the visibility of a target
 * element based on user interaction with another element (the trigger).
 */
export function toggleComponent<T extends ToggleTargetLike>(
	host: ToggleComponent<T>,
	trigger: Element = host,
) {
	function eachTarget(targetEl: T, trigger: Element) {
		return [
			get(host, 'open').switchMap(val => {
				// We need to add target to the dom, so the open attribute works.
				if (!targetEl.parentNode)
					popupManager.popupContainer.append(targetEl);

				return val && targetEl instanceof Component
					? attributeChanged(
							targetEl as ToggleTargetLike,
							'open',
					  ).map(visible => {
							if (host.open && visible === false)
								host.open = false;
					  })
					: EMPTY;
			}),
			getAriaId(targetEl).tap(targetId => {
				const targetRole = targetEl.getAttribute('role');
				if (
					targetRole === 'menu' ||
					targetRole === 'listbox' ||
					targetRole === 'tree' ||
					targetRole === 'grid' ||
					targetRole === 'dialog'
				)
					trigger.ariaHasPopup = targetRole;

				if (trigger.getRootNode() === targetEl.getRootNode())
					trigger.setAttribute('aria-controls', targetId);
			}),
		];
	}

	const triggerAction = combineLatest(
		get(host, 'trigger'),
		get(host, 'target'),
	).switchMap(([trig]) => {
		const targetEl = getTargets(host);
		const targetBind = targetEl
			? merge(
					...targetEl.flatMap(t => eachTarget(t, host)),
			  ).ignoreElements()
			: EMPTY;

		return merge(
			trig === 'hover'
				? combineLatest(
						hoveredOrFocused(trigger),
						targetEl
							? merge(...targetEl.map(t => hoveredOrFocused(t)))
							: EMPTY,
				  )
						.map(values => !!values.find(v => !!v))
						.debounceTime(250)
				: trig === 'checked'
				? on(trigger, 'change').map(ev =>
						ev.target && 'checked' in ev.target
							? !!ev.target.checked
							: false,
				  )
				: on(trigger, 'click')
						//.debounceTime(60)
						//.raf()
						.map(() => !host.open),
			targetBind,
		);
	});

	let returnFocus: HTMLElement | null | undefined;

	return onReady().switchMap(() =>
		toggleBehavior(
			trigger,
			() => getTargets(host),
			() => host.open,
			get(host, 'open'),
			triggerAction,
		).filter(ev => {
			const { open, target } = ev;
			if (host.open !== open) {
				if (open) {
					returnFocus = getRoot(host)?.activeElement as
						| HTMLElement
						| undefined;
					target.trigger = host;
				} else if (target.trigger) {
					if (target.trigger !== host) {
						ev.open = true;
						target.trigger = host;
						return true;
					}
				}

				host.open = open;
				return false;
			}
			if (!open && target.trigger === host) {
				const newFocus = document.activeElement;
				if (
					newFocus === document.body ||
					newFocus === document.documentElement
				)
					returnFocus?.focus();
			}
			return true;
		}),
	);
}
/**
 * The ToggleBase class serves as a foundation for creating components that manage
 * the visibility of one or more target elements. It provides attributes and logic
 * necessary for basic visibility toggling, such as `open` to track the visibility
 * state and `target` to identify the associated element(s).
 */
export class ToggleBase extends Component {
	/**
	 * This attribute controls the initial visibility state of the target element.
	 * Set it to true to show the target element initially.
	 * @attribute
	 */
	open = false;

	/**
	 * This attribute specifies the ID or a reference to the element that should
	 * be shown/hidden when the toggle is interacted with.
	 *
	 * A space-separated string can be used to target multiple elements by their IDs.
	 * @attribute
	 */
	target?: string | ToggleTargetLike | ToggleTargetLike[];

	/**
	 * Specifies how the toggle is triggered by user interaction.
	 * - 'click' (default): toggles visibility on click.
	 * - 'hover': opens on hover/focus and closes when both trigger and target lose hover/focus.
	 * - 'checked': binds visibility to an input’s checked state.
	 * @attribute
	 */
	trigger?: 'hover' | 'click' | 'checked';
}

component(ToggleBase, {
	init: [attribute('target'), attribute('trigger'), styleAttribute('open')],
	augment: [
		$ => toggleComponent($).raf(({ target, open }) => (target.open = open)),
	],
});

/**
 * Toggle component for showing or hiding specified target element(s) via user
 * interaction. Works with one or more targets, referenced by id or element ref.
 *
 * Specify the target(s) using the `target` attribute as an id, space-separated
 * ids, or element reference(s). When triggered, toggles the `open` property on
 * the target(s) and the component.
 *
 * Supports usage within document or shadow DOM. The reference can be direct
 * or via the `target` attribute for more complex cases, like multiple targets.
 *
 * Sets the correct `aria-controls` and assigns `aria-haspopup` to the trigger
 * for accessible context to assistive technologies. Automatically updates
 * related accessibility attributes on targets.
 *
 * Works with any element that supports an `open` property. When the slot
 * content (like a button) triggers the toggle, the visible state is kept in
 * sync with the component and with its targets.
 *
 * @title Toggle Component for Show/Hide Control
 * @icon toggle_on
 * @tagName c-toggle
 * @demo
 * <c-toggle target="popup"><c-button>Toggle</c-button></c-toggle>
 * <c-toggle-panel id="popup">
 * <c-alert color="warning-container" aria-label="target popup" >Alert Content</c-alert>
 * </c-toggle-panel>
 *
 * @demoonly <caption>Toggle on checked</caption>
 * <c-toggle trigger="checked" target="popup"><c-checkbox>Toggle</c-checkbox></c-toggle>
 * <c-toggle-panel id="popup">
 * <c-alert color="warning-container" aria-label="target popup" >Alert Content</c-alert>
 * </c-toggle-panel>
 *
 */
export class Toggle extends ToggleBase {}

component(Toggle, {
	tagName: 'c-toggle',
	augment: [displayContents, Slot],
});
