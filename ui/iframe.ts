import {
	Component,
	attribute,
	get,
	getShadow,
	component,
	tsx,
} from './component.js';
import { EMPTY, combineLatest, merge } from './rx.js';
import { css, onThemeChange } from './theme.js';
import { on } from './dom.js';

const handleIframeTheme = () => {
	let themeEl: CSSStyleSheet;
	function removeTheme() {
		const index = document.adoptedStyleSheets.indexOf(themeEl);
		if (index !== -1) document.adoptedStyleSheets.splice(index, 1);
	}
	addEventListener('message', ev => {
		const { theme } = ev.data;
		removeTheme();
		if (theme !== undefined) {
			themeEl = new CSSStyleSheet();
			themeEl.replace(theme);
			document.adoptedStyleSheets.push(themeEl);
		}
	});
};

const handleIframeSize = () => {
	addEventListener('load', () => {
		const post = () => {
			parent.postMessage(
				{ height: document.documentElement.scrollHeight },
				'*',
			);
		};
		requestAnimationFrame(async () => {
			await document.fonts.ready;
			const observer = new ResizeObserver(post);
			observer.observe(document.documentElement);
		});
	});
};

/**
 * Defines a custom Iframe component for embedding HTML content
 * within an isolated, theme-aware, and auto-resizing iframe.
 * Handles theme synchronization and height adjustment between
 * host and iframe based on observed properties and theme changes.
 *
 * @tagName c-iframe
 * @alpha
 */
export class Iframe extends Component {
	/**
	 * Specifies the iframe URL to embed, or leave empty to use the inline HTML from `srcdoc`.
	 * @attribute
	 */
	src = '';

	/**
	 * Stores the HTML content to be rendered inside the iframe.
	 * @attribute
	 */
	srcdoc = '';

	/**
	 * Sets the default sandbox permissions for the iframe.
	 * @attribute
	 */
	sandbox?: string = 'allow-forms allow-scripts';

	/**
	 * Contains the HTML and CSS reset string used as the initial document structure for the iframe.
	 */
	reset =
		'<!DOCTYPE html><style>html{display:flex;flex-direction:column;font:var(--cxl-font-default);}body{padding:0;margin:0;translate:0;overflow:auto;}</style>';

	/**
	 * Indicates whether theme synchronization between host and iframe is enabled.
	 * When true, theme updates are propagated into the iframe.
	 * @attribute
	 */
	handletheme = true;
}

component(Iframe, {
	tagName: 'c-iframe',
	init: [
		attribute('src'),
		attribute('srcdoc'),
		attribute('sandbox'),
		attribute('handletheme'),
	],
	augment: [
		css(`
:host {
  position: relative;
  display: flex;
  flex-direction: column;
  background-color: transparent;
}
iframe {
  width: 100%;
  height: 0;
  opacity: 0;
  transition: opacity var(--cxl-speed);
  display: flex;
  border-style: none;
}
	`),
		host => {
			const iframeEl = tsx('iframe', { loading: 'lazy' });
			const loading = tsx('slot', { name: 'loading' });

			const style = new CSSStyleSheet();
			host.shadowRoot?.adoptedStyleSheets.push(style);

			loading.style.display = 'none';

			function update(height: number) {
				style.replaceSync(`:host{height:` + height + 'px}');
				iframeEl.style.height = '100%';
				iframeEl.style.opacity = '1';
				loading.style.display = 'none';
			}

			function setSource(src: string) {
				if (src) {
					const resize = `<script type="module">
(${handleIframeSize.toString()})();
(${handleIframeTheme.toString()})();
</script>`;
					iframeEl.srcdoc = `${host.reset}${src}${resize}`;
					loading.style.display = '';
				} else iframeEl.srcdoc = ``;
			}

			getShadow(host).append(iframeEl, loading);

			return merge(
				combineLatest(get(host, 'srcdoc'), get(host, 'src')).tap(
					async ([srcdoc, src]) => {
						setSource(
							src
								? `<base href="${src}" />` +
										(await fetch(src).then(r => r.text()))
								: srcdoc,
						);
					},
				),
				on(window, 'message').tap(ev => {
					const { height } = ev.data;
					if (
						ev.source === iframeEl.contentWindow &&
						height !== undefined
					)
						update(height);
				}),

				get(host, 'handletheme').switchMap(v =>
					v
						? on(iframeEl, 'load').switchMap(() =>
								onThemeChange.raf(def => {
									const theme = def?.css ?? '';
									iframeEl.contentWindow?.postMessage(
										{
											theme,
										},
										'*',
									);
								}),
						  )
						: EMPTY,
				),

				get(host, 'sandbox').tap(val =>
					val === undefined
						? iframeEl.removeAttribute('sandbox')
						: (iframeEl.sandbox.value = val),
				),
			);
		},
	],
});
