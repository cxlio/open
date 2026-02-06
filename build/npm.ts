import { input, sh } from '../program/index.js';
import { readFile } from 'fs/promises';
import { /*checkBranchClean,*/ getBranch, getMainBranch } from './git.js';
import { resolve } from 'path';

export type License =
	| 'GPL-3.0'
	| 'GPL-3.0-only'
	| 'Apache-2.0'
	| 'UNLICENSED'
	| 'SEE LICENSE IN LICENSE.md';

export type Dependencies = Record<string, string>;

export interface Package {
	name: string;
	version: string;
	description?: string;
	license?: License;
	files?: string[];
	main?: string;
	bin?: string;
	keywords?: string[];
	browser?: string;
	homepage?: string;
	private: boolean;
	bugs: string;
	repository: string | { type: 'git'; url: string; directory?: string };
	dependencies?: Dependencies;
	devDependencies?: Dependencies;
	peerDependencies?: Dependencies;
	bundledDependencies?: Dependencies;
	sideEffects?: boolean;
	type?: string;
	scripts?: Record<string, string>;
	exports?: Record<string, string>;

	docs?: string;
	cxl?: { ignore?: boolean };
}

export interface PackageInfo extends Package {
	'dist-tags': Record<string, string>;
	versions: string[];
	time: Record<string, string>;
}

export async function readPackage(path: string) {
	return JSON.parse(await readFile(path, 'utf8')) as Package;
}

export async function getLatestVersion(
	packageName: string,
	tag = 'latest',
): Promise<string | undefined> {
	const info = await getPackageInfo(packageName);
	return info['dist-tags'][tag] ?? undefined;
}

export async function isPackageVersionPublished(
	packageName: string,
	version: string,
) {
	const info = await getPackageInfo(packageName);
	return info.versions.includes(version);
}

export async function testPackage(dir: string, distDir: string) {
	const cwd = resolve(distDir);
	try {
		await sh(`npm install --production`, { cwd });
		await sh(`npm test`, { cwd: dir });
	} finally {
		await sh(`rm -rf ${cwd}/node_modules ${cwd}/package-lock.json`);
	}
}

export async function publishNpm(dir: string, distDir: string) {
	const branch = await getBranch(process.cwd());
	const mainBranch = await getMainBranch(process.cwd());
	if (branch !== mainBranch)
		throw `Active branch "${branch}" is not main branch`;

	const pkg = await readPackage(`${dir}/package.json`);
	const pkgName = pkg.name.split('/')[1];

	//await checkBranchClean(mainBranch);
	const info = await getPackageInfo(pkg.name);

	if (info.versions.includes(pkg.version)) {
		console.log(
			`Package "${pkg.name}" version "${pkg.version}" already published. Skipping.`,
		);
	} else {
		console.log(`Building ${pkg.name} ${pkg.version}`);
		await sh(`npm run build package --prefix ${dir}`);

		await testPackage(dir, distDir);

		const tag = pkg.version.includes('beta')
			? 'beta'
			: pkg.version.includes('alpha')
				? 'alpha'
				: 'latest';
		const removeVersion =
			tag === 'alpha' ? info['dist-tags'].alpha : undefined;
		const otp = await input({ prompt: 'NPM OTP: ', mask: true });
		if (!otp) throw new Error('Invalid otp');

		console.log(
			await sh(`npm publish --access=public --tag ${tag} --otp ${otp}`, {
				cwd: distDir,
			}),
		);

		if (tag === 'beta' || tag === 'alpha') {
			const otp2 = await input({ prompt: 'NPM OTP: ', mask: true });
			const baseTag = `${pkg.version.split('.')[0]}-${tag}`;
			console.log(
				await sh(
					`npm dist-tag add ${pkg.name}@${pkg.version} ${baseTag} --otp ${otp2}`,
				),
			);
		}

		if (removeVersion) {
			const otp = await input({ prompt: 'NPM OTP: ', mask: true });
			try {
				console.log(
					await sh(
						`npm unpublish ${pkg.name}@${removeVersion} --otp ${otp}`,
					),
				);
			} catch (e) {
				console.error(
					`Removing old version ${pkg.name}@${removeVersion} failed.`,
				);
				console.error(e);
			}
		}
	}

	// Create Release Tag if it doesn't exist already
	const gitTag = `${pkgName}/${pkg.version}`;
	if (!(await sh(`git tag -l ${gitTag}`)).trim()) {
		console.log(`Creating tag "${gitTag}"`);
		await sh(`git tag ${gitTag} && git push origin ${gitTag}`);
	}
}

export async function getPackageInfo(name: string): Promise<PackageInfo> {
	try {
		return JSON.parse(
			(await sh(`npm show ${name} --json`)).trim(),
		) as PackageInfo;
	} catch (e) {
		const msg = String(e); //?.stderr ?? e?.stdout ?? e?.message ?? e);
		// npm uses E404 / "Not Found" when the package doesn't exist
		if (
			/\bE404\b/.test(msg) ||
			/Not Found/i.test(msg) ||
			/code E404/i.test(msg)
		) {
			return {
				name,
				version: '',
				private: false,
				bugs: '',
				repository: '',
				bundledDependencies: {},
				'dist-tags': {},
				versions: [],
				time: {},
			} as PackageInfo;
		}
		throw e;
	}
}
