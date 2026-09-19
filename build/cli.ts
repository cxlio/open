#!/usr/bin/env node
import { existsSync, readFileSync } from 'node:fs';
import { registerHooks } from 'node:module';
import { dirname, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

function findImportMap(
	directory: string,
): { imports: Record<string, string>; root: string } | undefined {
	const file = resolve(directory, 'package.json');
	if (existsSync(file)) {
		const pkg: { importmap?: Record<string, string> } = JSON.parse(
			readFileSync(file, 'utf8'),
		);
		if (pkg.importmap) return { imports: pkg.importmap, root: directory };
	}
	const parent = dirname(directory);
	if (parent !== directory) return findImportMap(parent);
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

if (import.meta.main) {
	const importMap = findImportMap(import.meta.dirname);
	if (importMap) {
		const { imports, root } = importMap;
		registerHooks({
			resolve(specifier, context, nextResolve) {
				const target = mapSpecifier(specifier, imports);
				if (!target) return nextResolve(specifier, context);
				const path = target.startsWith('/') ? target.slice(1) : target;
				return nextResolve(
					pathToFileURL(resolve(root, path)).href,
					context,
				);
			},
		});
	}

	await import('./cli-main.js').then(module => module.main());
}
