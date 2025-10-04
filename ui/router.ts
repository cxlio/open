import {
	EMPTY,
	Observable,
	Reference,
	BehaviorSubject,
	combineLatest,
	observable,
	of,
	merge,
	concat,
} from './rx.js';
import { Component, component, attribute, get, onUpdate } from './component.js';
import { onAction, on, onChildrenMutation, onLoad } from './dom.js';

declare module './component' {
	interface Components {
		'c-router': RouterComponent;
	}
}

const PARAM_QUERY_REGEX = /([^&=]+)=?([^&]*)/g,
	PARAM_REGEX = /:([\w_$@]+)/g,
	optionalParam = /\/\((.*?)\)/g,
	namedParam = /(\(\?)?:\w+/g,
	splatParam = /\*\w+/g,
	escapeRegExp = /[-{}[\]+?.,\\^$|#\s]/g;

const URL_REGEX = /([^#]*)(?:#(.+))?/;

const routeSymbol = '@@cxlRoute';

type RouteArguments = { [key: string]: string };

export interface RouteElement extends Node {
	[routeSymbol]?: RouteBase<RouteElement>;
	routeTitle?: string | Observable<string>;
}

interface RouteInstances {
	[key: string]: RouteElement;
}

export interface RouterState {
	url: Url;
	root: RouteElement;
	current: RouteElement;
	arguments?: RouteArguments;
	route: RouteBase<RouteElement>;
}

export interface RouteDefinition<T extends RouteElement> {
	id?: string;
	path?: string;
	isDefault?: boolean;

	/**
	 * Indicates the id of a parent route definition. Used to establish
	 * hierarchical relationships between routes, enabling nested or child routes.
	 */
	parent?: string;

	/**
	 * Specifies a route to redirect to when this route is matched.
	 * Useful for handling legacy URLs, aliases, or navigation flows where a path should automatically forward to another.
	 */
	redirectTo?: string;

	render: () => T;
}

export interface Url {
	path: string;
	hash: string;
}

export interface Strategy {
	getHref(url: Url | string): string;
	serialize(url: Url): void;
	deserialize(): Url;
}

export const sys = {
	location: window.location,
	history: window.history,
};

function routeToRegExp(route: string): [RegExp, string[]] {
	const names: string[] = [],
		result = new RegExp(
			'^/?' +
				route
					.replace(escapeRegExp, '\\$&')
					.replace(optionalParam, '\\/?(?:$1)?')
					.replace(namedParam, function (match, optional) {
						names.push(match.substr(1));
						return optional ? match : '([^/?]*)';
					})
					.replace(splatParam, '([^?]*?)') +
				'(?:/$|\\?|$)',
		);

	return [result, names];
}

export function normalize(path: string) {
	if (path[0] === '/') path = path.slice(1);
	if (path.endsWith('/')) path = path.slice(0, -1);
	return path;
}

export function replaceParameters(
	path: string,
	params?: Record<string, string>,
) {
	if (!params) return path;
	return path.replace(PARAM_REGEX, (_match, key) => params[key] || '');
}

export function parseQueryParameters(query: string) {
	const result: Record<string, string> = {};
	let m;
	while ((m = PARAM_QUERY_REGEX.exec(query)))
		result[m[1]] = decodeURIComponent(m[2]);
	return result;
}

class Fragment {
	path: string;
	regex: RegExp;
	parameters: string[];

	constructor(path: string) {
		this.path = path = normalize(path);
		[this.regex, this.parameters] = routeToRegExp(path);
	}

	_extractQuery(frag: string) {
		const pos = frag.indexOf('?');
		return pos === -1 ? {} : parseQueryParameters(frag.slice(pos + 1));
	}

	getArguments(fragment: string) {
		const match = this.regex.exec(fragment);
		const params = match && match.slice(1);

		if (!params) return;

		const result = this._extractQuery(fragment);

		params.forEach((param, i) => {
			// Don't decode the search params.
			const p =
				i === params.length - 1
					? param || ''
					: param
					? decodeURIComponent(param)
					: '';

			result[this.parameters[i]] = p;
		});

		return result;
	}

	test(url: string) {
		return this.regex.test(url);
	}

	toString() {
		return this.path;
	}
}

export class RouteBase<T extends RouteElement> {
	id: string;
	path?: Fragment;
	parent?: string;
	redirectTo?: string;
	definition: RouteDefinition<T>;
	isDefault: boolean;

	constructor(def: RouteDefinition<T>) {
		if (def.path !== undefined) this.path = new Fragment(def.path);
		else if (!def.id) {
			console.log(def);
			throw new Error(
				'An id or path is mandatory. You need at least one to define a valid route.',
			);
		}

		this.id = def.id || (def.path ?? `route${Math.random().toString()}`);
		this.isDefault = def.isDefault || false;
		this.parent = def.parent;
		this.redirectTo = def.redirectTo;
		this.definition = def;
	}

	create(args: Partial<T>) {
		const el = this.definition.render();
		el[routeSymbol] = this as RouteBase<RouteElement>;
		for (const a in args)
			if (args[a as keyof T] !== undefined)
				el[a as keyof T] = args[a as keyof T] as T[keyof T];

		return el;
	}
}

export class RouteManager {
	readonly routes: RouteBase<RouteElement>[] = [];
	defaultRoute?: RouteBase<RouteElement>;

	findRoute(path: string) {
		return this.routes.find(r => r.path?.test(path)) ?? this.defaultRoute;
	}

	get(id: string) {
		return this.routes.find(r => r.id === id);
	}

	register(route: RouteBase<RouteElement>) {
		if (route.isDefault) {
			if (this.defaultRoute)
				throw new Error('Default route already defined');
			this.defaultRoute = route;
		}
		this.routes.unshift(route);
	}
}

export function getElementRoute<T extends RouteElement>(
	el: T,
): RouteBase<T> | undefined {
	return el[routeSymbol] as RouteBase<T>;
}

export function parseUrl(url: string): Url {
	const match = URL_REGEX.exec(url);
	return { path: normalize(match?.[1] || ''), hash: match?.[2] || '' };
}

export const QueryStrategy: Strategy = {
	getHref(url: Url | string) {
		url = typeof url === 'string' ? parseUrl(url) : url;
		return `${sys.location.pathname}${url.path ? `?${url.path}` : ''}${
			url.hash ? `#${url.hash}` : ''
		}`;
	},

	serialize(url) {
		const oldUrl = sys.history.state?.url;
		if (!oldUrl || url.hash !== oldUrl.hash || url.path !== oldUrl.path) {
			const href = this.getHref(url);
			if (
				href !==
				`${location.pathname}${location.search}${location.hash}`
			)
				sys.history.pushState({ url }, '', href);
		}
	},

	deserialize() {
		return {
			path: sys.location.search.slice(1),
			hash: sys.location.hash.slice(1),
		};
	},
};

export const PathStrategy: Strategy = {
	getHref(url: Url | string) {
		url = typeof url === 'string' ? parseUrl(url) : url;
		return `${url.path}${url.hash ? `#${url.hash}` : ''}`;
	},

	serialize(url) {
		const oldUrl = sys.history.state?.url;
		if (!oldUrl || url.hash !== oldUrl.hash || url.path !== oldUrl.path) {
			const href = this.getHref(url);
			if (
				href !==
				`${location.pathname}${location.search}${location.hash}`
			)
				// Firefox and safari do not accept empty string as href
				sys.history.pushState({ url }, '', href || '/');
		}
	},

	deserialize() {
		return {
			path: sys.location.pathname,
			hash: sys.location.hash.slice(1),
		};
	},
};

export const HashStrategy: Strategy = {
	getHref(url: Url | string) {
		url = typeof url === 'string' ? parseUrl(url) : url;
		return `#${url.path}${url.hash ? `#${url.hash}` : ''}`;
	},

	serialize(url) {
		const href = HashStrategy.getHref(url);
		if (sys.location.hash !== href) sys.location.hash = href;
	},

	deserialize() {
		return parseUrl(sys.location.hash.slice(1));
	},
};

export const Strategies = {
	hash: HashStrategy,
	path: PathStrategy,
	query: QueryStrategy,
};

export class MainRouter {
	state?: RouterState;
	routes = new RouteManager();
	instances: RouteInstances = {};
	root?: RouteElement;

	private lastGo?: Url | string;

	constructor(private callbackFn?: (state: RouterState) => void) {}

	getState() {
		if (!this.state) throw new Error('Invalid router state');
		return this.state;
	}

	/**
	 * Register a new route
	 */
	route<T extends RouteElement>(def: RouteDefinition<T>) {
		const route = new RouteBase<T>(def);
		this.routes.register(route as RouteBase<RouteElement>);
		return route;
	}

	go(url: Url | string): void {
		this.lastGo = url;
		const parsedUrl = typeof url === 'string' ? parseUrl(url) : url;
		const path = parsedUrl.path;
		const currentUrl = this.state?.url;

		if (path !== currentUrl?.path) {
			const route = this.routes.findRoute(path);

			if (!route) throw new Error(`Path: "${path}" not found`);

			const args = route.path?.getArguments(path);

			if (route.redirectTo)
				return this.go(replaceParameters(route.redirectTo, args));

			const current = this.execute(route, args);

			// Check if page was redirected
			if (this.lastGo !== url) return;

			if (!this.root)
				throw new Error(`Route: "${path}" could not be created`);
			this.updateState({
				url: parsedUrl,
				arguments: args,
				route,
				current,
				root: this.root,
			});
		} else if (this.state && parsedUrl.hash != currentUrl?.hash) {
			this.updateState({
				...this.state,
				url: parsedUrl,
			});
		}
	}

	getPath(routeId: string, params: RouteArguments) {
		const route = this.routes.get(routeId);
		const path = route && route.path;

		return path && replaceParameters(path.toString(), params);
	}

	isActiveUrl(url: string) {
		const parsed = parseUrl(url);
		if (!this.state?.url) return false;
		const current = this.state.url;
		return !!Object.values(this.instances).find(el => {
			const routeDef = el[routeSymbol];
			const currentArgs = this.state?.arguments;

			if (
				routeDef?.path?.test(parsed.path) &&
				(!parsed.hash || parsed.hash === current.hash)
			) {
				if (currentArgs) {
					const args = routeDef.path.getArguments(parsed.path);

					for (const i in args)
						if (currentArgs[i] != args[i]) return false;
				}

				return true;
			}
			return false;
		});
	}

	protected updateState(state: RouterState) {
		this.state = state;
		this.callbackFn?.(state);
	}

	private findRoute<T extends RouteElement>(id: string, args: Partial<T>) {
		const route = this.instances[id] as T;
		let i: string;

		if (route)
			for (i in args) {
				const arg = args[i as keyof T] as T[keyof T];
				if (arg !== undefined) route[i as keyof T] = arg;
			}

		return route;
	}

	private executeRoute<T extends RouteElement>(
		route: RouteBase<T>,
		args: Partial<T>, //RouteArguments,
		instances: RouteInstances,
	) {
		const parentId = route.parent,
			Parent = parentId && this.routes.get(parentId),
			id = route.id,
			parent = Parent && this.executeRoute(Parent, args, instances),
			instance = this.findRoute(id, args) || route.create(args);

		if (!parent) this.root = instance;
		else if (instance && instance.parentNode !== parent)
			parent.appendChild(instance);

		instances[id] = instance;

		return instance;
	}

	private discardOldRoutes(newInstances: RouteInstances) {
		const oldInstances = this.instances;

		for (const i in oldInstances) {
			const old = oldInstances[i];
			if (newInstances[i] !== old) {
				old.parentNode?.removeChild(old);
				delete oldInstances[i];
			}
		}
	}

	private execute<T extends RouteElement>(
		Route: RouteBase<T>,
		args?: Partial<T>,
	) {
		const instances = {};
		const result = this.executeRoute(Route, args || {}, instances);
		this.discardOldRoutes(instances);
		this.instances = instances;
		return result;
	}
}

export const routerState = new Reference<void>();
export const strategy$ = new Reference<Strategy>();
export const router = new MainRouter(() => routerState.next());

interface RouteOptions {
	path: string;
	id?: string;
	parent?: string;
	isDefault?: boolean;
	redirectTo?: string;
}

export function route<T extends Component>(path: string | RouteOptions) {
	return (ctor: (new () => T) | (abstract new () => T)) => {
		const options = typeof path === 'string' ? { path } : path;
		router.route({
			...options,
			render: () => new (ctor as new () => T)(),
		});
	};
}

export function DefaultRoute(path: string | RouteOptions = '') {
	return <T extends typeof HTMLElement>(ctor: T) => {
		const options = typeof path === 'string' ? { path } : path;
		router.route({
			...options,
			isDefault: true,
			render: () => new ctor(),
		});
	};
}

export function routeIsActive(path: string) {
	return routerState.map(() => router.isActiveUrl(path));
}

function resetScroll(host: HTMLElement) {
	let parent: HTMLElement | null = host;
	while ((parent = parent.parentElement))
		if (parent.scrollTop !== 0) return parent.scrollTo(0, 0);
}

export function routerOutlet(host: HTMLElement) {
	let currentRoute: Node;
	return routerState
		.tap(() => {
			const { root } = router.getState();
			if (root.parentNode !== host) host.appendChild(root);
			else if (
				currentRoute &&
				currentRoute !== root &&
				currentRoute.parentNode
			)
				host.removeChild(currentRoute);

			currentRoute = root;
		})
		.raf(() => {
			const url = router.getState().url;
			if (url.hash) {
				host
					.querySelector(`#${url.hash},a[name="${url.hash}"]`)
					?.scrollIntoView();
			} else if (
				host.parentElement &&
				history.state?.lastAction &&
				history.state?.lastAction !== 'pop'
			)
				resetScroll(host);
		});
}

export function routerStrategy(
	getUrl: Observable<unknown>,
	strategy: Strategy = Strategies.query,
) {
	return merge(
		observable(() => strategy$.next(strategy)),
		getUrl.tap(() => router.go(strategy.deserialize())),
		routerState.tap(() => strategy.serialize(router.getState().url)),
	).catchError(e => {
		// Prevent routing errors in iframes.
		if ((e as Error)?.name === 'SecurityError') return EMPTY;
		throw e;
	});
}

export function setDocumentTitle() {
	return routerState
		.switchMap(() => {
			const state = router.getState();
			const result = [];
			let current: RouteElement | null = state.current;

			do {
				const title = current.routeTitle;
				if (title)
					result.unshift(
						title instanceof Observable ? title : of(title),
					);
			} while ((current = current.parentNode as RouteElement));

			return combineLatest(...result);
		})
		.tap(title => (document.title = title.join(' - ')));
}

export function onHashChange() {
	return concat(
		of(location.hash.slice(1)),
		on(window, 'hashchange').map(() => location.hash.slice(1)),
	);
}

let pushSubject: BehaviorSubject<unknown>;
export function onHistoryChange() {
	if (!pushSubject) {
		pushSubject = new BehaviorSubject(history.state);
		const old = history.pushState;
		history.pushState = function (...args) {
			const result = old.apply(this, args);
			if (history.state) history.state.lastAction = 'push';
			pushSubject.next(history.state);
			return result;
		};
	}
	return merge(
		on(window, 'popstate').map(() => {
			if (history.state) history.state.lastAction = 'pop';
			return history.state;
		}),
		pushSubject,
	);
}

export function onLocation() {
	let lastHref: string;
	return merge(onHashChange(), onHistoryChange())
		.map(() => window.location)
		.filter(loc => {
			const res = loc.href !== lastHref;
			lastHref = loc.href;
			return res;
		});
}

export function initializeRouter(
	host: Component,
	strategy: 'hash' | 'query' | 'path' | Strategy = Strategies.query,
	getUrl?: Observable<unknown>,
) {
	const strategyObj =
		typeof strategy === 'string' ? Strategies[strategy] : strategy;
	const getter =
		getUrl ||
		(strategyObj === Strategies.hash ? onHashChange() : onLocation());

	return merge(
		routerOutlet(host),
		routerStrategy(getter, strategyObj),
		setDocumentTitle(),
	);
}

export function routerHost(
	strategy: 'hash' | 'query' | 'path' | Strategy = Strategies.query,
	getUrl?: Observable<unknown>,
) {
	return (host: Component) => initializeRouter(host, strategy, getUrl);
}

interface RouteTitleEntry {
	title: string | Observable<string>;
	first: boolean;
	path?: string;
}

export const routeTitles = routerState.raf().map(() => {
	const result: RouteTitleEntry[] = [];
	const state = router.getState();
	let route = state.current;
	do {
		if (route.routeTitle)
			result.unshift({
				title: route.routeTitle,
				first: route === state.current,
				path: routePath(route),
			});
	} while ((route = route.parentNode as RouteElement));

	return result;
});

function routePath(routeEl: RouteElement) {
	const route = getElementRoute(routeEl);
	return (
		route &&
		replaceParameters(
			route.path?.toString() || '',
			router.state?.arguments || {},
		)
	);
}

export function linkBehavior(
	host: Component & { href: string; external: boolean },
) {
	return onAction(host).tap(ev => {
		ev.preventDefault();
		if (host.href !== undefined)
			if (host.external) location.assign(host.href);
			else router.go(host.href);
	});
}

export function bindHref(
	host: Component & { href?: string; external?: boolean; target?: string },
	link: HTMLAnchorElement,
	actionEl: HTMLElement = link,
) {
	return merge(
		combineLatest(strategy$, onUpdate(host)).tap(([strategy]) => {
			if (host.href !== undefined)
				link.href = host.external
					? host.href
					: strategy.getHref(host.href);
			link.target = host.target || '';
		}),
		onAction(link).tap(ev => {
			if (!host.target) ev.preventDefault();
		}),
		onAction(actionEl).tap(() => {
			if (host.href !== undefined && !host.target) {
				if (host.external) location.assign(host.href);
				else router.go(host.href);
			}
		}),
	);
}

function renderTemplate(tpl: HTMLTemplateElement, title?: string) {
	const result = document.createElement('div');
	result.style.display = 'contents';
	(result as RouteElement).routeTitle = title;
	result.appendChild(tpl.content.cloneNode(true));
	return result;
}

/**
 * Provides a declarative router as a web component for managing navigation and
 * route rendering within a single-page application.
 *
 * Supports registering routes declaratively via <template> children, allowing
 * route definitions with `data-path`, `data-id`, `data-parent`, `data-default`,
 * `data-title`, and `data-redirectto` attributes. The route's content is the
 * template's DOM, rendered in-place upon route activation.
 *
 * Navigation strategy (hash, query, or path) can be set via the `strategy`
 * attribute, with automatic detection and synchronization of the browser's URL.
 * Automatically updates `document.title` based on active route's `data-title`.
 *
 * Dynamically watches for added/removed <template> elements and updates routes
 * accordingly, enabling hot-swapping or lazy loading of route templates.
 *
 * Supports nested and hierarchical routes via `data-parent`, and automatic
 * path redirection using `data-redirectto`.
 *
 * @title Declarative Router Component - SPA Navigation & Routing
 * @icon fork_right
 * @tagName c-router
 * @beta
 */
export class RouterComponent extends Component {
	strategy: 'hash' | 'path' | 'query' = 'query';

	get state() {
		return router.state;
	}

	go(url: string) {
		return router.go(url);
	}
}

component(RouterComponent, {
	tagName: 'c-router',
	init: [attribute('strategy')],
	augment: [
		host => {
			function register(el: HTMLTemplateElement) {
				const dataset = el.dataset;
				if (dataset.registered) return;
				dataset.registered = 'true';
				const title = dataset.title || undefined;
				router.route({
					path: dataset.path,
					id: dataset.id || undefined,
					parent: dataset.parent || undefined,
					isDefault: el.hasAttribute('data-default'),
					redirectTo: dataset.redirectto,
					render: renderTemplate.bind(null, el, title),
				});
			}

			return onLoad().switchMap(() => {
				for (const child of Array.from(host.children))
					if (child instanceof HTMLTemplateElement) register(child);

				return merge(
					onChildrenMutation(host).tap(ev => {
						if (
							ev.type === 'added' &&
							ev.value instanceof HTMLTemplateElement
						)
							register(ev.value);
					}),
					get(host, 'strategy').switchMap(strategyName => {
						const strategy = Strategies[strategyName];
						return routerStrategy(
							onLocation(),
							strategy,
						).catchError((e, source) => {
							console.error(e);
							return source;
						});
					}),
				);
			});
		},
	],
});
