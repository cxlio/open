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
