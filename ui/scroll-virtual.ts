import { on, onResize, onVisibility } from './dom.js';
import { EMPTY, Observable, merge } from './rx.js';

export type ScrollRect = {
	offsetTop: number;
	offsetWidth: number;
	offsetHeight: number;
	offsetLeft: number;
};

export interface VirtualScrollBaseOptions {
	/**
	 * Number of total records
	 */
	dataLength: number;

	/**
	 * Scrolling axis. `y` by default.
	 */
	axis?: 'y' | 'x';

	/**
	 * Callback function. Called each time for every item that needs to be rendered.
	 */
	render: (
		index: number,
		order: number,
		type: 'pre' | 'post' | 'on',
	) => ScrollRect;

	/**
	 * Optional callback for cleaning up or reusing DOM elements that are no longer needed after rendering.
	 * Enables efficient DOM management by allowing removal or recycling of unused items when the rendered range changes.
	 */
	remove?: (lastOrder: number) => void;

	/**
	 * Signals the renderer to recalculate item dimensions.
	 */
	refresh?: Observable<void | { dataLength: number }>;
}

export interface VirtualScrollRenderOptions extends VirtualScrollBaseOptions {
	/**
	 * Scrollable element used to display the scroll bar.
	 */
	scrollElement: HTMLElement;
}

export interface VirtualScrollOptions extends VirtualScrollBaseOptions {
	/**
	 * Element where scrolling styles are applied.
	 */
	host: HTMLElement;

	/**
	 * Scrollable element used to display the scroll bar. Defaults to the parent element of `host`
	 */
	scrollElement?: HTMLElement;

	/**
	 * Optional container where the scroll placeholder element will be inserted.
	 * Allows flexibility in where virtual scroll sizing elements are attached,
	 * which is useful for advanced scrolling setups or custom DOM layouts.
	 */
	scrollContainer?: Node;

	/**
	 * Enables optional transformation-based positioning of the scrolling content container.
	 */
	translate?: boolean;
}

export interface VirtualScrollEvent {
	/**
	 * Start index of items rendered.
	 */
	start: number;
	/**
	 * End index of items rendered (non-inclusive, i.e., items rendered for indices: start <= i < end).
	 */
	end: number;

	/**
	 * Calculated size in pixels of all items.
	 */
	totalSize: number;

	/**
	 * Number of items rendered
	 */
	count: number;

	/**
	 * Offset used to position the item container once it reaches the end of the scrolling window
	 */
	offset: number;

	/*
	 * Difference in scroll position since the last scroll event.
	 */
	//scrollDelta: number;
}

/**
 * Provides basic vertical and horizontal virtual scroll functionality.
 * @beta
 */
export function virtualScrollRender(
	options: VirtualScrollRenderOptions,
): Observable<VirtualScrollEvent> {
	/*
	 * Handles window or element resize events to recalculate the visible area and adjust total virtual scroll size accordingly.
	 * Ensures that virtual scroll metrics remain accurate when layout changes occur.
	 *
	 * The goal of `scrollCoef` is to relate *physical scroll offset* on the scrollbar to the *virtual data index*,
	 * i.e., how many data rows should be skipped/offset for the current scroll position,
	 * in order to call the renderer for the right slice of items.
	 *
	 * - `dataLength` = number of data items
	 * - `totalSize` = "virtual" pixel height of the whole list (computed using the average size of
	 *   rendered items and the total data length, up to a big maximum)
	 * - `clientSize` = physical height of the visible scrolling element
	 */
	function resize() {
		clientSize = scrollElement[heightProp];
		// recalculate totalSize using current avgItemSize
		totalSize = Math.min(
			Math.round(dataLength * avgItemSize),
			MAX_TOTAL_SIZE,
		);
		scrollCoef =
			(dataLength - Math.floor(clientSize / avgItemSize)) /
			(totalSize - clientSize || 1);

		if (!isFinite(scrollCoef) || scrollCoef <= 0) scrollCoef = 0.01;
		needsResize = false;
	}

	/*
	 * Determines whether a new render is required based on changes in scroll position or layout.
	 * Prevents unnecessary re-renders by only allowing rendering when the scrolled data slice changes
	 * or the dimensions are updated.
	 */
	/*function filter() {
		const scrollTop = scrollElement[scrollProp];
		const newScrollStart = (scrollCoef * scrollTop) | 0;
		return newScrollStart === scrollStart
			? hasResized
			: ((scrollStart = newScrollStart), true);
	}*/

	function invalid(el: unknown) {
		console.error(
			`Faulty element detected: 
The provided element has an invalid or unmeasurable size. Check that the "${heightProp}" of the element is not zero or negative. Make sure the element is styled properly and any necessary dimensions are set correctly before rendering.`,
		);
		console.log(el);
		throw new Error(`Rendered element size returned invalid value.`);
	}

	function scroll() {
		if (needsResize) resize();

		const scrollTop = scrollElement[scrollProp];
		const rawIndex = scrollCoef * scrollTop;
		scrollStart = rawIndex | 0;
		const start = Math.max(
			Math.min(scrollStart, dataLength - rendered + 1),
			0,
		);
		const maxHeight =
			scrollStart + rendered > dataLength ? Infinity : clientSize;
		const frac = rawIndex - scrollStart; // fractional part

		let index = start;
		let count = 0;
		let size = 0;
		let offset = 0;
		let startPos = 0;
		let endPos = 0;
		//let firstOff = 0;
		rendered = 0;
		//hasResized = false;

		// Render one offscreen item from the start
		if (start > 0) {
			const el = render(index - 1, count++, 'pre');
			const elSize = el[heightProp];
			//firstOff = -scrollTop % avgItemSize;
			//offset = -(elSize - firstOff);
			offset = -(elSize + frac * avgItemSize);
		} else offset = -frac * avgItemSize;

		while (index >= 0 && size < maxHeight && index < dataLength) {
			const el = render(index++, count++, 'on');
			const elSize = el[heightProp];
			if (elSize <= 0) invalid(el);
			if (rendered === 0) startPos = el[topProp];
			endPos = el[topProp] + elSize;
			size = endPos + offset;
			rendered++;
		}

		// Render one more item. This extra element isn't included in calculations.
		if (index < dataLength && maxHeight) render(index, count++, 'post');

		remove?.(count);

		if (rendered > 0) avgItemSize = (endPos - startPos) / rendered;

		// If we reach the end, we must adjust the offset so the last item is always at the bottom
		if (rendered > 1 && scrollStart + rendered >= dataLength) {
			offset = clientSize - endPos;
			if (offset > 0) offset = 0;
		}

		if (firstRun) {
			resize();
			firstRun = false;
		}

		return {
			start,
			end: index,
			totalSize,
			count: rendered,
			offset,
		};
	}

	const { axis, scrollElement, render, refresh, remove } = options;
	const heightProp = axis === 'x' ? 'offsetWidth' : 'offsetHeight';
	const topProp = axis === 'x' ? 'offsetLeft' : 'offsetTop';
	const scrollProp = axis === 'x' ? 'scrollLeft' : 'scrollTop';
	const MAX_TOTAL_SIZE = 5e6;

	let dataLength = options.dataLength;
	let rendered = 0;
	let clientSize = 0;
	let totalSize = 0;
	let scrollCoef = 0;
	let avgItemSize = 50;
	// The current starting index of items to be rendered based on the user's scroll position.
	let scrollStart = 0;
	let firstRun = true;
	let needsResize = true;
	const scroll$ = on(scrollElement, 'scroll', {
		passive: true,
	});

	return merge(
		refresh?.tap(v => {
			if (v?.dataLength !== undefined) dataLength = v.dataLength;
			needsResize = true;
		}) ?? EMPTY,
		onVisibility(scrollElement).switchMap(v =>
			v
				? merge(
						onResize(scrollElement).raf(() => (needsResize = true)),
						scroll$,
				  )
				: EMPTY,
		),
	)
		.raf()
		.map(scroll);
}

/**
 * Virtual scrolling is a technique used to optimize the rendering of large amounts of data.
 * It allows users to scroll through a list of items without having to load the entire list into memory
 * or render it on the page at once. Instead, only the visible portion of the list is rendered,
 * and as the user scrolls, additional items are loaded and rendered as needed.
 *
 * @beta
 */
export function virtualScroll(options: VirtualScrollOptions) {
	const { axis, host, translate = true } = options;
	const scrollElement = options.scrollElement || host.parentElement;
	if (!scrollElement) throw 'scrollElement option could not be resolved.';

	const scroller = document.createElement('div');
	const cssProp = axis === 'x' ? 'width' : 'height';
	scroller.style.position = 'absolute';
	scroller.style.width = scroller.style.height = '1px';
	scroller.style.top = scroller.style.left = '0';
	(options.scrollContainer ?? scrollElement).appendChild(scroller);
	host.style.position = 'sticky';

	host.style.top = host.style.left = '0';

	if (translate) host.style.translate = '0 0';

	let lastSize = 0;
	let offsetSet = false;

	return virtualScrollRender({ ...options, scrollElement })
		.tap(({ totalSize, offset }) => {
			if (translate) {
				if (offset !== 0) {
					const off = offset | 0;
					host.style.translate =
						axis === 'x' ? `${off}px 0` : `0 ${off}px`;
					offsetSet = true;
				} else if (offsetSet) {
					host.style.translate = '0 0';
					offsetSet = false;
				}
			}
			if (lastSize !== totalSize) {
				scroller.style[cssProp] = `${totalSize}px`;
				lastSize = totalSize;
			}
		})
		.finalize(() => scroller.remove());
}
