import { AnimationDefinition, theme } from './theme.js';
import { onVisibility, hovered } from './dom.js';
import { EMPTY, Observable, merge, of } from './rx.js';

export type AnimationKey = keyof typeof theme.animation;

export type AnimationOptions = Omit<AnimateOptions, 'target'> & {
	trigger?: 'visible' | 'hover';
	stagger?: number;
	target: Element | Element['children'] | Element[];
	commit?: boolean;
	keep?: boolean;
};

export type AnimationsOptions = Omit<AnimationOptions, 'animation'> & {
	animation: string;
};

/**
 * Interface for options used with the `animate` function.
 */
export interface AnimateOptions {
	target: Element;
	animation: AnimationKey | AnimationDefinition;
	options?: KeyframeAnimationOptions;
}

/**
 * Interface for animation events emitted by the `animation` function.
 */
export interface AnimationEvent {
	type: 'start' | 'end';
	/** Animation object associated with the event. */
	animation: Animation;
}

/*function randomShake(range = 10, count = 8, axis: 'x' | 'y' = 'x'): string[] {
	const frames: string[] = ['0'];
	for (let i = 0; i < count; i++) {
		const val = (Math.random() * 2 - 1) * range;
		const px = `${val.toFixed(2)}px`;
		frames.push(axis === 'x' ? px : `0 ${px}`);
	}
	frames.push('0');
	return frames;
}*/

export function isAnimationKey(key: string): key is AnimationKey {
	return key in theme.animation;
}

/**
 * Creates and starts an animation on the given target element based on the specified animation key or definition.
 * It determines the keyframes and options, respects user preference for reduced motion, and disables animations
 * if globally configured.
 *
 * @throws Error if the specified animation is not defined in the theme.
 */
export function animate({ target, animation, options }: AnimateOptions) {
	if (theme.disableAnimations) return target.animate(null);

	const animationDef = (
		typeof animation === 'string' ? theme.animation[animation] : animation
	) as AnimationDefinition;

	if (!animationDef) throw new Error(`Animation "${animation}" not defined`);

	const kf =
		typeof animationDef.kf === 'function'
			? animationDef.kf(target)
			: animationDef.kf;

	const resolved = {
		duration: 250,
		easing: theme.easing.emphasized,
		...animationDef.options,
		...options,
		...(theme.prefersReducedMotion ? { duration: 0 } : undefined),
	};
	return target.animate(kf, resolved);
}

/**
 * Function to create an observable that emits events when an animation starts and ends.
 *
 * @param options Options for the animation. Specifies the target element, animation key or definition, optional animation settings, and trigger type.
 * @returns Observable that emits AnimationEvent objects.
 */
export function animation(options: AnimationOptions) {
	const { trigger, stagger, commit, keep } = options;

	function animateEach(options: AnimateOptions) {
		return new Observable<AnimationEvent>(subs => {
			const result = animate(options);

			result.ready.then(
				() => subs.next({ type: 'start', animation: result }),
				() => {
					/* Ignore Error */
				},
			);
			result.addEventListener('finish', () => {
				subs.next({ type: 'end', animation: result });
				if (commit) result.commitStyles();
				if (
					keep ||
					(keep !== false &&
						options.options?.fill &&
						(options.options.fill === 'both' ||
							options.options.fill === 'forwards'))
				)
					return;

				subs.complete();
			});

			subs.signal.subscribe(() => {
				try {
					result.cancel();
				} catch (e) {
					/*Ignore Error*/
				}
			});
		});
	}
	const nodes = Array.isArray(options.target)
		? options.target
		: options.target instanceof Element
		? [options.target]
		: Array.from(options.target);

	return merge(
		...nodes.map((target, i) => {
			const options2 = {
				...options.options,
				delay:
					stagger !== undefined
						? (options.options?.delay ?? 0) + i * stagger
						: options.options?.delay,
			};

			const inner =
				trigger === 'visible'
					? // Throttle to prevent flashing
					  onVisibility(target).filter(v => v)
					: trigger === 'hover'
					? hovered(target)
					: of(true);

			return inner.switchMap(v =>
				v
					? animateEach({
							...options,
							options: options2,
							target,
					  })
					: EMPTY,
			);
		}),
	);
}

/*export function animations(options: AnimationsOptions) {
	return merge(
		...options.animation.split(' ').map(name => {
			return animation({
				...options,
				animation: name as AnimationKey,
			});
		}),
	);
}*/
