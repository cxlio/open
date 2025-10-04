import {
	Component,
	attributeChanged,
	component,
	create,
	attribute,
	styleAttribute,
	get,
	getShadow,
	onMessage,
	numberAttribute,
} from './component.js';
import { EMPTY, combineLatest, merge, timer, concat, defer, of } from './rx.js';
import { motion } from './motion.js';
import { css } from './theme.js';

import type { Motion, MotionTargetType } from './motion.js';

declare module './component.js' {
	interface Components {
		'c-toggle-target': ToggleTarget;
	}
}

export interface ToggleTargetLike extends Component {
	open?: boolean;
	dialog?: HTMLDialogElement;
	trigger?: Element;
}

export const toggleTargetStyles = css(
	`:host(:not([open],[motion-out-on])){display:none}`,
);

export function toggleTargetBehavior(
	$: ToggleTarget,
	getTarget: (state: string) => MotionTargetType = () => $,
	twoWay = false,
) {
	const getIn = defer(() => of(getTarget('in')));
	const getOut = defer(() => of(getTarget('out')));

	return merge(
		onMessage($, 'toggle.close')
			.tap(() => ($.open = false))
			.ignoreElements(),
		combineLatest(
			get($, 'motion-in').map(m =>
				m
					? getIn
							.switchMap(target => motion($, target, m, 'in'))
							.switchMap(() =>
								$.duration !== undefined &&
								$.duration !== Infinity
									? timer($.duration).map(
											() => ($.open = false),
									  )
									: EMPTY,
							)
					: getIn,
			),
			get($, 'motion-out').map(m =>
				(m
					? getOut.switchMap(target =>
							motion($, target, m, 'out').ignoreElements(),
					  )
					: getOut
				).finalize(() => {
					if (!$.open)
						$.dispatchEvent(
							// Close event should not bubble up
							new Event('close'),
						);
				}),
			),
		).switchMap(([motionIn, motionOut]) =>
			attributeChanged($, 'open').switchMap(val => {
				// Prevent trigger event twice when popover is on
				if ($.popover !== 'auto') {
					const newState = val ? 'open' : 'closed';
					// Toggle event does not bubble up
					$.dispatchEvent(
						new ToggleEvent('toggle', {
							oldState: val ? 'closed' : 'open',
							newState,
						}),
					);
				}

				if (val) return twoWay ? concat(motionOut, motionIn) : motionIn;

				return twoWay ? concat(motionOut, motionIn) : motionOut;
			}),
		),
	);
}

/**
 * The `ToggleTargetBase` class provides a foundation for components that manage
 * toggleable visibility or state. It defines core properties such as `open`,
 * motion-related attributes (`motion-in`, `motion-out`), and duration for timed
 * behavior. Subclasses such as `ToggleTarget` build upon this to integrate
 * additional capabilities like styling and slot management.
 */
export class ToggleTargetBase extends Component {
	/**
	 * Indicates whether the toggle target is currently open (visible/active).
	 * Setting this property to `true` displays the content with optional transition;
	 * setting to `false` hides it.
	 *
	 * @attribute
	 */
	open = false;

	/**
	 * The amount of time the toggle target stays open.
	 * @attribute
	 */
	duration?: number;

	/**
	 * Optional motion definition for the entering (show/open) transition.
	 * Determines the animation or effect used when displaying the toggle target. Accepts a `Motion` object or preset.
	 * @attribute
	 */
	'motion-in'?: Motion;

	/**
	 * Optional motion definition for the exiting (hide/close) transition.
	 * Controls the animation or effect used when hiding the toggle target. Accepts a `Motion` object or preset.
	 * @attribute
	 */
	'motion-out'?: Motion;
}

component(ToggleTargetBase, {
	init: [
		attribute('motion-in'),
		attribute('motion-out'),
		numberAttribute('duration'),
		styleAttribute('open'),
	],
});

/**
 * Toggles the rendering of its content based on the `open` state, with support
 * for custom enter/exit transitions and automatic timed closing. Use when you
 * need to show or hide elements in response to user actions or application
 * state, and require animation or delay capabilities.
 *
 * Set the `open` attribute to control visibility. Customize transitions using
 * `motion-in`, `motion-out` and related timing attributes. Use the `duration`
 * attribute to automatically close after a set time (ms). The default slot
 * holds the toggled content. The `off` named slot renders when not open,
 * making conditional UI possible without dynamic DOM manipulation.
 *
 * In forms or dialogs, control this component reactively for best results.
 * Dispatches a bubbling `toggle` event on state change and a `close` event on
 * finished hide transitions.
 *
 * ### Slots
 *
 * - `off`: Shown when the toggle target is not open.
 *
 * @title Animated visibility & state switch
 * @icon visibility
 * @tagName c-toggle-target
 *
 */
export class ToggleTarget extends ToggleTargetBase {}

component(ToggleTarget, {
	tagName: 'c-toggle-target',
	augment: [
		css(`
:host{display:contents}
`),
		$ => {
			const slot = create('slot');
			const offSlot = create('slot', { name: 'off' });
			($.open ? offSlot : slot).style.display = 'none';
			getShadow($).append(slot, offSlot);

			return toggleTargetBehavior(
				$,
				state => {
					slot.style.display = offSlot.style.display = 'none';
					const targetSlot = $.open
						? state === 'in'
							? slot
							: offSlot
						: state === 'in'
						? offSlot
						: slot;
					targetSlot.style.display = '';

					return targetSlot.assignedElements();
				},
				true,
			);
		},
	],
});
