import { registerHooks } from 'node:module';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

export interface ImportMap {
	imports?: Record<string, string>;
}

function mapSpecifier(
	specifier: string,
	imports: Record<string, string>,
) {
	const exact = imports[specifier];
	if (exact) return exact;
	let match = '';
	for (const key in imports)
		if (
			key.endsWith('/') &&
			specifier.startsWith(key) &&
			key.length > match.length
		)
			match = key;
	const target = imports[match];
	if (target) return target + specifier.slice(match.length);
}

export function registerImportMap(
	value: ImportMap | string | undefined,
	root: string,
) {
	if (!value) return;
	const map: ImportMap = typeof value === 'string' ? JSON.parse(value) : value;
	const imports = map.imports ?? {};
	return registerHooks({
		resolve(specifier, context, nextResolve) {
			const target = mapSpecifier(specifier, imports);
			if (!target) return nextResolve(specifier, context);
			const path = target.startsWith('/') ? target.slice(1) : target;
			return nextResolve(pathToFileURL(resolve(root, path)).href, context);
		},
	});
}
