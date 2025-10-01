import { Observable, defer, merge, of, EMPTY } from '../rx/index.js';
import { existsSync, readFileSync } from 'fs';
import { join, resolve } from 'path';
import { file } from './file.js';
import { execSync } from 'child_process';
import { Output } from './builder.js';
import { License, Package } from './npm.js';
import * as esbuildApi from 'esbuild';

const SCRIPTDIR = process.cwd();

export const BASEDIR = execSync(`npm prefix`, { cwd: SCRIPTDIR })
	.toString()
	.trim();

const LICENSE_MAP: Record<License, string> = {
	'GPL-3.0': 'license-GPL-3.0.txt',
	'GPL-3.0-only': 'license-GPL-3.0.txt',
	'Apache-2.0': 'license-Apache-2.0.txt',
	'SEE LICENSE IN LICENSE.md': '',
	UNLICENSED: '',
};

function verifyFields(fields: string[], pkg: any, pkgPath: string) {
	for (const f of fields)
		if (!pkg[f]) throw new Error(`Field "${f}" missing in "${pkgPath}"`);
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
			.then(() => subs.complete());
	});
}

export function readPackage(base: string = BASEDIR): Package {
	const pkg = resolve(base, 'package.json');

	if (!existsSync(pkg)) throw new Error(`"${pkg}" not found`);

	const PACKAGE = JSON.parse(readFileSync(pkg, 'utf8'));
	verifyFields(['name', 'version', 'description'], PACKAGE, pkg);
	if (!PACKAGE.private) verifyFields(['license'], PACKAGE, pkg);
	return PACKAGE;
}
function packageJson(p: any) {
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
					files: p.files || [
						'*.js',
						'*.d.ts',
						'*.css',
						'LICENSE.md',
						'*.md',
					],
					main: p.main || 'index.js',
					exports: p.exports,
					browser: p.browser,
					homepage: p.homepage,
					bugs: p.bugs,
					bin: p.bin,
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
	} catch (E) {
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

${extra}`),
		});
	});
}

export function pkg() {
	return defer(() => {
		const p = readPackage();
		const licenseId = p.license;

		const output: Observable<Output>[] = [packageJson(p)];

		if (licenseId) output.push(license(licenseId));
		return merge(...output);
	});
}
