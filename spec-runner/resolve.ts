import { readFileSync } from 'fs';
import { join } from 'path';

export interface Package {
	name: string;
	version: string;
	main?: string;
	bin?: string;
	browser?: string;
	type?: string;
	exports?: string | Record<string, string | ExportTarget>;
}

export interface ExportTarget {
	import?: string;
	node?: string;
	default?: string;
}

export function resolveImport(specifier: string, baseDir: string) {
	const match = specifier.split('/');
	const isNs = match[0]?.startsWith('@');
	const pkg = isNs ? `${match[0]}/${match[1]}` : (match[0] ?? '');
	const rest = match.slice(isNs ? 2 : 1);

	const sub = rest.length ? './' + rest.join('/') : '.';

	const pkgDir = join(baseDir, 'node_modules', pkg);
	let pkgJson: Package;
	try {
		pkgJson = JSON.parse(
			readFileSync(join(pkgDir, 'package.json'), 'utf8'),
		);
	} catch (e) {
		return;
	}

	const exportsMap = pkgJson.exports;
	if (!exportsMap) {
		if (sub === '.') {
			const entry = /*pkgJson.module ||*/ pkgJson.main || 'index.js';
			return join(pkgDir, entry);
		}
		return join(pkgDir, sub);
	}

	// direct string export (only allowed for ".")
	if (typeof exportsMap === 'string') {
		if (sub !== '.') return;
		return join(pkgDir, exportsMap);
	}

	for (const key in exportsMap) {
		const val = exportsMap[key];
		if (!val) throw new Error(`Invalid export ${key}`);

		if (!key.includes('*') && key === sub) {
			return resolveTarget(val, pkgDir);
		}

		const star = key.indexOf('*');
		if (star !== -1) {
			const prefix = key.slice(0, star);
			const suffix = key.slice(star + 1);

			if (sub.startsWith(prefix) && sub.endsWith(suffix)) {
				const inner = sub.slice(
					prefix.length,
					sub.length - suffix.length,
				);
				return resolveTargetPattern(val, inner, pkgDir);
			}
		}
	}
}

function resolveTargetObject(target: ExportTarget, pkgDir: string) {
	return join(pkgDir, target.import ?? target.default ?? '');
}

function resolveTarget(target: string | ExportTarget, pkgDir: string) {
	if (typeof target === 'string') return join(pkgDir, target);
	if (typeof target === 'object') {
		return resolveTargetObject(target, pkgDir);
	}
	throw new Error('No import target available');
}

function resolveTargetPattern(
	target: string | ExportTarget,
	inner: string,
	pkgDir: string,
) {
	if (typeof target === 'string') {
		return join(pkgDir, target.replace('*', inner));
	}
	if (typeof target === 'object') {
		return resolveTargetObject(target, pkgDir);
	}
	throw new Error('No import target available');
}
