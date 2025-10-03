export const storage = {
	/**
	 * Retrieves a value from the localStorage given a key.
	 * If the key does not exist, it returns undefined.
	 * Catches and logs any potential errors during the retrieval process,
	 * which could occur if there are issues accessing localStorage.
	 */
	get(key: string): string | undefined {
		try {
			return localStorage.getItem(key) ?? undefined;
		} catch (e) {
			console.error(e);
		}
		return '';
	},
	/**
	 Sets a value in the localStorage for a given key.
If setting the item fails, typically due to storage being full 
or access restrictions, it catches and logs the error to the console.
	 */
	set(key: string, name: string) {
		try {
			localStorage.setItem(key, name);
		} catch (e) {
			console.error(e);
		}
	},
};

export function sortBy<T, K extends keyof T = keyof T>(key: K) {
	return (a: T, b: T) => (a[key] > b[key] ? 1 : a[key] < b[key] ? -1 : 0);
}

/**
 * Retrieves a target element based on the given `id` from the perspective of the `host` element.
 * - If `id` is `_parent`, it returns the `host`'s parent element.
 * - If `id` is `_next`, it returns the `host`'s next sibling element.
 * - If `id` is a string, it looks for an element with the corresponding ID in the `host`'s document.
 * - If `id` is not a string, it directly returns `id`.
 *
 * This helper simplifies locating specific elements relative to the `host`, supporting dynamic resolutions.
 */
export function getTargetById<T>(
	host: Element,
	id: T,
): Exclude<T, string> | undefined {
	if (id === '_parent')
		return (host.parentElement || undefined) as
			| Exclude<T, string>
			| undefined;
	else if (id === '_next')
		return (host.nextElementSibling || undefined) as
			| Exclude<T, string>
			| undefined;

	if (typeof id !== 'string')
		return (id ?? undefined) as Exclude<T, string> | undefined;

	let result;
	const root = host.getRootNode();
	if (root instanceof ShadowRoot) {
		result = root.getElementById(id);
		if (result) return result as Exclude<T, string>;
	}

	return (host.ownerDocument.getElementById(id) ?? undefined) as
		| Exclude<T, string>
		| undefined;
}
