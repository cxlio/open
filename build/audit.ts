import * as path from 'path';
import { promises as fs } from 'fs';
import * as cp from 'child_process';
import * as esbuild from 'esbuild-wasm';
import * as ts from 'typescript';
import { readJson } from '../program/index.js';
import {
	getPackageEntryPoints,
	getPackageExternal,
	getPackageName,
	getPackagePlatform,
} from './package.js';
import { buildOutputOptions } from './builder.js';
import { getPackageBuildOptions } from './npm.js';
import { getProjectOutputFiles } from './tsc.js';

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
	compilerOptions?: Record<string, unknown> & { outDir?: string };
	files?: string[];
	include?: string[];
	exclude?: string[];
}

type Fixer = (data: LintData) => Promise<void>;
type Linter = (data: LintData) => Promise<LinterResult>;

const BugsUrl = 'https://github.com/cxlio/cxl/issues';
const TsconfigJson = 'tsconfig.json';
const TsconfigTestJson = 'tsconfig.test.json';
const LocalTsconfigJson = './tsconfig.json';
const RootTsconfigJson = '../tsconfig.json';
export const requiredRootCompilerOptions = {
	incremental: true,
	strict: true,
	module: 'nodenext',
	moduleResolution: 'nodenext',
	verbatimModuleSyntax: true,
	isolatedModules: true,
	noUnusedLocals: true,
	noUnusedParameters: true,
	noUncheckedIndexedAccess: true,
	noUncheckedSideEffectImports: true,
	composite: true,
	types: [],
} as const;
const inheritedPackageCompilerOptions = Object.keys(
	requiredRootCompilerOptions,
).filter(name => name !== 'types');
const TestScript = 'npm run build -- test';
const baseDir = path.resolve('.');
const requiredPackageFields: (keyof Package)[] = [
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
	const tsconfigPath = path.join(projectPath, TsconfigJson);
	let tsconfig = await readJson<Tsconfig | false>(
		tsconfigPath,
		false,
	);
	const oldTsconfig = tsconfig
		? JSON.stringify(tsconfig, null, '\t')
		: undefined;

	if (!tsconfig) {
		tsconfig = {
			extends: RootTsconfigJson,
			compilerOptions: {
				outDir: `../dist/${name}`,
			},
			files: [],
			references: [],
		};
	}
	tsconfig.extends = RootTsconfigJson;
	tsconfig.compilerOptions ??= {};
	tsconfig.compilerOptions.outDir = `../dist/${name}`;
	for (const option of inheritedPackageCompilerOptions)
		delete tsconfig.compilerOptions[option];

	const newTsconfig = JSON.stringify(tsconfig, null, '\t');
	if (oldTsconfig !== newTsconfig)
		await fs.writeFile(tsconfigPath, newTsconfig);
}

async function fixTest({ projectPath, name }: LintData) {
	const tsconfigPath = path.join(projectPath, TsconfigTestJson);
	let hasChanged = false;

	if (!(await exists(tsconfigPath))) {
		await fs.writeFile(
			tsconfigPath,
			`{
	"extends": "${LocalTsconfigJson}",
	"include": ["test.ts"],
	"references": [{ "path": "." }, { "path": "../spec" }]
}
`,
		);
	}

	const testPath = path.join(projectPath, 'test.ts');
	const tsconfig =
		(await readJson<Tsconfig | null>(tsconfigPath, null)) ?? {};

	if (!tsconfig.extends || tsconfig.extends !== LocalTsconfigJson) {
		tsconfig.extends = LocalTsconfigJson;
		hasChanged = true;
	}
	if (tsconfig.compilerOptions) {
		delete tsconfig.compilerOptions;
		hasChanged = true;
	}

	if (hasChanged) {
		await fs.writeFile(
			tsconfigPath,
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

async function collectUsedPackages(pkg: Package, projectPath: string) {
	const used = new Set<string>();
	const tsconfig = await readJson<Tsconfig | null>(
		path.join(projectPath, 'tsconfig.json'),
		null,
	);
	const outputDir = tsconfig?.compilerOptions?.outDir;
	const external = getPackageExternal(pkg);

	if (!outputDir || !external.length) return used;

	const result = await esbuild.build({
		bundle: true,
		entryPoints: getPackageEntryPoints(
			outputDir,
			pkg,
			getProjectOutputFiles(path.join(projectPath, 'tsconfig.json'))
				.javascriptFiles,
		),
		external,
		format: 'esm',
		logLevel: 'silent',
		metafile: true,
		outdir: path.join(outputDir, 'package'),
		platform: getPackagePlatform(pkg),
		write: false,
	});

	const outputs = result.metafile.outputs;

	for (const output of Object.values(outputs)) {
		for (const item of output.imports) {
			if (!item.external) continue;

			const packageName = getPackageName(item.path);
			if (packageName) used.add(packageName);
		}
	}

	return used;
}

function collectSourceUsedPackages(
	sourceFile: ts.SourceFile,
	functions: Set<string>,
	used: Set<string>,
) {
	function addSpecifier(specifier: ts.Expression) {
		if (ts.isStringLiteral(specifier)) {
			const packageName = getPackageName(specifier.text);
			if (packageName) used.add(packageName);
		}
	}

	function visit(node: ts.Node) {
		if (
			(ts.isImportDeclaration(node) ||
				ts.isExportDeclaration(node)) &&
			node.moduleSpecifier
		) {
			addSpecifier(node.moduleSpecifier);
		}

		if (
			ts.isCallExpression(node) &&
			ts.isIdentifier(node.expression) &&
			functions.has(node.expression.text)
		) {
			const specifier = node.arguments[0];
			if (specifier) addSpecifier(specifier);
		}

		ts.forEachChild(node, visit);
	}

	visit(sourceFile);
}

async function collectConfiguredUsedPackages(
	rootPkg: Package,
	pkg: Package,
	projectPath: string,
	used: Set<string>,
) {
	const build = getPackageBuildOptions(rootPkg, pkg);
	const functions = new Set(build.dependencyUsageFunctions);
	const tsconfigs = build.tsconfigs;
	if (!functions.size || !tsconfigs?.length) return;

	for (const tsconfig of tsconfigs) {
		const configPath = path.join(projectPath, tsconfig);
		if (!(await exists(configPath))) continue;

		const config = ts.readConfigFile(
			configPath,
			ts.sys.readFile.bind(ts.sys),
		);
		if (config.error) continue;

		const parsed = ts.parseJsonConfigFileContent(
			config.config,
			ts.sys,
			projectPath,
		);

		for (const fileName of parsed.fileNames) {
			const source = await fs.readFile(fileName, 'utf8');
			collectSourceUsedPackages(
				ts.createSourceFile(
					fileName,
					source,
					ts.ScriptTarget.Latest,
					true,
				),
				functions,
				used,
			);
		}
	}
}

function fixPackageScripts(pkg: Package, builder: string) {
	pkg.scripts ??= {};
	if (!pkg.scripts.test) pkg.scripts.test = TestScript;
	if (!pkg.scripts.build) pkg.scripts.build = builder;
	for (const script in pkg.scripts) {
		if (!requiredPackageScripts.includes(script)) delete pkg.scripts[script];
	}
	if (pkg.scripts.test !== TestScript) pkg.scripts.test = TestScript;
}

async function fixPackage({ projectPath, name, rootPkg }: LintData) {
	const pkgPath = `${projectPath}/package.json`;
	const pkg = await readJson<Package>(pkgPath);
	const oldPackage = JSON.stringify(pkg, null, '\t');
	const builder = rootPkg.devDependencies?.['@cxl/build']
		? 'cxl-build'
		: 'node ../dist/build';
	const browser = './index.bundle.js';
	const homepage =
		rootPkg.homepage && new URL(pkg.name, rootPkg.homepage).href;

	fixPackageScripts(pkg, builder);
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

	const newPackage = JSON.stringify(pkg, null, '\t');

	if (oldPackage !== newPackage) await fs.writeFile(pkgPath, newPackage);
}

function lintPackage({ pkg, name, rootPkg }: LintData) {
	const rules = requiredPackageFields.map(field =>
		rule(pkg[field] !== undefined, `Field "${field}" required in package.json`),
	);

	const browser = './index.bundle.js';

	rules.push(
		rule(pkg.scripts !== undefined, `Field "scripts" required in package.json`),
	);

	if (pkg.scripts) {
		const scripts = pkg.scripts;
		rules.push(
			...requiredPackageScripts.map(field =>
				rule(
					scripts[field] !== undefined,
					`Script "${field}" required in package.json`,
				),
			),
			rule(
				Object.keys(scripts).every(script =>
					requiredPackageScripts.includes(script),
				),
				'Only "build" and "test" scripts allowed in package.json',
			),
		);
	}

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
			pkg.scripts?.test === TestScript,
			`Valid test script in package.json`,
		),
		rule(!!pkg.repository, 'Package "repository" field must be set'),
		rule(
			typeof pkg.repository !== 'string',
			'"repository" must be an object',
		),
		rule(pkg.type === 'module', 'Package "type" must be "module".'),
	);

	return Promise.resolve({
		id: 'package',
		project: name,
		fix: fixPackage,
		rules,
	});
}

async function lintTest({ projectPath }: LintData) {
	const tsconfigPath = path.join(projectPath, TsconfigTestJson);
	const tsconfig = await readJson<Tsconfig>(tsconfigPath);

	return {
		id: 'test',
		fix: fixTest,
		project: projectPath,
		rules: [
			rule(
				!!(await exists(tsconfigPath)),
				`Missing "tsconfig.test.json" file.`,
			),
			rule(
				tsconfig.extends === LocalTsconfigJson,
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

async function lintDependencies({ name, rootPkg, pkg, projectPath }: LintData) {
	const rules = [];
	const usedPackages = await collectUsedPackages(pkg, projectPath);
	await collectConfiguredUsedPackages(
		rootPkg,
		pkg,
		projectPath,
		usedPackages,
	);

	for (const name in pkg.dependencies) {
		const pkgValue = pkg.dependencies[name];
		const rootValue =
			rootPkg.devDependencies?.[name] || rootPkg.dependencies?.[name];

		rules.push(
			rule(
				usedPackages.has(name),
				`Dependency "${name}" must be used by project source`,
			),
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
		path.join(projectPath, TsconfigJson),
		null,
	);
	const rules = [
		rule(!!tsconfig, 'tsconfig.json should be present'),
		rule(
			tsconfig?.extends === RootTsconfigJson,
			'tsconfig.json should extend "../tsconfig.json"',
		),
		rule(
			!!tsconfig?.compilerOptions,
			'tsconfig.json should have compilerOptions',
		),
		rule(
			tsconfig?.compilerOptions?.outDir === `../dist/${name}`,
			'tsconfig.json should have a valid outDir compiler option',
		),
		...inheritedPackageCompilerOptions.map(option =>
			rule(
				!Object.hasOwn(tsconfig?.compilerOptions ?? {}, option),
				`tsconfig.json should inherit compilerOptions.${option}`,
			),
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

async function fixRootTsconfig({ projectPath }: LintData) {
	const rootDir = path.dirname(projectPath);
	const rootTsconfigPath = path.join(rootDir, TsconfigJson);
	const rootTsconfig = await readJson<Tsconfig | null>(rootTsconfigPath, null);
	const fixedRootTsconfig = rootTsconfig ?? {};
	const oldRootTsconfig = JSON.stringify(fixedRootTsconfig, null, '\t');

	fixedRootTsconfig.compilerOptions = {
		...fixedRootTsconfig.compilerOptions,
		...requiredRootCompilerOptions,
	};
	delete fixedRootTsconfig.extends;

	const newRootTsconfig = JSON.stringify(fixedRootTsconfig, null, '\t');
	if (oldRootTsconfig !== newRootTsconfig)
		await fs.writeFile(rootTsconfigPath, newRootTsconfig);
}

async function lintRootTsconfig({ projectPath }: LintData) {
	const rootDir = path.dirname(projectPath);
	const tsconfig = await readJson<Tsconfig | null>(
		path.join(rootDir, TsconfigJson),
		null,
	);
	const optionRules = tsconfig
		? Object.entries(requiredRootCompilerOptions).map(([name, expected]) =>
				rule(
					JSON.stringify(tsconfig.compilerOptions?.[name]) ===
						JSON.stringify(expected),
					`Root tsconfig.json compilerOptions.${name} must be ${JSON.stringify(expected)}.`,
				),
			)
		: [];

	return {
		id: 'root-tsconfig',
		project: 'root',
		fix: fixRootTsconfig,
		rules: [
			rule(!!tsconfig, 'Missing root "tsconfig.json" file.'),
			rule(
				tsconfig?.extends === undefined,
				'Root tsconfig.json should not extend another configuration.',
			),
			...optionRules,
		],
	};
}

async function lintImports({ name }: LintData) {
	const result = cp.spawnSync('/usr/bin/git', ['grep', `"from '\\.\\.\\/"`, name], {
		encoding: 'utf8',
	});
	const imports = result.stdout.trim();
	const violations: { file: string; line: string; newLine: string }[] = [];

	for (const importLine of imports.split('\n')) {
		const separator = importLine.indexOf(':');
		if (separator < 0) continue;

		const file = importLine.slice(0, separator);
		const line = importLine.slice(separator + 1);
		const newLine = line.replace(/'\.\.\/([^/]+)\/index\.js/, "'@cxl/$1");
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
	lintRootTsconfig,
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
	const { verbose } = buildOutputOptions();

	function error(project: string, msg: string) {
		console.error(`${project}: ${msg}`);
	}

	function reportErrors(results: LinterResult[]) {
		for (const result of results) {
			for (const rule of result.rules) {
				if (!rule.valid) error(result.data?.name || 'root', rule.message);
			}
		}
	}

	async function validate() {
		const rootPkg = await readJson<Package>('../package.json');
		const results = await verifyProject(rootPkg);

		let hasErrors = false;
		const fixes = [];
		for (const result of results) {
			for (const rule of result.rules) {
				if (!rule.valid) {
					result.hasErrors = hasErrors = true;
				}
			}
			if (result.hasErrors && result.fix && result.data) {
				const { data, fix } = result;
				fixes.push({
					id: `${data.name}/${result.id}`,
					rules: result.rules.filter(rule => !rule.valid),
					run: () => {
						if (verbose)
							console.log(
								`${result.data?.name}: Attempting fix for "${result.id}"`,
							);
						return fix(data);
					},
				});
			}
		}

		return { fixes, hasErrors, results };
	}

	let validation = await validate();
	let appliedFixes: { id: string; rules: Rule[] }[] = [];
	// Run again after fixes have been applied.
	if (validation.hasErrors && validation.fixes.length) {
		appliedFixes = validation.fixes;
		for (const fix of validation.fixes) await fix.run();
		validation = await validate();
	}

	if (validation.hasErrors) {
		reportErrors(validation.results);
		throw new Error('Errors detected, check logs for details.');
	}

	if (!verbose && appliedFixes.length) {
		console.log(`audit fixed: ${appliedFixes.map(fix => fix.id).join(',')}`);
		for (const fix of appliedFixes) {
			for (const rule of fix.rules)
				console.log(`${fix.id}: fixed: ${rule.message}`);
		}
	}
}
