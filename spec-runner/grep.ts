export function parseGrep(pattern?: string) {
	if (!pattern) return undefined;
	const match = pattern.match(/^\/(.*)\/([gimsuy]*)$/);
	if (!match) return new RegExp(pattern);
	return new RegExp(match[1] ?? '', match[2]);
}
