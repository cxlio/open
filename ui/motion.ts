import {
	AnimationKey,
	AnimationOptions,
	animation,
	isAnimationKey,
} from './animation.js';
import { merge } from './rx.js';
import type { ToggleTarget } from './toggle-target.js';

export type MotionOptions = Omit<AnimationOptions, 'target'>;

export type Motion = MotionOptions[] | string;
export type MotionTargetType = Element | Element[] | HTMLCollection;
export type MotionHost = ToggleTarget;

let style: CSSStyleDeclaration;

function parseTime(time: string) {
	if (time === '0s' || time === 'auto') return undefined;
	const f = time.endsWith('ms') ? 1 : 1000;
	return parseFloat(time) * f;
}

function parseNumber(num: string) {
	return num === 'infinite' ? Infinity : +num;
}

/**
 * Function to parse CSS animation property value into an object
 */
export function parseAnimation(animation: string): MotionOptions {
	if (isAnimationKey(animation)) return { animation };
	// Firefox does not support auto, so replacing it with a random value
	const autoDuration = animation.startsWith('auto ');
	if (autoDuration) animation = '0s ' + animation.slice(5);

	const options: KeyframeAnimationOptions = {};

	let stagger;
	animation = animation.replace(
		/stagger:(\d+)|composition:(\w+)/g,
		(_, stag, comp) => {
			if (stag) stagger = +stag;
			if (comp) options.composite = comp as CompositeOperation;
			return '';
		},
	);

	style ??= document.createElement('style').style;
	style.animation = animation;
	options.fill = style.animationFillMode as FillMode;

	// If fill is needed we keep the animation active
	const keep = options.fill === 'forwards' || options.fill === 'both';

	const duration = autoDuration
		? undefined
		: parseTime(style.animationDuration);
	if (duration !== undefined) options.duration = duration;
	const delay = parseTime(style.animationDelay);
	if (delay !== undefined) options.delay = delay;

	if (style.animationIterationCount)
		options.iterations = parseNumber(style.animationIterationCount);

	return {
		animation: style.animationName as AnimationKey,
		keep,
		stagger,
		options,
	};
}

export function parseMotion(value: Motion): MotionOptions[] {
	if (typeof value === 'string')
		value = value.split(',').map(an => parseAnimation(an.trim()));
	return value;
}

/**
 * Triggers a predefined set of animations on the specified target element.
 */
export function motion(
	host: Element,
	target: MotionTargetType,
	motion: Motion,
	state?: string,
) {
	const attr = state ? `motion-${state}-on` : 'motion-on';
	const parsed = parseMotion(motion);
	host.setAttribute(attr, '');

	return merge(...parsed.map(a => animation({ target, ...a }))).finalize(() =>
		host.removeAttribute(attr),
	);
}
