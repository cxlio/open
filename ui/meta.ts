import { Component, component, create } from './component.js';
import { observable, merge, timer } from './rx.js';
import { breakpoint, font, themeName, onFontsReady } from './theme.js';
import { onLoad } from './dom.js';

export function applyMeta(owner = document) {
	document.documentElement.lang = 'en';
	const metas = [
		create('meta', {
			name: 'viewport',
			content: 'width=device-width, initial-scale=1',
		}),
		create('meta', {
			name: 'apple-mobile-web-app-capable',
			content: 'yes',
		}),
		create('meta', { name: 'mobile-web-app-capable', content: 'yes' }),
		create(
			'style',
			undefined,
			`html{height:100%;}html,body{padding:0;margin:0;min-height:100%;${font(
				'body-large',
			)}}
			a{color:var(--cxl-color-on-surface)}
			`,
		),
	];
	owner.head.append(...metas);
	return metas;
}

export function onPageReady(timeout = 2000) {
	return merge(timer(timeout), onFontsReady()).first();
}

export function isPageReady(target: Element) {
	return onPageReady().raf(() => target.setAttribute('ready', ''));
}

export function metaBehavior($: Component) {
	return merge(
		observable(subs => {
			const elements = applyMeta($.ownerDocument ?? document);
			subs.signal.subscribe(() => elements.forEach(e => e.remove()));
		}),
		onLoad().raf(() => {
			const tpl = $.firstElementChild;
			if (tpl instanceof HTMLTemplateElement) {
				$.append(tpl.content);
				tpl.remove();
			}
		}),
		onPageReady().switchMap(() =>
			// Avoid layout recalculation by delaying it
			breakpoint($).raf(key => $.setAttribute('breakpoint', key)),
		),
		isPageReady($),
		themeName.raf(name =>
			name ? $.setAttribute('theme', name) : $.removeAttribute('theme'),
		),
	);
}

/**
 * The c-meta component simplifies the management of essential meta tags and baseline
 * styles required for most web applications.
 * @beta
 */
export class Meta extends Component {
	connectedCallback() {
		requestAnimationFrame(() => applyMeta(this.ownerDocument || document));
		super.connectedCallback();
	}
}
component(Meta, {
	tagName: 'c-meta',
	augment: [() => isPageReady(document.body)],
});
