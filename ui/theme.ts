import { Observable, be, ref, fromAsync } from './rx.js';
import { storage } from './util.js';
import {
	Component,
	attribute,
	cssSymbol,
	getShadow,
	setAttribute,
} from './component.js';
import { onResize } from './dom.js';

type ArrayElement<ArrayType extends readonly unknown[]> =
	ArrayType extends readonly (infer ElementType)[] ? ElementType : never;

export interface SvgIconAttributes {
	className?: string;
	width?: number;
	height?: number;
	alt?: string;
	fill?: boolean;
}
export type Elevation = 0 | 1 | 2 | 3 | 4 | 5;
export type Size = ArrayElement<typeof SizeValues>;

export type Theme = typeof theme;
export type SurfaceColorKey = ArrayElement<typeof surfaceColors>;
export type SurfaceColorValue = SurfaceColorKey | 'inherit' | 'transparent';
export type IconDefinition = {
	width?: number;
	height?: number;
	fill?: boolean;
	name: string;
};
export type IconFactory = (icon: IconDefinition) => Node;
export type IconFunction = (prop?: SvgIconAttributes) => SVGSVGElement;

export interface IconDef {
	id: string;
	icon: IconFunction;
}
export type BaseColorKey = keyof typeof baseColors;
export type Color = 'currentColor' | 'inherit' | 'transparent';
export type BreakpointKey =
	| 'xsmall'
	| 'small'
	| 'medium'
	| 'large'
	| 'xlarge'
	| 'xxlarge';

export type Typography = (typeof TypographyValues)[number];

type Keyframes = Keyframe[] | PropertyIndexedKeyframes;

export interface AnimationDefinition {
	kf: Keyframes | ((target: Element) => Keyframes);
	options?: KeyframeAnimationOptions;
}

export interface Breakpoints {
	xsmall: number;
	small: number;
	large: number;
	medium: number;
	xlarge: number;
	xxlarge: number;
}
export type ThemeDefinition = Partial<Omit<ThemeBase, 'css'>> & {
	name: string;
};
export interface ThemeBase {
	name: string;
	animation: Record<string, AnimationDefinition>;
	//isRTL: boolean;
	easing: {
		emphasized: string;
		emphasized_accelerate: string;
		emphasized_decelerate: string;
		standard: string;
		standard_accelerate: string;
		standard_decelerate: string;
	};
	colors: typeof baseColors;
	disableAnimations: boolean;
	prefersReducedMotion: boolean;
	globalCss: string;
	css: string;
	breakpoints: Breakpoints;
	imports?: readonly string[];
	override?: Record<string, string>;
}

export const SizeValues = [-2, -1, 0, 1, 2, 3, 4, 5] as const;
export const TypographyValues = [
	'display-large',
	'display-medium',
	'display-small',
	'body-large',
	'body-medium',
	'body-small',
	'label-large',
	'label-medium',
	'label-small',
	'headline-large',
	'headline-medium',
	'headline-small',
	'title-large',
	'title-medium',
	'title-small',
	'code',
] as const;

export const onThemeChange = ref<
	| { theme: Partial<ThemeBase>; stylesheet: CSSStyleSheet; css: string }
	| undefined
>();
export const themeName = be('');

export const disabledStyles = css(`:host([disabled]) {
	cursor: default;
	pointer-events: var(--cxl-override-pointer-events, none);
}`);

const hasRobotoFont = (() => {
	// 2023-12-07 Firefox bug prevents iteration of document.font.keys
	for (const font of Array.from(document.fonts.keys()))
		if (font.family === 'Roboto') return true;
	return false;
})();

const baseColors = {
	primary: '#186584',
	'on-primary': '#FFFFFF',
	'primary-container': '#C1E8FF',
	'on-primary-container': '#004D67',
	secondary: '#4E616C',
	'on-secondary': '#FFFFFF',
	'secondary-container': '#D1E6F3',
	'on-secondary-container': '#364954',
	tertiary: '#5F5A7D',
	'on-tertiary': '#FFFFFF',
	'tertiary-container': '#E5DEFF',
	'on-tertiary-container': '#474364',
	error: '#BA1A1A',
	'on-error': '#FFFFFF',
	'error-container': '#FFDAD6',
	'on-error-container': '#93000A',
	background: '#F6FAFE',
	'on-background': '#171C1F',
	surface: '#F6FAFE',
	'on-surface': '#171C1F',
	'surface-variant': '#DCE3E9',
	'on-surface-variant': '#40484D',
	outline: '#71787D',
	'outline-variant': '#C0C7CD',
	shadow: '#000000',
	scrim: '#000000',
	'inverse-surface': '#2C3134',
	'on-inverse-surface': '#EDF1F5',
	'inverse-primary': '#8ECFF2',
	'primary-fixed': '#C1E8FF',
	'on-primary-fixed': '#001E2B',
	'primary-fixed-dim': '#8ECFF2',
	'on-primary-fixed-variant': '#004D67',
	'secondary-fixed': '#D1E6F3',
	'on-secondary-fixed': '#091E28',
	'secondary-fixed-dim': '#B5C9D7',
	'on-secondary-fixed-variant': '#364954',
	'tertiary-fixed': '#E5DEFF',
	'on-tertiary-fixed': '#1B1736',
	'tertiary-fixed-dim': '#C9C2EA',
	'on-tertiary-fixed-variant': '#474364',
	'surface-dim': '#D6DADE',
	'surface-bright': '#F6FAFE',
	'surface-container-lowest': '#FFFFFF',
	'surface-container-low': '#F0F4F8',
	'surface-container': '#EAEEF2',
	'surface-container-high': '#E5E9ED',
	'surface-container-highest': '#DFE3E7',

	warning: '#DD2C00',
	'on-warning': '#FFFFFF',
	'warning-container': '#FFF4E5',
	'on-warning-container': '#8C1D18',
	success: '#2E7D32',
	'on-success': '#FFFFFF',
	'success-container': '#81C784',
	'on-success-container': '#000000',
};

export function buildMenuStyles(sel = '') {
	return `
:host ${sel} {
	${surface('surface-container')}
	overflow-y: auto;
	padding: 8px 0;
	min-width: 112px;
	max-width: 280px;
	width: max-content;
	border-radius: var(--cxl-shape-corner-xsmall);
	cursor: default;
	z-index: 2;
}
:host([static]) ${sel} { max-width: none; }
		`;
}

function buildPalette(colors = baseColors) {
	return Object.entries(colors)
		.map(
			([key, value]) =>
				`--cxl-color--${key}:${value};--cxl-color-${key}:var(--cxl-color--${key});`,
		)
		.join('');
}

export const theme = {
	name: '',
	animation: {
		flash: {
			kf: { opacity: [1, 0, 1, 0, 1] },
			options: { easing: 'ease-in' },
		},
		spin: {
			kf: { rotate: ['0deg', '360deg'] },
		},
		pulse: {
			kf: { rotate: ['0deg', '360deg'] },
			options: { easing: 'steps(8)' },
		},
		openY: { kf: el => ({ height: ['0', `${el.scrollHeight}px`] }) },
		closeY: { kf: el => ({ height: [`${el.scrollHeight}px`, '0'] }) },
		expand: { kf: { scale: [0, 1] } },
		expandX: { kf: { scale: ['0 1', '1 1'] } },
		expandY: { kf: { scale: ['1 0', '1 1'] } },
		zoomIn: { kf: { scale: [0.3, 1] } },
		zoomOut: { kf: { scale: [1, 0.3] } },

		scaleUp: { kf: { scale: [1, 1.25] } },

		fadeIn: { kf: [{ opacity: 0 }, { opacity: 1 }] },
		fadeOut: { kf: [{ opacity: 1 }, { opacity: 0 }] },
		shakeX: {
			/*kf: () => ({
			translate: randomShake(10, 8, 'x'),
		}),*/
			kf: {
				translate: [
					'0',
					'-10px',
					'10px',
					'-10px',
					'10px',
					'-10px',
					'10px',
					'-10px',
					'10px',
					'0',
				],
			},
		},
		shakeY: {
			/*kf: {
			translate: [ '0', 'var(--cxl-animation-shakeX)', '0' ],
		},*/
			kf: {
				translate: [
					'0',
					'0 -10px',
					'0 10px',
					'0 -10px',
					'0 10px',
					'0 -10px',
					'0 10px',
					'0 -10px',
					'0 10px',
					'0',
				],
			},
		},
		slideOutLeft: { kf: { translate: ['0', '-100% 0'] } },
		slideInLeft: { kf: { translate: ['-100% 0', '0'] } },
		slideOutRight: { kf: { translate: ['0', '100% 0'] } },
		slideInRight: { kf: { translate: ['100% 0', '0'] } },
		slideInUp: { kf: { translate: ['0 100%', '0'] } },
		slideInDown: { kf: { translate: ['0 -100%', '0'] } },
		slideOutUp: { kf: { translate: ['0', '0 -100%'] } },
		slideOutDown: { kf: { translate: ['0', '0 100%'] } },
		focus: {
			kf: [
				{ offset: 0.1, filter: 'brightness(150%)' },
				{ filter: 'brightness(100%)' },
			],
			options: { duration: 500 },
		},
	},

	easing: {
		emphasized: 'cubic-bezier(0.2, 0.0, 0, 1.0)',
		emphasized_accelerate: 'cubic-bezier(0.05, 0.7, 0.1, 1.0)',
		emphasized_decelerate: 'cubic-bezier(0.3, 0.0, 0.8, 0.15)',
		standard: 'cubic-bezier(0.2, 0.0, 0, 1.0)',
		standard_accelerate: 'cubic-bezier(0, 0, 0, 1)',
		standard_decelerate: 'cubic-bezier(0.3, 0, 1, 1)',
	},
	breakpoints: {
		xsmall: 0,
		small: 600,
		medium: 905,
		large: 1240,
		xlarge: 1920,
		xxlarge: 2560,
	},
	//isRTL: false as boolean,
	disableAnimations: false as boolean,
	prefersReducedMotion: window.matchMedia('(prefers-reduced-motion: reduce)')
		.matches,
	colors: baseColors,
	imports: hasRobotoFont
		? undefined
		: [
				'https://fonts.googleapis.com/css2?family=Roboto+Mono:wght@400&family=Roboto:wght@300;400;500;700&display=swap',
		  ],
	globalCss: `:root{
--cxl-color-scrim: rgb(29 27 32 / 0.5); /* neutral 10? #1D1B20 */

--cxl-font-family: Roboto;
--cxl-font-monospace:"Roboto Mono", monospace;

--cxl-font-display-large: 400 57px/64px var(--cxl-font-family);
--cxl-letter-spacing-display-large: -0.25px;
--cxl-font-display-medium: 400 45px/52px var(--cxl-font-family);
--cxl-letter-spacing-display-medium: 0;
--cxl-font-display-small: 400 36px/44px var(--cxl-font-family);
--cxl-letter-spacing-display-small: 0;
--cxl-font-headline-large: 400 32px/40px var(--cxl-font-family);
--cxl-letter-spacing-headline-large: -0.25px;
--cxl-font-headline-medium: 400 28px/36px var(--cxl-font-family);
--cxl-letter-spacing-headline-medium: 0;
--cxl-font-headline-small: 400 24px/32px var(--cxl-font-family);
--cxl-letter-spacing-headline-small: 0;
--cxl-font-title-large: 400 22px/28px var(--cxl-font-family);
--cxl-letter-spacing-title-large: 0;
--cxl-font-title-medium: 500 16px/24px var(--cxl-font-family);
--cxl-letter-spacing-title-medium: 0.15px;
--cxl-font-title-small: 500 14px/20px var(--cxl-font-family);
--cxl-letter-spacing-title-small: 0.1px;
--cxl-font-body-large: 400 16px/24px var(--cxl-font-family);
--cxl-letter-spacing-body-large: normal;
--cxl-font-body-medium: 400 14px/20px var(--cxl-font-family);
--cxl-letter-spacing-body-medium: 0.25px;
--cxl-font-body-small: 400 12px/16px var(--cxl-font-family);
--cxl-letter-spacing-body-small: 0.4px;
--cxl-font-label-large: 500 14px/18px var(--cxl-font-family);
--cxl-letter-spacing-label-large: 0.1px;
--cxl-font-label-medium: 500 12px/16px var(--cxl-font-family);
--cxl-letter-spacing-label-medium: 0.5px;
--cxl-font-label-small: 500 11px/16px var(--cxl-font-family);
--cxl-letter-spacing-label-small: 0.5px;
--cxl-font-code:400 14px var(--cxl-font-monospace);
--cxl-letter-spacing-code: 0.2px;

--cxl-font-weight-bold: 700;
--cxl-font-weight-label-large-prominent: var(--cxl-font-weight-bold);

--cxl-speed:200ms;

--cxl-elevation-1: rgb(0 0 0 / .2) 0 2px 1px -1px, rgb(0 0 0 / .14) 0 1px 1px 0, rgb(0 0 0 / .12) 0px 1px 3px 0;
--cxl-elevation-2: rgb(0 0 0 / .2) 0 3px 3px -2px, rgb(0 0 0 / .14) 0 3px 4px 0, rgb(0 0 0 / .12) 0px 1px 8px 0;
--cxl-elevation-3: rgba(0, 0, 0, 0.2) 0px 3px 3px -2px, rgba(0, 0, 0, 0.14) 0px 3px 4px 0px, rgba(0, 0, 0, 0.12) 0px 1px 8px 0px;;
--cxl-elevation-4: rgba(0, 0, 0, 0.2) 0px 3px 3px -2px, rgba(0, 0, 0, 0.14) 0px 3px 4px 0px, rgba(0, 0, 0, 0.12) 0px 1px 8px 0px;
--cxl-elevation-5: rgba(0, 0, 0, 0.2) 0px 3px 3px -2px, rgba(0, 0, 0, 0.14) 0px 3px 4px 0px, rgba(0, 0, 0, 0.12) 0px 1px 8px 0px;

--cxl-shape-corner-xlarge: 28px;
--cxl-shape-corner-large: 16px;
--cxl-shape-corner-medium: 12px;
--cxl-shape-corner-small: 8px;
--cxl-shape-corner-xsmall: 4px;
--cxl-shape-corner-full: 50vh;
}
	`,
	css: '',
} satisfies ThemeBase;

export function buildMask(sel = '') {
	return `:host ${sel} {
--cxl-mask-hover: color-mix(in srgb, var(--cxl-color-on-surface) 8%, transparent);
--cxl-mask-focus: color-mix(in srgb, var(--cxl-color-on-surface) 10%, transparent);
--cxl-mask-active: linear-gradient(0, var(--cxl-color-surface-container),var(--cxl-color-surface-container));
}
:host(:hover) ${sel} { background-image: linear-gradient(0, var(--cxl-mask-hover),var(--cxl-mask-hover)); }
:host(:focus-visible) ${sel} { background-image: linear-gradient(0, var(--cxl-mask-focus),var(--cxl-mask-focus)) }
:host{-webkit-tap-highlight-color: transparent}
`;
}

export function elevation(n: Elevation) {
	return `box-shadow:var(--cxl-elevation-${n});z-index:${n};`;
}

export const maskStyles = css(buildMask());

export type Spacing = ArrayElement<typeof spacingValues>;
export const spacingValues = [0, 4, 8, 16, 24, 32, 48, 64] as const;

let themeEl: CSSStyleSheet;
let globalCss: CSSStyleSheet | undefined;
let themeCss: CSSStyleSheet | undefined;

export function media(bpkey: BreakpointKey, css: string) {
	if (bpkey === 'xsmall')
		return `@media(max-width:${theme.breakpoints.small}px){${css}}`;

	const bp = theme.breakpoints[bpkey];
	return `@media(min-width:${bp}px){${css}}`;
}

/**
 * Observes the width of the given HTML element and emits the current adaptive breakpoint key.
 * This helps components respond dynamically to container size changes rather than just viewport size.
 */
export function breakpoint(el: HTMLElement): Observable<BreakpointKey> {
	return onResize(el).map(ev => {
		const breakpoints = theme.breakpoints;
		const width = ev.contentRect.width; //el.clientWidth;
		let newClass: BreakpointKey = 'xsmall';
		for (const bp in breakpoints) {
			if (breakpoints[bp as keyof typeof breakpoints] > width)
				return newClass;
			newClass = bp as BreakpointKey;
		}
		return newClass;
	});
}

function colorCss(selector = '') {
	return Object.entries(ColorStyles)
		.map(([key, value]) => `:host([color=${key}]) ${selector}{ ${value} }`)
		.join('');
}

export function colorAttribute<
	T extends Component,
	K extends Extract<keyof T, string>,
>(name: K, defaultColor?: SurfaceColorValue, selector = '') {
	return cssAttribute<T, K>(
		name,
		`
		${defaultColor ? `:host ${selector} { ${ColorStyles[defaultColor]} }` : ''}
		:host${defaultColor ? '' : '([color])'} ${selector} {
			color: var(--cxl-color-on-surface);
			background-color: var(--cxl-color-surface);
		}
		:host([color=transparent]) ${selector}{
			color: inherit;
			background-color: transparent;
		}
		${colorCss(selector)}
	`,
	);
}

export function cssAttribute<
	T extends Component,
	K extends Extract<keyof T, string>,
>(name: K, styles: string) {
	const el = css(styles);
	return attribute<T, K>(name, {
		persist: setAttribute,
		render: host => el(host),
	});
}

export function sizeAttribute<
	T extends Component,
	K extends Extract<keyof T, string>,
>(name: K, fn: (size: Size) => string) {
	return cssAttribute<T, K>(
		name,
		SizeValues.map(val => {
			const css = fn(val);
			return val === 0 ? `:host ${css}` : `:host([size="${val}"]) ${css}`;
		}).join(''),
	);
}

function removeTheme() {
	const index = document.adoptedStyleSheets.indexOf(themeEl);
	if (index !== -1) document.adoptedStyleSheets.splice(index, 1);
}

export function loadThemeDefinition(def: ThemeDefinition) {
	if (themeEl) removeTheme();
	let globalCss = def.globalCss ?? '';
	if (def.colors) globalCss += `:root{${buildPalette(def.colors)}}`;
	if (globalCss) {
		themeEl = newStylesheet(globalCss);
		document.adoptedStyleSheets.push(themeEl);
	}
	onThemeChange.next({
		theme: def,
		stylesheet: themeEl,
		css: globalCss,
	});
	themeName.next(def.name);
}

let lastThemeUrl = '';
export function loadTheme(name: string, key: string) {
	if (!name) {
		if (themeEl) {
			removeTheme();
			onThemeChange.next(undefined);
			themeName.next('');
		}
	} else if (name !== lastThemeUrl) {
		import(name).then(mod => loadThemeDefinition(mod.default));
	}
	if (key) storage.set(key, name);
	lastThemeUrl = name;
}

export function observeTheme(host: Component) {
	let themeOverride: CSSStyleSheet;
	return onThemeChange.tap(theme => {
		const css = theme?.theme.override?.[host.tagName];
		if (css) {
			if (!themeOverride)
				host.shadowRoot?.adoptedStyleSheets.push(
					(themeOverride ??= newStylesheet(css)),
				);
			else themeOverride.replace(css);
		} else if (themeOverride) themeOverride.replace('');
	});
}

export function newStylesheet(css: string) {
	const themeCss = new CSSStyleSheet();
	if (css) themeCss.replaceSync(css);
	return themeCss;
}

export function stylesheet(host: Component, css = '') {
	const ss = newStylesheet(css);
	getShadow(host).adoptedStyleSheets.push(ss);
	return ss;
}

export function css(styles: string) {
	let stylesheet: CSSStyleSheet;
	return (host: Component) => {
		const shadow = getShadow(host);
		// Create and populate the stylesheet once
		shadow.adoptedStyleSheets.push((stylesheet ??= newStylesheet(styles)));

		// Handle global styles only once per host
		if (!host[cssSymbol]) {
			if (theme.css)
				shadow.adoptedStyleSheets.unshift(
					(themeCss ??= newStylesheet(theme.css)),
				);
			host[cssSymbol] = true;
			return observeTheme(host);
		}
	};
}

const surfaceColors = [
	'background',
	'primary',
	'primary-container',
	'secondary',
	'secondary-container',
	'tertiary',
	'tertiary-container',
	'surface',
	'surface-container',
	'surface-container-low',
	'surface-container-lowest',
	'surface-container-highest',
	'surface-container-high',
	'error',
	'error-container',
	'success',
	'success-container',
	'warning',
	'warning-container',
	'inverse-surface',
	'inverse-primary',
] as const;

export const SurfaceColorNames = [...surfaceColors, 'inherit'];

function resetSurface(
	color: SurfaceColorKey,
	dest: SurfaceColorKey = 'surface',
) {
	return `--cxl-color-${dest}: var(--cxl-color--${color});
--cxl-color-on-${dest}: var(--cxl-color--on-${color}, var(--cxl-color--on-surface));
--cxl-color-surface-variant: var(--cxl-color--${
		color === 'surface' ? 'surface-variant' : color
	});
--cxl-color-on-surface-variant: ${
		color.includes('surface')
			? 'var(--cxl-color--on-surface-variant)'
			: `color-mix(in srgb, var(--cxl-color--on-${color}) 80%, transparent)`
	};
`;
}

export function colorMix(
	color: SurfaceColorKey,
	percent: number,
	color2 = 'transparent',
) {
	return `color-mix(in srgb, var(--cxl-color-${color}) ${percent}%,${color2})`;
}

export function surface(color: SurfaceColorKey) {
	return `${resetSurface(
		color,
	)};background-color:var(--cxl-color-surface);color:var(--cxl-color-on-surface);`;
}

export const ColorStyles = surfaceColors.reduce(
	(r, v) => {
		r[v] = `
${resetSurface(v)}
${v === 'inverse-surface' ? resetSurface('inverse-primary', 'primary') : ''}
`;
		return r;
	},
	{
		inherit: 'color:inherit;background-color:inherit;',
	} as Record<SurfaceColorValue, string>,
);

export const OutlineColorStyles = (prefix = '') =>
	`${prefix ? `:host(${prefix})` : ':host'} { 
	--cxl-color-surface: transparent; 
	border-style: solid; 
	border-color: var(--cxl-color-on-surface); 
	border-width: 1px; 
	box-shadow: none;
}
${surfaceColors
	.map(
		v =>
			`:host(${prefix}[color=${v}]) { --cxl-color-on-surface: var(--cxl-color--${v}); }`,
	)
	.join('')}
`;

export function scrollbarStyles(prefix = ':host'): string {
	return `
		${prefix} {
			scrollbar-color: var(--cxl-color-outline-variant) var(--cxl-color-surface, transparent);
		}
		${prefix}::-webkit-scrollbar-track {
			background-color: var(--cxl-color-surface, transparent);
		}
	`;
}

export function font(name: Typography) {
	return `font:var(--cxl-font-${name});letter-spacing:var(--cxl-letter-spacing-${name});`;
}

export function delayTheme(): void {
	cancelAnimationFrame(loadingId);
}
const loadingId = requestAnimationFrame(() => applyTheme());
const icons: Record<string, IconDef> = {};

const iconTemplate = document.createElement('template');
const iconCache: Record<string, SVGSVGElement> = {};

export function buildIconFactoryCdn(getUrl: (def: IconDefinition) => string) {
	return function (def: IconDefinition) {
		const href = getUrl(def);
		const cache = iconCache[href];
		if (cache) return cache.cloneNode(true);

		const el = document.createElementNS(
			'http://www.w3.org/2000/svg',
			'svg',
		);
		const error = () => (el.dispatchEvent(new ErrorEvent('error')), '');

		fetch(href)
			.then(res => (res.ok ? res.text() : error()), error)
			.then(svgText => {
				if (!svgText) return;

				iconTemplate.innerHTML = svgText;
				const svg = iconTemplate.content.children[0] as SVGSVGElement;
				if (!svg) return;
				const viewbox = svg.getAttribute('viewBox');
				if (viewbox) el.setAttribute('viewBox', viewbox);
				else if (
					svg.hasAttribute('width') &&
					svg.hasAttribute('height')
				)
					el.setAttribute(
						'viewBox',
						`0 0 ${svg.getAttribute('width')} ${svg.getAttribute(
							'height',
						)}`,
					);
				for (const child of svg.childNodes) el.append(child);

				iconCache[def.name] = el;
			});
		el.setAttribute('fill', 'currentColor');
		return el;
	};
}

/**
 * By default we use the material icons CDN to retrieve icon svg files.
 */
const iconFactoryCdn = buildIconFactoryCdn(({ name: id, width, fill }) => {
	if (width !== 20 && width !== 24 && width !== 40 && width !== 48)
		width = 48;
	return `https://cdn.jsdelivr.net/gh/google/material-design-icons@941fa95/symbols/web/${id}/materialsymbolsoutlined/${id}_${
		fill ? 'fill1_' : ''
	}${width}px.svg`;
});

let iconFactory = iconFactoryCdn;

export function registerDefaultIconFactory(fn: IconFactory) {
	iconFactory = fn;
}

export function registerIcon(icon: IconDef) {
	icons[icon.id] = icon;
}

export function getIcon(id: string, prop: SvgIconAttributes = {}) {
	let { width, height } = prop;
	if (width === undefined && height === undefined) width = height = 24;

	const svg =
		icons[id]?.icon() ||
		iconFactory({
			name: id,
			width,
			fill: prop.fill,
		});

	if (prop.className) svg.setAttribute('class', prop.className);

	if (width) {
		svg.setAttribute('width', `${width}`);
		if (height === undefined) svg.setAttribute('height', `${width}`);
	}
	if (height) {
		svg.setAttribute('height', `${height}`);
		if (width === undefined) svg.setAttribute('width', `${height}`);
	}
	if (prop.alt) svg.setAttribute('alt', prop.alt);

	return svg;
}

let resolveTheme: () => void;
export const themeReady = new Promise<void>(resolve => {
	resolveTheme = resolve;
});

export function applyTheme(newTheme?: ThemeDefinition) {
	cancelAnimationFrame(loadingId);

	// prevent style recalculation
	//theme.isRTL = getComputedStyle(document).direction === 'rtl';

	if (!globalCss) {
		if (newTheme) {
			if (newTheme.colors) theme.colors = newTheme.colors;
			if (newTheme.globalCss) theme.globalCss += newTheme.globalCss;
		}
		document.adoptedStyleSheets.push(
			(globalCss = newStylesheet(
				`:root { ${buildPalette(theme.colors)} }` + theme.globalCss,
			)),
		);

		if (theme.imports)
			Promise.allSettled(
				theme.imports.map(imp => {
					const link = document.createElement('link');
					link.rel = 'stylesheet';
					link.href = imp;
					document.head.append(link);
					return new Promise(
						(resolve, reject) => (
							(link.onload = resolve), (link.onerror = reject)
						),
					);
				}),
			).then(resolveTheme);
		else resolveTheme();
	}
}

/**
 * Returns an observable that resolves once theme and font resources are fully loaded.
 * Useful for coordinating UI updates dependent on custom font or theme readiness.
 */
export function onFontsReady() {
	return fromAsync(async () => {
		await themeReady;
		await document.fonts.ready;
	});
}
