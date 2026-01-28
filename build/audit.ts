import * as path from 'path';
import { promises as fs } from 'fs';
import * as cp from 'child_process';
import { readJson } from '../program/index.js';

import type { Package } from './npm.js';

interface LintData {
	projectPath: string;
	name: string;
	pkg: Package;
	rootPkg: Package;
	baseDir: string;
}

interface Rule {
	valid: boolean;
	message: string;
}

interface LinterResult {
	id: string;
	project: string;
	rules: Rule[];
	fix?: Fixer;
	valid?: boolean;
	data?: LintData;
	hasErrors?: boolean;
}

interface Tsconfig {
	references?: { path: string }[];
	extends?: string;
	compilerOptions?: Record<string, string>;
	files?: string[];
	include?: string[];
	exclude?: string[];
}

type Fixer = (data: LintData) => Promise<void>;
type Linter = (data: LintData) => Promise<LinterResult>;

const BugsUrl = 'https://github.com/cxlio/cxl/issues';
const baseDir = path.resolve('.');
const requiredPackageFields = [
	'name',
	'version',
	'description',
	'license',
	'homepage',
	'bugs',
];
const requiredPackageScripts = ['build', 'test'];
const licenses = [
	'GPL-3.0',
	'GPL-3.0-only',
	'Apache-2.0',
	'UNLICENSED',
	'SEE LICENSE IN LICENSE.md',
];

async function fixDependencies({ projectPath, rootPkg }: LintData) {
	const pkgPath = `${projectPath}/package.json`;
	const pkg = await readJson<Package>(pkgPath);
	const oldPackage = JSON.stringify(pkg, null, '\t');

	for (const name in pkg.dependencies) {
		const rootValue =
			rootPkg.devDependencies?.[name] ?? rootPkg.dependencies?.[name];
		if (rootValue && pkg.dependencies[name] !== rootValue)
			pkg.dependencies[name] = rootValue;
	}

	const newPackage = JSON.stringify(pkg, null, '\t');

	if (oldPackage !== newPackage) await fs.writeFile(pkgPath, newPackage);
}

async function fixTsconfig({ projectPath, name }: LintData) {
	const pkgPath = `${projectPath}/package.json`;
	const pkg = await readJson<Package>(pkgPath);
	let tsconfig = await readJson<Tsconfig | false>(
		`${projectPath}/tsconfig.json`,
		false,
	);
	const oldPackage = JSON.stringify(pkg, null, '\t');

	if (!tsconfig) {
		tsconfig = {
			extends: '../tsconfig.json',
			compilerOptions: {
				outDir: `../dist/${name}`,
			},
			files: [],
			references: [],
		};
		await fs.writeFile(
			`${projectPath}/tsconfig.json`,
			JSON.stringify(tsconfig, null, '\t'),
		);
	}

	/*if (tsconfig.references)
		for (const ref of tsconfig.references) {
			const refName = /^\.\.\/([^/]+)/.exec(ref.path)?.[1];
			if (refName) {
				const refPkg = `@cxl/${refName}`;
				const pkgDep = (pkg[depProp] ||= {});

				if (!pkgDep?.[refName]) {
					const pkgVersion = (
						await readJson<Package | null>(
							`${baseDir}/${refName}/package.json`,
							null,
						)
					)?.version;
					if (pkgVersion && pkgDep) pkgDep[refPkg] = `~${pkgVersion}`;
				}

				if (pkg[notDepProp]?.[refName])
					delete pkg[notDepProp]?.[refName];
			}
		}*/

	const newPackage = JSON.stringify(pkg, null, '\t');

	if (oldPackage !== newPackage) await fs.writeFile(pkgPath, newPackage);
}

async function fixTest({ projectPath, name }: LintData) {
	const tsconfigPath = path.join(projectPath, `tsconfig.test.json`);
	let hasChanged = false;

	if (!(await exists(tsconfigPath))) {
		await fs.writeFile(
			tsconfigPath,
			`{
	"extends": "./tsconfig.json",
	"include": ["test.ts"],
	"references": [{ "path": "." }, { "path": "../spec" }]
}
`,
		);
	}

	const testPath = path.join(projectPath, 'test.ts');
	const tsconfig =
		(await readJson<Tsconfig | null>(
			`${projectPath}/tsconfig.test.json`,
			null,
		)) ?? {};

	if (!tsconfig.extends || tsconfig.extends !== './tsconfig.json') {
		tsconfig.extends = './tsconfig.json';
		hasChanged = true;
	}
	if (tsconfig.compilerOptions) {
		delete tsconfig.compilerOptions;
		hasChanged = true;
	}

	if (hasChanged) {
		await fs.writeFile(
			`${projectPath}/tsconfig.test.json`,
			JSON.stringify(tsconfig, null, '\t'),
		);
	}

	if (
		!(await exists(testPath)) &&
		!(await exists(path.join(projectPath, 'test.tsx')))
	) {
		await fs.writeFile(
			testPath,
			`import { spec } from '@cxl/spec';
import {  } from './index.js';

export default spec('${name}', s => {
	s.test('should load', a => {
		a.ok(get);
	});
});
`,
		);
	}
}

function exists(filepath: string) {
	return fs.stat(filepath).catch(() => false);
}

function rule(valid: boolean, message: string): Rule {
	return { valid, message };
}

async function fixPackage({ projectPath, name, rootPkg }: LintData) {
	const pkgPath = `${projectPath}/package.json`;
	const pkg = await readJson<Package>(pkgPath);
	const oldPackage = JSON.stringify(pkg, null, '\t');
	const builder = rootPkg.devDependencies?.['@cxl/build']
		? 'cxl-build'
		: 'node ../dist/build';
	const testScript = `npm run build test`;
	const browser = './index.bundle.js';
	const homepage =
		rootPkg.homepage && new URL(pkg.name, rootPkg.homepage).href;

	pkg.scripts ??= {};
	if (!pkg.scripts.test) pkg.scripts.test = testScript;
	if (!pkg.scripts.build) pkg.scripts.build = builder;
	if (homepage && (!pkg.homepage || pkg.homepage !== homepage))
		pkg.homepage = homepage;

	if (!pkg.license) pkg.license = 'GPL-3.0';
	if (!pkg.bugs || pkg.bugs !== rootPkg.bugs)
		pkg.bugs = rootPkg.bugs || BugsUrl;
	if (!pkg.browser && pkg.devDependencies) delete pkg.devDependencies;
	if (pkg.browser) pkg.browser = browser;
	if (!pkg.repository && rootPkg.repository) {
		if (typeof rootPkg.repository === 'string')
			rootPkg.repository = { type: 'git', url: rootPkg.repository };
		pkg.repository = {
			...rootPkg.repository,
			directory: name,
		};
	}
	pkg.type = 'module';

	if (pkg.scripts.test !== testScript) pkg.scripts.test = testScript;

	const newPackage = JSON.stringify(pkg, null, '\t');

	if (oldPackage !== newPackage) await fs.writeFile(pkgPath, newPackage);
}

async function lintPackage({ pkg, name, rootPkg }: LintData) {
	const rules = requiredPackageFields.map(field =>
		rule(field in pkg, `Field "${field}" required in package.json`),
	);

	const browser = './index.bundle.js';

	if (pkg.scripts) {
		const scripts = pkg.scripts;
		rules.push(
			...requiredPackageScripts.map(field =>
				rule(
					field in scripts,
					`Script "${field}" required in package.json`,
				),
			),
		);
	} else
		rules.push(
			rule('scripts' in pkg, `Field "scripts" required in package.json`),
		);

	const testScript = `npm run build test`;

	rules.push(
		/*rule(
			pkg.name === `${rootPkg.name}${name}`,
			`Package name should be "${rootPkg.name}${dir}".`,
		),*/
		rule(
			!!pkg.license && licenses.includes(pkg.license),
			`"${pkg.license}" is not a valid license.`,
		),
		rule(
			!!pkg.browser || !pkg.devDependencies,
			`Package should not have devDependencies.`,
		),
		rule(
			!!rootPkg.homepage,
			'Root package must contain a valid homepage field.',
		),
		rule(
			!!rootPkg.homepage &&
				pkg.homepage === new URL(pkg.name, rootPkg.homepage).href,
			'Package should inherit homepage field from root package.json',
		),
		rule(
			!pkg.browser || pkg.browser === browser,
			`Package "browser" property should be "${browser}"`,
		),
		rule(
			pkg.bugs === rootPkg.bugs,
			`Package "bugs" property must match root package "${rootPkg.bugs}"`,
		),
		rule(
			pkg.scripts?.test === testScript,
			`Valid test script in package.json`,
		),
		rule(!!pkg.repository, 'Package "repository" field must be set'),
		rule(
			typeof pkg.repository !== 'string',
			'"repository" must be an object',
		),
		rule(pkg.type === 'module', 'Package "type" must be "module".'),
	);

	return {
		id: 'package',
		project: name,
		fix: fixPackage,
		rules,
	};
}

async function lintTest({ projectPath }: LintData) {
	const tsconfig = await readJson<Tsconfig>(
		`${projectPath}/tsconfig.test.json`,
	);

	return {
		id: 'test',
		fix: fixTest,
		project: projectPath,
		rules: [
			rule(
				!!(await exists(`${projectPath}/tsconfig.test.json`)),
				`Missing "tsconfig.test.json" file.`,
			),
			rule(
				tsconfig.extends === './tsconfig.json',
				'tsconfig.test.json extends should be "./tsconfig.json"',
			),
			rule(
				!!(
					(await exists(`${projectPath}/test.ts`)) ||
					(await exists(`${projectPath}/test.tsx`))
				),
				`Missing "test.ts" file.`,
			),
			rule(
				!tsconfig.compilerOptions,
				`tsconfig.test.json should not have compilerOptions`,
			),
		],
	};
}

async function lintDependencies({ name, rootPkg, pkg }: LintData) {
	const rules = [];

	for (const name in pkg.dependencies) {
		const pkgValue = pkg.dependencies[name];
		const rootValue =
			rootPkg.devDependencies?.[name] || rootPkg.dependencies?.[name];

		rules.push(
			rule(
				!!(name.startsWith(rootPkg.name) || rootValue),
				`Dependency "${name}" must be included in root package.json`,
			),
			rule(
				pkgValue !== '*',
				`Dependency "${name}" must be a valid version. pkg:${pkgValue}`,
			),
			rule(
				name.startsWith(rootPkg.name) || rootValue === pkgValue,
				`Conflicting versions "${name}". root: ${rootValue}, dep: ${pkgValue}`,
			),
		);
	}

	return {
		id: 'dependencies',
		project: name,
		fix: fixDependencies,
		rules,
	};
}

async function lintTsconfig({ projectPath, name }: LintData) {
	const tsconfig = await readJson<Tsconfig | null>(
		`${projectPath}/tsconfig.json`,
		null,
	);
	const rules = [
		rule(!!tsconfig, 'tsconfig.json should be present'),
		rule(
			!!tsconfig?.compilerOptions,
			'tsconfig.json should have compilerOptions',
		),
		rule(
			tsconfig?.compilerOptions?.outDir === `../dist/${name}`,
			'tsconfig.json should have a valid outDir compiler option',
		),
	];
	//const references = tsconfig?.references;
	//const depProp = pkg.browser ? 'devDependencies' : 'dependencies';

	/*if (references)
		for (const ref of references) {
			const refName = /^\.\.\/([^/]+)/.exec(ref.path)?.[1];

			if (refName) {
				const refPkg = `@cxl/${refName}`;
				rules.push(
					rule(
						!!pkg[depProp]?.[refPkg],
						`reference ${refPkg} should be declared as ${depProp}`,
					),
				);
			}
		}*/

	return {
		id: 'tsconfig',
		project: name,
		fix: fixTsconfig,
		rules,
	};
}

const MATCH_REGEX = /(.+):(.+)/g;

async function lintImports({ name }: LintData) {
	const result = cp.spawnSync('git', ['grep', `"from '\\.\\.\\/"`, name], {
		encoding: 'utf8',
	});
	const imports = result.stdout.trim();
	const violations: { file: string; line: string; newLine: string }[] = [];

	let match;
	while ((match = MATCH_REGEX.exec(imports))) {
		const [, file, line] = match;
		const newLine = line?.replace(/'\.\.\/([^/]+)\/index\.js/, "'@cxl/$1");
		if (file && line && newLine && newLine !== line) {
			violations.push({ file, line, newLine });
			const contents = await fs.readFile(file, 'utf8');
			await fs.writeFile(file, contents.replace(line, newLine));
		}
	}

	return {
		id: 'imports',
		project: name,
		rules: [rule(violations.length === 0, 'Should not have local imports')],
		async fix() {
			for (const v of violations) {
				const contents = await fs.readFile(v.file, 'utf8');
				await fs.writeFile(v.file, contents.replace(v.line, v.newLine));
			}
		},
	};
}

const linters: Linter[] = [
	lintPackage,
	lintTest,
	lintDependencies,
	lintTsconfig,
	lintImports,
];

async function verifyProject(rootPkg: Package) {
	const projectPath = baseDir;
	const stat = await fs.stat(projectPath);
	const name = path.basename(projectPath);

	if (!stat.isDirectory()) return [];

	const pkg = await readJson<Package | false>(
		path.join(projectPath, 'package.json'),
		false,
	);
	if (!pkg) return [];

	const data: LintData = { projectPath, name, pkg, rootPkg, baseDir };
	const results = (await Promise.all(linters.map(lint => lint(data)))).flat();

	results.forEach(r => (r.data = data));

	return results;
}

export async function audit() {
	function error(project: string, msg: string) {
		console.error(`${project}: ${msg}`);
	}

	const rootPkg = await readJson<Package>('../package.json');
	const results = await verifyProject(rootPkg);

	let hasErrors = false;
	const fixes = [];
	for (const result of results) {
		for (const rule of result.rules) {
			if (!rule.valid) {
				result.hasErrors = hasErrors = true;
				error(result.data?.name || 'root', rule.message);
			}
		}
		if (result.hasErrors && result.fix && result.data) {
			const { data, fix } = result;
			fixes.push(() => {
				console.log(
					`${result.data?.name}: Attempting fix for "${result.id}"`,
				);
				return fix(data);
			});
		}
	}

	for (const fix of fixes) await fix();

	if (hasErrors) throw new Error('Errors detected, check logs for details.');
}
