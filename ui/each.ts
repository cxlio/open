import { Component, get, placeholder } from './component.js';
import { getTargetById } from './util.js';
import { BehaviorSubject, Observable, defer, EMPTY, be, of } from './rx.js';
import { onLoad } from './dom.js';

export class Marker {
	start = new Comment('marker-start');
	end = new Comment('marker-end');
	frag = document.createDocumentFragment();

	insert(content: Node | Node[], nextNode: Node = this.end) {
		const parent = this.end.parentNode;
		if (parent) {
			if (!this.start.parentNode)
				parent.insertBefore(this.start, this.end);

			if (Array.isArray(content)) {
				this.frag.append(...content);
				parent.insertBefore(this.frag, nextNode);
			} else parent.insertBefore(content, nextNode);
		}
	}

	empty() {
		let cur = this.start.nextSibling;
		while (cur && cur !== this.end) {
			const nxt = cur.nextSibling;
			cur.remove();
			cur = nxt;
		}
	}
}

export type TemplateFn<SourceT extends Iterable<unknown>> = (
	item: BehaviorSubject<IterableItem<SourceT>>,
	index: number,
	source: SourceT,
) => Node;
export type Template =
	| string
	| HTMLTemplateElement
	| TemplateFn<Iterable<unknown>>;

type EachRow<T> = {
	elements: ChildNode[];
	item: BehaviorSubject<T>;
};
type IterableItem<T> = T extends Iterable<infer U> ? U : never;

export function each<SourceT extends Iterable<unknown>>({
	source,
	render,
	empty,
	append,
	loading,
}: {
	source: Observable<SourceT | undefined>;
	render: TemplateFn<SourceT>;
	empty?: () => Element;
	loading?: () => Element;
	append: (node: Node) => void;
}) {
	const rendered: EachRow<IterableItem<SourceT>>[] = [];
	const fragment = document.createDocumentFragment();
	let emptyEl: Element | undefined;
	let loadingEl: Element | undefined;

	function createRecords(source?: SourceT) {
		loadingEl?.parentNode?.removeChild(loadingEl);

		if (!source) return;

		let i = 0;

		for (const value of source) {
			const item = rendered[i]?.item;
			if (!item) {
				const item = be(value as IterableItem<SourceT>);
				const frag = render(item, i, source);
				const elements =
					frag instanceof DocumentFragment
						? Array.from(frag.childNodes)
						: ([frag] as ChildNode[]);
				rendered.push({ elements, item });
				fragment.append(frag);
			} else if (item.value !== value)
				item.next(value as IterableItem<SourceT>);
			i++;
		}
		if (fragment.childNodes.length) append(fragment);

		emptyEl?.remove();
		if (i === 0 && empty) append((emptyEl = empty()));

		let slotCount = rendered.length;

		while (slotCount-- > i)
			rendered.pop()?.elements.forEach(e => e.remove());
	}

	return defer(() => {
		loadingEl = loading?.();
		if (loadingEl) append(loadingEl);

		return source.raf(createRecords);
	});
}

export function renderEach<SourceT extends Iterable<unknown>>(options: {
	source: Observable<SourceT | undefined>;
	render: TemplateFn<SourceT>;
	loading?: () => Element;
	empty?: () => Element;
}) {
	return placeholder(() => {
		const marker = new Marker();
		return [
			each({ ...options, append: marker.insert.bind(marker) }),
			marker.end,
		];
	});
}

function validate(tpl: Element | null) {
	if (tpl instanceof HTMLTemplateElement) return tpl;
	throw 'Element must be a <template>';
}

function findTemplate(host: Element, tpl: string) {
	const root = host.getRootNode();
	if (root instanceof Document) return validate(root.getElementById(tpl));
	throw new Error('Invalid root node');
}

function getTemplateTarget(host: Element, tpl: Template | string | Node) {
	if (!tpl) return;

	if (typeof tpl === 'function') return tpl;
	else if (typeof tpl === 'string') tpl = findTemplate(host, tpl);

	if (tpl instanceof HTMLTemplateElement)
		return () => tpl.content.cloneNode(true);

	throw new Error('Invalid template');
}

function getTemplate(
	$: Component & { template: Template | string | undefined },
) {
	return get($, 'template').switchMap(id => {
		return id
			? of(getTemplateTarget($, id))
			: onLoad().map(() => getTemplateTarget($, $.children[0]));
	});
}

export function eachBehavior(
	$: Component & {
		template: Template | undefined;
		target?: string | HTMLElement;
	},
	source: Observable<unknown[] | undefined>,
	wrap?: (node: Node) => Node,
) {
	return getTemplate($).switchMap(tpl => {
		const host = $.target ? getTargetById($, $.target) ?? $ : $;
		return tpl
			? each({
					source,
					render: wrap
						? (item, i, src) => wrap(tpl(item, i, src))
						: tpl,
					append: host.append.bind(host),
			  })
			: EMPTY;
	});
}
