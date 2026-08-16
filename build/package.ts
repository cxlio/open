import { Observable, defer, merge, of, EMPTY } from '../rx/index.js';
import { existsSync, readFileSync } from 'fs';
import { join, relative, resolve } from 'path';
import { file } from './file.js';
import { execSync } from 'child_process';
import { Output } from './builder.js';
import { License, Package } from './npm.js';
import * as esbuildApi from 'esbuild-wasm';

const SCRIPTDIR = process.cwd();

export const BASEDIR = execSync(`npm prefix`, { cwd: SCRIPTDIR })
	.toString()
	.trim();

const LICENSE_MAP: Record<License, string> = {
	'GPL-3.0': 'license-GPL-3.0.md',
	'GPL-3.0-only': 'license-GPL-3.0.md',
	'Apache-2.0': 'license-Apache-2.0.md',
	'SEE LICENSE IN LICENSE.md': '',
	UNLICENSED: '',
};

function verifyFields(fields: (keyof Package)[], pkg: Package, pkgPath: string) {
	for (const f of fields)
		if (!pkg[f]) throw new Error(`Field "${f}" missing in "${pkgPath}"`);
}

function collectDependencies(
	deps: Package['dependencies'],
	map: Record<string, string> = {},
) {
	for (const name in deps) map[name] = `/${name}`;
	return map;
}

export function getDependencies(rootPkg: Package, pkgJson: Package) {
	const map: Record<string, string> = {};
	if (rootPkg.devDependencies)
		collectDependencies(rootPkg.devDependencies, map);
	if (pkgJson.dependencies) collectDependencies(pkgJson.dependencies, map);
	return map;
}

export function getPackageExternal(pkgJson: Package) {
	return [
		...Object.keys(pkgJson.dependencies ?? {}),
		...Object.keys(pkgJson.peerDependencies ?? {}),
		...Object.keys(pkgJson.bundledDependencies ?? {}),
	];
}

export function getPackageName(specifier: string) {
	if (
		specifier.startsWith('.') ||
		specifier.startsWith('/') ||
		specifier.startsWith('node:')
	)
		return;
	if (specifier.startsWith('@')) {
		const [scope, name] = specifier.split('/');
		if (scope && name) return `${scope}/${name}`;
	}
	return specifier.split('/')[0];
}

export function getPackagePlatform(pkgJson: Package): esbuildApi.Platform {
	return pkgJson.browser ? 'browser' : 'node';
}

export function getPackageBundleEntryPoints(
	outputDir: string,
	pkgJson: Package,
) {
	return [
		{
			out: pkgJson.browser ? 'index.bundle' : 'index',
			in: join(outputDir, 'index.js'),
		},
	];
}

function javascriptOutputPath(path: string) {
	return path.replace(/^\.\//, '').replace(/\.[cm]?js$/, '');
}

function expandEntryPoints(
	outputDir: string,
	patterns: readonly string[],
	files: readonly string[],
	outputPath: (path: string) => string,
) {
	const entries = new Map<string, { in: string; out: string }>();
	for (const pattern of patterns) {
		const wildcard = pattern.indexOf('*');
		if (wildcard === -1) {
			entries.set(pattern, {
				in: join(outputDir, pattern),
				out: outputPath(pattern),
			});
			continue;
		}
		const prefix = pattern.slice(0, wildcard);
		const suffix = pattern.slice(wildcard + 1);
		for (const file of files) {
			const out = relative(outputDir, file);
			if (out.startsWith(prefix) && out.endsWith(suffix))
				entries.set(out, { in: file, out: outputPath(out) });
		}
	}
	return [...entries.values()];
}

export function getPackageEntryPoints(
	outputDir: string,
	pkgJson: Package,
	javascriptFiles: readonly string[],
) {
	if (!pkgJson.exports) return getPackageBundleEntryPoints(outputDir, pkgJson);
	return expandEntryPoints(
		outputDir,
		Object.values(pkgJson.exports).map(target =>
			target.replace(/^\.\//, ''),
		),
		javascriptFiles,
		javascriptOutputPath,
	);
}

function declarationTarget(target: string) {
	const path = target.replace(/^\.\//, '');
	if (path.endsWith('.mjs')) return path.replace(/\.mjs$/, '.d.mts');
	if (path.endsWith('.cjs')) return path.replace(/\.cjs$/, '.d.cts');
	if (path.endsWith('.js')) return path.replace(/\.js$/, '.d.ts');
	throw new Error(`Invalid JavaScript package export: "${target}"`);
}

export function getPackageDeclarationEntryPoints(
	outputDir: string,
	pkgJson: Package,
	declarationFiles: readonly string[] = [],
) {
	const targets = pkgJson.exports
		? Object.values(pkgJson.exports)
		: ['./index.js'];
	return expandEntryPoints(
		outputDir,
		targets.map(declarationTarget),
		declarationFiles,
		path => path,
	);
}

export function esbuild(options: esbuildApi.BuildOptions) {
	return new Observable<never>(subs => {
		esbuildApi
			.build({
				minify: true,
				bundle: true,
				splitting: true,
				format: 'esm',
				tsconfig: 'tsconfig.json',
				platform: 'browser',
				define: {
					CXL_DEBUG: 'false',
				},
				...options,
			})
			.then(
				() => subs.complete(),
				e => subs.error(e),
			);
	});
}

export function readPackage(base: string = BASEDIR): Package {
	const pkg = resolve(base, 'package.json');

	if (!existsSync(pkg)) throw new Error(`"${pkg}" not found`);

	const PACKAGE: Package = JSON.parse(readFileSync(pkg, 'utf8'));
	verifyFields(['name', 'version', 'description'], PACKAGE, pkg);
	if (!PACKAGE.private) verifyFields(['license'], PACKAGE, pkg);
	return PACKAGE;
}
function packageJson(p: Package, main?: string) {
	return of({
		path: 'package.json',
		source: Buffer.from(
			JSON.stringify(
				{
					name: p.name,
					version: p.version,
					description: p.description,
					private: p.private,
					license: p.license,
					files: p.files ?? [
						'*.js',
						'*.d.ts',
						'*.css',
						'LICENSE.md',
						'*.md',
					],
					main: main ?? p.main ?? 'index.js',
					exports: p.exports,
					browser: p.browser,
					homepage: p.homepage,
					bugs: p.bugs,
					bin: p.bin,
					sideEffects: p.sideEffects,
					repository: p.repository,
					dependencies: p.dependencies,
					peerDependencies: p.peerDependencies,
					bundledDependencies: p.bundledDependencies,
					type: p.type,
				},
				null,
				2,
			),
		),
	});
}

function license(id: License) {
	if (id === 'UNLICENSED' || id === 'SEE LICENSE IN LICENSE.md') return EMPTY;
	const licenseFile = LICENSE_MAP[id];
	if (!licenseFile) throw new Error(`Invalid license: "${id}"`);

	return file(join(import.meta.dirname, licenseFile), 'LICENSE');
}

function npmLink(pkgName: string, version: string) {
	return `https://npmjs.com/package/${pkgName}/v/${version}`;
}

function readIfExists(file: string) {
	try {
		return readFileSync(file, 'utf8');
	} catch (e) {
		if (!(e instanceof Error) || !('code' in e) || e.code !== 'ENOENT')
			throw e;

		return '';
	}
}

/**
 * Generate README file
 */
export function readme() {
	return defer(() => {
		const pkg = readPackage(BASEDIR);
		const extra = readIfExists('USAGE.md');
		const encodedName = encodeURIComponent(pkg.name);

		return of({
			path: 'README.md',
			source: Buffer.from(`# ${pkg.name} 
	
[![npm version](https://badge.fury.io/js/${encodedName}.svg)](https://badge.fury.io/js/${encodedName})

${pkg.description}

## Project Details

-   Branch Version: [${pkg.version}](${npmLink(pkg.name, pkg.version)})
-   License: ${pkg.license}
-   Documentation: [Link](${pkg.homepage})
-   Report Issues: [Github](${pkg.bugs})

## Installation

	npm install ${pkg.name}
${extra ? `\n${extra}` : ''}`),
		});
	});
}

export function pkg(main?: string) {
	return defer(() => {
		const p = readPackage();
		const licenseId = p.license;

		const output: Observable<Output>[] = [packageJson(p, main)];

		if (licenseId) output.push(license(licenseId));
		return merge(...output);
	});
}
