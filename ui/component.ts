import {
	EMPTY,
	Observable,
	OrderedSubject,
	Subject,
	Subscription,
	concat,
	defer,
	filter,
	map,
	of,
	merge,
	tap,
} from './rx.js';
import { CustomEventMap, raf, onAttributeMutation } from './dom.js';

declare module './rx.js' {
	interface Observable<T> {
		log(): Observable<T>;
		raf(fn?: (val: T) => void): Observable<T>;
	}
}

const LOG = tap(val => console.log(val));

Observable.prototype.log = function () {
	return this.pipe(LOG);
};

Observable.prototype.raf = function (fn?: (val: unknown) => void) {
	return this.pipe(raf(fn));
};

/* eslint @typescript-eslint/no-namespace: 'off' */
declare global {
	namespace tsx.JSX {
		type ElementClass = HTMLElement;
		interface ElementAttributesProperty {
			jsxAttributes: unknown;
		}
		interface ElementChildrenAttribute {
			children: unknown;
		}
		type Element = Node;
		type IntrinsicElements = {
			[P in keyof HTMLElementTagNameMap]: NativeType<
				HTMLElementTagNameMap[P]
			>;
		};
		interface IntrinsicClassAttributes<T> {
			$?: Binding<T, unknown> | Observable<unknown>;
		}
	}
}

type RenderFunction<T> = (node: T) => void;
export type Augmentation<T extends Component> = (
	host: T,
) => Node | Comment | Observable<unknown> | void;

/*eslint @typescript-eslint/no-unsafe-function-type: off */
type Disallowed = Observable<unknown> | Function;
type InitFn<T extends Component> = (ctor: ComponentConstructor<T>) => void;
export type CreateAttribute<T> = AttributeType<T> & {
	$?: Binding<T, unknown> | Observable<unknown>;
};
type NativeChild =
	| string
	| number
	| Node
	| (string | number | Node)[]
	| undefined;
type NativeChildren = NativeChild | NativeChild[];
type NativeType<T> = {
	[K in keyof Omit<T, 'children'>]?: T[K];
} & {
	children?: NativeChildren;
};

export type VoidMessage = {
	[K in keyof CustomEventMap]: CustomEventMap[K] extends void ? K : never;
}[keyof CustomEventMap];

export type ComponentConstructor<T extends Component = Component> = {
	observedAttributes?: string[];
	[augments]?: RenderFunction<T>[];
	[parserSymbol]?: Record<string, AttributeParser>;
	prototype: T;
	//new (): T;
} & ((abstract new () => T) | (new () => T));
export type Binding<T, DataT> = (el: T) => Observable<DataT>;
export type Child =
	| NativeChild
	| ((host: Component) => Node)
	| Observable<unknown>;
export type Children = Child | Child[];
export type AttributeType<T> = {
	[K in keyof Omit<T, 'children' | '$'>]?: T[K] extends Disallowed
		? never
		: T[K] | Observable<T[K]>;
} & {
	children?: Children;
};
export type AttributeParser = (
	value: string | null,
	oldValue: unknown,
) => unknown;

/**
 * The `ComponentAttributeName` type utility extracts string keys from the component type `T`.
 * It ensures compatibility between component properties and their corresponding HTML attributes.
 */
export type AttributeName<T> = Extract<keyof T, string>;

/**
 * `AttributeEvent` represents a component attribute change, including the target component and the attribute that changed.
 * This is primarily used in the context of observables to track attribute updates.
 */
export interface AttributeEvent<T> {
	target: T;
	attribute: AttributeName<T>;
}

export interface MessageHandler {
	type: string;
	next: (x: unknown) => void;
	stopPropagation: boolean;
}

/**
 * `AttributeOptions` is an interface for configuring attributes.
 */
export interface AttributeOptions<T extends Component, K extends keyof T> {
	/// Custom logic for syncing attribute values back to the DOM.
	persist?: (el: Element, attr: K, val: T[K]) => void;

	/// Whether the element's attribute should be observed for changes.
	observe?: boolean;
	/// Render function to be called on component initialization
	render?: (host: T) => Observable<unknown> | void;
	/// Function to transform the attribute value before assignment.
	parse?(val: string | null, oldval: unknown): T[K];
}

/**
 * Symbol used to uniquely identify and store reactive bindings for a component instance,
 * enabling management of subscription lifecycles and state tracking internally.
 */
export const bindings = Symbol('bindings');

const registeredComponents: Record<string, new () => Component> = {};
const augments = Symbol('augments');
const parserSymbol = Symbol('parser');

/**
 * A utility class designed to manage reactive bindings and lifecycle
 * state for components. It helps coordinate subscriptions to observables and ensures
 * proper cleanup of resources when a component is disconnected from the DOM.
 */
export class Bindings {
	bindings?: Observable<unknown>[];
	messageHandlers?: Set<MessageHandler>;
	internals?: ElementInternals;
	attributes$ = new OrderedSubject<unknown>();
	wasConnected = false;
	wasInitialized = false;

	private subscriptions?: Subscription[];
	private prebind?: Observable<unknown>[];

	addMessageHandler(handler: MessageHandler) {
		(this.messageHandlers ??= new Set()).add(handler);
	}

	removeMessageHandler(handler: MessageHandler) {
		this.messageHandlers?.delete(handler);
	}

	message(event: string, val: unknown) {
		let stop = false;
		if (this.messageHandlers)
			for (const m of this.messageHandlers) {
				if (m.type === event) {
					m.next(val);
					stop ||= m.stopPropagation;
				}
			}
		return stop;
	}

	add(binding: Observable<unknown>) {
		if (this.wasConnected)
			throw new Error('Cannot bind connected component.');

		if (this.wasInitialized) (this.bindings ??= []).push(binding);
		else (this.prebind ??= []).push(binding);
	}

	connect() {
		this.wasConnected = true;
		if (!this.subscriptions && (this.prebind || this.bindings)) {
			const subs: Subscription[] = (this.subscriptions = []);
			if (this.bindings)
				for (const b of this.bindings) subs.push(b.subscribe());
			if (this.prebind)
				for (const b of this.prebind) subs.push(b.subscribe());
		}
	}
	disconnect() {
		this.subscriptions?.forEach(s => s.unsubscribe());
		this.subscriptions = undefined;
	}
}

export interface ComponentT extends HTMLElement {
	[bindings]: Bindings;
}
/* eslint @typescript-eslint/no-unsafe-declaration-merging:off */
export interface Component {
	jsxAttributes: AttributeType<this>;
}

export const cssSymbol = Symbol('css');

/**
 * The `Component` class serves as a base for web components with built-in reactive
 * attribute handling, lifecycle hooks, and support for augmentations.
 */
export abstract class Component extends HTMLElement {
	static observedAttributes?: string[];
	static [augments]?: RenderFunction<Component>[];
	static [parserSymbol]?: Record<string, AttributeParser>;

	[bindings] = new Bindings();

	/**
	 * Symbol used to indicate whether the CSS for this node has been applied,
	 * preventing duplicate style insertions.
	 */
	[cssSymbol]?: boolean;

	protected connectedCallback() {
		this[bindings].wasInitialized = true;
		if (!this[bindings].wasConnected)
			(this.constructor as typeof Component)[augments]?.forEach(f =>
				f(this),
			);
		this[bindings].connect();
	}

	protected disconnectedCallback() {
		this[bindings].disconnect();
	}

	protected attributeChangedCallback(
		name: string,
		oldValue: string | null,
		value: string | null,
	) {
		const parser =
			(this.constructor as typeof Component)[parserSymbol]?.[
				name as string
			] ?? defaultAttributeParser;
		if (oldValue !== value)
			this[name as keyof this] = parser(
				value as string,
				this[name as keyof this],
			) as this[keyof this];
	}
}

function defaultAttributeParser(value: string | null, oldValue: unknown) {
	const isBoolean = oldValue === false || oldValue === true;
	if (value === '') {
		return isBoolean ? true : '';
	} else return value === null ? (isBoolean ? false : undefined) : value;
}

function pushRender<T extends Component>(
	ctor: ComponentConstructor<T>,
	renderFn: RenderFunction<T>,
) {
	if (!ctor.hasOwnProperty(augments))
		ctor[augments] = ctor[augments]?.slice(0) ?? [];
	ctor[augments]?.push(renderFn);
}

const shadowConfig: ShadowRootInit = { mode: 'open' };
export function getShadow(el: Element) {
	return el.shadowRoot ?? el.attachShadow(shadowConfig);
}

function appendShadow<T extends Component>(
	host: T,
	child: Node | Observable<unknown>,
) {
	if (child instanceof Node) getShadow(host).appendChild(child);
	else host[bindings].add(child);
}

function doAugment<T extends Component>(
	constructor: ComponentConstructor<T>,
	augments: Augmentation<T>[],
) {
	if (augments.length)
		pushRender<T>(constructor, node => {
			for (const d of augments) {
				const result = d.call(constructor, node);
				if (result && result !== node) appendShadow(node, result);
			}
		});
}

function registerComponent<T extends Component>(
	tagName: string,
	ctor: new () => T,
) {
	registeredComponents[tagName] = ctor;
	customElements.define(tagName, ctor);
}

export function internals(host: Component) {
	return (host[bindings].internals ??= host.attachInternals());
}

export function component<T extends Component>(
	ctor: abstract new () => T,
	options: {
		init?: InitFn<T>[];
		augment?: Augmentation<T>[];
	},
): void;
export function component<T extends Component>(
	ctor: ComponentConstructor<T>,
	options: {
		init?: InitFn<T>[];
		augment?: Augmentation<T>[];
		tagName?: string;
	},
): void;
export function component<T extends Component>(
	ctor: ComponentConstructor<T>,
	{
		init,
		augment,
		tagName,
	}: {
		init?: InitFn<T>[];
		augment?: Augmentation<T>[];
		tagName?: string;
	},
) {
	if (init) for (const fn of init) fn(ctor);
	if (augment) doAugment(ctor, augment);
	// Next line needs to be last to prevent early component upgrade
	if (tagName) registerComponent(tagName, ctor as new () => T);
}

/**
 * This function augments a Component class with additional functionality or rendering logic.
 */
export function augment<T extends Component>(
	ctor: ComponentConstructor<T>,
	...augs: Augmentation<T>[]
) {
	doAugment(ctor, augs);
}

/**
 * Returns an observable that emits the component instance whenever its attributes change
 * or when it is first observed, useful for reacting to dynamic runtime updates.
 */
export function onUpdate<T extends Component>(host: T) {
	return concat(
		of(host),
		host[bindings].attributes$.map(() => host),
	);
}

/**
 * `attributeChanged` creates an observable for tracking changes to a specific component attribute.
 * It filters events from the component's `attributes$` stream to only emit updates for the targeted attribute.
 * This is useful for observing real-time changes to a specific property and reacting accordingly.
 */
export function attributeChanged<
	T extends Component,
	K extends AttributeName<T>,
>(element: T, attribute: K): Observable<T[K]> {
	return (element[bindings].attributes$ as Subject<AttributeEvent<T>>).pipe(
		filter(ev => ev.attribute === attribute),
		map(() => element[attribute]),
	);
}

/**
 * The `get` function creates an observable that:
 * - Emits the current value of a given attribute immediately when subscribed.
 * - Tracks changes to the attribute over time and emits updates.
 */
export function get<T extends Component, K extends AttributeName<T>>(
	element: T,
	attribute: K,
): Observable<T[K]> {
	return merge(
		attributeChanged(element, attribute),
		defer(() => of(element[attribute])),
	);
}

/**
 * `getObservedAttributes` ensures the `observedAttributes` array of a component is properly initialized and isolated for safe modification.
 * This is important because `observedAttributes` is used by the Web Components API to track changes to specific attributes,
 * and modifying a shared array could lead to unintended side effects in subclassed components.
 */
function getObservedAttributes<T extends Component>(
	target: ComponentConstructor<T>,
) {
	let result = target.observedAttributes;

	if (result && !target.hasOwnProperty('observedAttributes'))
		result = target.observedAttributes?.slice(0);

	return (target.observedAttributes = result || []);
}

/**
 * `setAttribute` is a utility function for safely managing DOM attribute updates.
 * - Handles various data types (e.g., booleans and null/undefined) to either update or remove the attribute.
 * - Ensures attribute values are appropriately converted to strings for DOM compatibility.
 * - Returns the updated value for potential chaining or further processing.
 */
export function setAttribute(el: Element, attr: string, val: unknown) {
	if (val === false || val === null || val === undefined) val = null;
	else if (val === true) val = '';

	if (val === null) el.removeAttribute(attr);
	else el.setAttribute(attr, String(val));

	return val;
}

function pushParser<T extends Component>(
	ctor: ComponentConstructor<T>,
	name: string,
	parser: AttributeParser,
) {
	if (!ctor.hasOwnProperty(parserSymbol))
		ctor[parserSymbol] = { ...ctor[parserSymbol] };
	if (ctor[parserSymbol]) ctor[parserSymbol][name] = parser;
}

/**
 * The `Attribute` function handles attribute observation and persistence based on provided options
 *
 * - It integrates optional rendering logic via the `render` option.
 * - Allows for parsing the attribute value before it is assigned to the property.
 * - Facilitates updating the DOM attribute when the property value changes.
 */
export function attribute<
	T extends Component,
	K extends Extract<keyof T, string>,
>(name: K, options?: AttributeOptions<T, K>) {
	return (ctor: ComponentConstructor<T>) => {
		if (options?.observe !== false) getObservedAttributes(ctor).push(name);
		if (options?.parse) pushParser(ctor, name, options.parse);

		const prop = `$$${name}` as K;
		const proto = ctor.prototype;
		const descriptor = Object.getOwnPropertyDescriptor(proto, name);

		if (descriptor) Object.defineProperty(proto, prop, descriptor);

		const persist = options?.persist;
		const newDescriptor = {
			enumerable: true,
			configurable: false,
			get(this: T) {
				return this[prop];
			},
			set(this: T, value: T[K]) {
				const current = this[prop];
				if (current !== value) {
					this[prop] = value;
					persist?.(this, name, value);
					this[bindings].attributes$.next({
						target: this,
						attribute: name,
						value: value,
					});
				} else if (descriptor?.set) {
					persist?.(this, name, value);
					this[prop] = value;
				}
			},
		};

		pushRender(ctor, (target: T) => {
			if (!descriptor) target[prop] = target[name];

			Object.defineProperty(target, name, newDescriptor);

			persist?.(target, name, target[name]);

			if (options?.render) {
				const result = options.render(target);
				if (result) appendShadow(target, result);
			}
		});
	};
}

/**
 * This function is a specialized attribute for applying styles to a component.
 * It ensures the style attributes are persisted in the DOM and observed for changes.
 */
export function styleAttribute<
	T extends Component,
	K extends Extract<keyof T, string>,
>(name: K) {
	return attribute<T, K>(name, {
		persist: setAttribute,
		observe: true,
	});
}

/**
 * The `EventAttribute` function creates an attribute specifically for handling and binding DOM events.
 *
 * - It assumes the `attribute` name starts with `on` (e.g., `onclick`) and attaches the handler to the element.
 * - The event handler can be defined as inline JavaScript in the attribute value or as a function on the component.
 */
export function event<T extends Component, K extends EventProperty<T>>(
	name: K,
) {
	const prop = `on${name}` as Extract<keyof T, string>;

	return attribute<T, Extract<keyof T, string>>(prop, {
		render(el) {
			return get(el, prop).switchMap(val => {
				if (!val) return EMPTY;
				return new Observable<Event>(subs => {
					const handler = (ev: Event) => {
						if (ev.target === el)
							(
								(el as T)[prop] as unknown as (a: Event) => void
							)?.call(el, ev);
					};
					el.addEventListener(name, handler);
					subs.signal.subscribe(() =>
						el.removeEventListener(name, handler),
					);
				});
			});
		},
		parse(val) {
			return (
				val ? new Function('event', val as string) : undefined
			) as T[Extract<keyof T, string>];
		},
	});
}

/**
 * This function prevents attribute observation for the property,
 * distinguishing it from attributes that need DOM synchronization.
 * Useful for properties that exist only within the component's internal state or logic.
 */
export function property<
	T extends Component,
	K extends Extract<keyof T, string>,
>(name: K) {
	return attribute<T, K>(name, { observe: false });
}

/**
 * `getRegisteredComponents` is a utility function that provides a shallow copy of all registered components.
 * This can be useful for inspecting or interacting with the current registry of custom elements.
 */
export function getRegisteredComponents() {
	return { ...registeredComponents };
}

/** The `Slot` function creates and returns a new `<slot>` element. */
export function Slot() {
	return document.createElement('slot');
}

export function placeholder(source: () => [Observable<unknown>, Node]) {
	return (host: Component) => {
		const [bind, node] = source();
		host[bindings].add(bind);
		return node;
	};
}

/**
 * Empty Component
 * @beta
 */
export class Span extends Component {}
component(Span, { tagName: 'c-span' });

export function expression(host: Component, binding: Observable<unknown>) {
	const result = document.createTextNode('');
	host[bindings].add(
		binding.tap(val => (result.textContent = val as string)),
	);
	return result;
}

const childrenFragment = document.createDocumentFragment();
export function renderChildren(
	host: HTMLElement | DocumentFragment,
	children: Children,
	appendTo: Node = host,
) {
	if (children === undefined || children === null) return;

	if (Array.isArray(children)) {
		for (const child of children)
			renderChildren(host, child, childrenFragment);
		if (appendTo !== childrenFragment)
			appendTo.appendChild(childrenFragment);
	} else if (host instanceof Component && children instanceof Observable)
		appendTo.appendChild(expression(host, children));
	else if (children instanceof Node) appendTo.appendChild(children);
	else if (host instanceof Component && typeof children === 'function')
		renderChildren(host, children(host), appendTo);
	else appendTo.appendChild(document.createTextNode(children as string));
}

function renderAttributes<T extends HTMLElement>(
	host: T,
	attributes: AttributeType<T>,
) {
	for (const attr in attributes) {
		const value = attributes[attr as keyof AttributeType<T>];
		if (host instanceof Component) {
			if (value instanceof Observable)
				host[bindings].add(
					attr === '$'
						? value
						: value.tap(v => (host[attr as keyof T] = v)),
				);
			else if (attr === '$' && typeof value === 'function')
				host[bindings].add(value(host));
			else
				host[attr as keyof T] = value as T['children'] &
					HTMLCollection &
					(T & Component)[Exclude<keyof T, 'children' | '$'>];
		} else
			host[attr as keyof T] = value as T['children'] &
				T[Exclude<keyof T, 'children' | '$'>];
	}
}

function isObservedAttribute<T extends HTMLElement>(el: T, attr: keyof T) {
	return (el.constructor as typeof Component).observedAttributes?.includes(
		attr as string,
	);
}

export function getAttribute<T extends Element, K extends AttributeName<T>>(
	el: T,
	name: K,
) {
	const observer =
		el instanceof Component && isObservedAttribute(el, name)
			? attributeChanged(el, name)
			: onAttributeMutation(el, [name]).map(() => el[name]);

	return merge<Observable<T[K]>[]>(
		observer,
		defer(() => of(el[name])),
	);
}

export function numberAttribute<
	T extends Component,
	K extends Extract<keyof T, string>,
>(name: K, min?: number, max?: number) {
	return attribute<T, K>(name, {
		parse(n) {
			if (n === 'Infinity' || n === 'infinity') return Infinity as T[K];

			let r = n === undefined ? undefined : Number(n);
			if (min !== undefined && (r === undefined || r < min || isNaN(r)))
				r = min;
			if (max !== undefined && r !== undefined && r > max) r = max;
			return r as T[K];
		},
	});
}

export function message<K extends VoidMessage>(el: Element, event: K): void;
export function message<K extends keyof CustomEventMap>(
	el: Element,
	event: K,
	detail: CustomEventMap[K],
): void;
export function message<K extends keyof CustomEventMap>(
	el: Element,
	event: K,
	detail?: CustomEventMap[K],
) {
	for (let p = el.parentElement; p; p = p.parentElement)
		if ((p as Component)[bindings]?.message(event, detail)) return;

	//el.dispatchEvent(new CustomEvent(event, { detail, bubbles: true }));
}

export function onMessage<K extends keyof CustomEventMap>(
	el: Component,
	event: K,
	stopPropagation = true,
): Observable<CustomEventMap[K]> {
	return new Observable<CustomEventMap[K]>(subscriber => {
		const handler = {
			type: event,
			next: subscriber.next as (x: unknown) => void,
			stopPropagation,
		};
		el[bindings].addMessageHandler(handler);
		subscriber.signal.subscribe(() =>
			el[bindings].removeMessageHandler(handler),
		);
	});
}

/**
 * Creates an instance of a custom component based on the provided constructor.
 * Useful for dynamically generating components at runtime.
 */
export function create<K extends keyof HTMLElementTagNameMap>(
	tagName: K,
	attributes?: NativeType<HTMLElementTagNameMap[K]>,
	...children: NativeChild[]
): HTMLElementTagNameMap[K];
export function create<T extends Component>(
	component: new () => T,
	attributes?: CreateAttribute<T>,
	...children: Child[]
): T;
export function create<T extends Component>(
	component: (new () => T) | string,
	attributes?: unknown,
	...children: Child[]
): Node {
	const element =
		typeof component === 'string'
			? document.createElement(component)
			: new component();
	if (attributes) renderAttributes(element, attributes);
	if (children) renderChildren(element, children);
	return element;
}

export function tsx<K extends keyof HTMLElementTagNameMap>(
	tagName: K,
	attributes?: NativeType<HTMLElementTagNameMap[K]>,
	...children: Child[]
): HTMLElementTagNameMap[K];
export function tsx<T extends Component>(
	component: new () => T,
	attributes?: CreateAttribute<T>,
	...children: Child[]
): T;
export function tsx<T>(
	elementType: (attributes?: T) => Node,
	attributes?: T,
	...children: Child[]
): Node;
export function tsx<T extends Component>(
	component: (new () => T) | string | typeof tsx,
	attributes?: unknown,
	...children: Child[]
): Node {
	if (
		component !== tsx &&
		typeof component === 'function' &&
		!(component.prototype instanceof Component)
	) {
		if (children.length)
			((attributes ??= {}) as { children: unknown }).children = children;
		return (component as (...args: unknown[]) => Node)(attributes);
	}

	const element =
		component === tsx
			? document.createDocumentFragment()
			: typeof component === 'string'
			? document.createElement(component)
			: new (component as new () => T)();
	if (attributes) renderAttributes(element as HTMLElement, attributes);
	if (children) renderChildren(element, children);
	return element;
}

export type ReactElement<T> = ReactAttributeType<T> &
	Partial<
		{
			class: string;
			ref: unknown;
		} & ReactEvents<T>
	>;

type AttributeProperties<T> = {
	[K in keyof T]: T[K] extends Disallowed ? never : K;
}[keyof T];

type ReactAttributeType<T> = {
	[K in AttributeProperties<
		Omit<T, 'children' | keyof HTMLElementEventMap>
	>]?: T[K];
} & {
	children?: unknown;
};

export interface Components {}

/* eslint @typescript-eslint/no-empty-object-type: off */
declare global {
	namespace React.JSX {
		interface IntrinsicElements extends CxlReactComponents {}
	}
}

type CxlReactComponents = {
	[K in keyof Components]: ReactElement<Components[K]>;
};

type HTMLEvents = {
	[K in keyof HTMLElementEventMap as `on${Capitalize<K>}`]: (
		e: HTMLElementEventMap[K],
	) => void;
};

type CustomEventProperty<T> = Extract<keyof T, `on${string}`>;

type ReactEvents<T> = {
	[K in EventProperty<T> as `on${K}`]: `on${K}` extends keyof T
		? T[K]
		: never;
} & HTMLEvents;

export type EventProperty<T> = Exclude<
	{
		[K in CustomEventProperty<T>]: T[K] extends
			| ((e: infer E) => void)
			| undefined
			| null
			? E extends Event
				? K extends `on${infer Name}`
					? Name
					: never
				: never
			: never;
	}[CustomEventProperty<T>],
	keyof HTMLElementEventMap
>;
