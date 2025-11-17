import fs from 'fs/promises';
import path from 'path';

import { sh } from '../program/index.js';
import { Package, getLatestVersion, readPackage } from './npm.js';

export async function buildRoot() {
	const dirs = await fs.readdir('.');
	const result = [];
	const pkg = await readPackage('./package.json');

	for (const dir of dirs) {
		result.push(await renderPackage(dir, pkg));
	}

	const content = `${pkg.description}

## Packages

| Name           | Version | License | Description                          | Links                                          |
| -------------- | ------- | ------- | ------------------------------------ | ---------------------------------------------- |
${result.join('')}
`;

	await write('README.md', content);
}

async function readPkg(dir: string) {
	const folder = path.join('.', dir);
	const pkgPath = path.resolve(folder, './package.json');
	let pkg;

	try {
		pkg = await readPackage(pkgPath);
	} catch (e) {
		/* Ignore */
		return;
	}

	if (pkg.private) return;

	const valid = pkg.description && pkg.license && pkg.homepage;

	if (!valid) throw new Error(`Invalid package: ${pkg.name}`);

	return pkg;
}

function write(file: string, content: string) {
	console.log(`Writing ${file}`);
	if (!content) throw new Error('No content');
	return fs.writeFile(file, content);
}

function npmLink(pkgName: string, version: string) {
	return `https://npmjs.com/package/${pkgName}/v/${version}`;
}

async function renderPackage(dir: string, rootPkg: Package) {
	const pkg = await readPkg(dir);
	if (!pkg) return '';

	console.log(`Package: ${dir}`);

	await sh(`npm run build audit test package docs --prefix ${dir}`);

	const latestVersion =
		(await getLatestVersion(pkg.name, 'beta').catch(() => '')) ||
		(await getLatestVersion(pkg.name).catch(() => ''));
	const version = latestVersion
		? `[${latestVersion}](${npmLink(pkg.name, latestVersion)})`
		: `${pkg.version}`;
	const homepage =
		pkg.docs ??
		(rootPkg.docs
			? new URL(`${pkg.name}/${pkg.version}/`, rootPkg.docs + '/').href
			: '');

	return `| ${pkg.name.padEnd(20)} | ${version} | ${pkg.license.padEnd(
		10,
	)} | ${pkg.description} | ${homepage ? `[Docs](${homepage})` : ''} |\n`;
}
