import { execFileSync } from 'node:child_process';
import { copyFile, mkdir, readFile, readdir, realpath, rm } from 'node:fs/promises';
import { basename, dirname, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import * as ts from 'typescript';
import { cachedBuild } from './cache.ts';

const root = resolve('..');
const outputDir = resolve(root, 'dist');
const compilerManifest = resolve(outputDir, '.bootstrap-cache/compiler.json');
const nodeModules = await realpath(resolve(root, 'node_modules'));
const inputs = new Set<string>([
	import.meta.filename,
	resolve(root, 'package.json'),
	resolve(root, 'package-lock.json'),
	resolve(root, 'node_modules/.package-lock.json'),
	resolve(root, 'node_modules/@typescript/native/package.json'),
]);
const outputs = new Set<string>();
const buildInfoFiles: string[] = [];
const projects = new Set<string>();
const configFiles = new Set<string>();
const host: ts.ParseConfigFileHost = {
	...ts.sys,
	getCurrentDirectory: () => root,
	readFile(path) {
		inputs.add(resolve(path));
		configFiles.add(resolve(path));
		return ts.sys.readFile(path);
	},
	onUnRecoverableConfigFileDiagnostic(diagnostic) {
		throw new Error(ts.flattenDiagnosticMessageText(diagnostic.messageText, '\n'));
	},
};

function dependencyInputs(files: readonly string[]) {
	const dependencies = new Set(files);
	for (const file of files) {
		let directory = dirname(file);
		while (directory !== dirname(directory)) {
			dependencies.add(resolve(directory, 'package.json'));
			directory = dirname(directory);
		}
	}
	return [...dependencies];
}

function loadProject(path: string) {
	path = resolve(path);
	if (projects.has(path)) return;
	projects.add(path);
	const parsed = ts.getParsedCommandLineOfConfigFile(path, {}, host);
	if (!parsed) throw new Error(`Could not parse config file "${path}"`);
	if (parsed.errors.length)
		throw new Error(ts.formatDiagnostics(parsed.errors, {
			getCurrentDirectory: () => root,
			getCanonicalFileName: name => name,
			getNewLine: () => '\n',
		}));
	for (const source of parsed.fileNames) {
		inputs.add(source);
		for (const output of ts.getOutputFileNames(parsed, source, !ts.sys.useCaseSensitiveFileNames))
			outputs.add(output);
	}
	const buildInfo = ts.getTsBuildInfoEmitOutputFilePath(parsed.options);
	if (buildInfo) {
		outputs.add(buildInfo);
		buildInfoFiles.push(buildInfo);
	}
	for (const reference of parsed.projectReferences ?? [])
		loadProject(ts.resolveProjectReferencePath(reference));
}

loadProject(resolve(root, 'build/tsconfig.json'));
await cachedBuild({
	manifest: compilerManifest,
	inputs: [...inputs],
	key: JSON.stringify({ node: process.version, nodeModules, typescript: ts.version, force: true }),
	outputDir,
}, async () => {
	await rm(compilerManifest, { force: true });
	execFileSync(resolve(root, 'node_modules/@typescript/native/bin/tsc'), ['-b', '--force'], {
		cwd: resolve(root, 'build'),
		stdio: 'inherit',
	});
	const dependencies = await Promise.all(buildInfoFiles.map(async path => {
		const info: { fileNames: string[] } = JSON.parse(await readFile(path, 'utf8'));
		return info.fileNames.map(file => /^lib\.[^/]+\.d\.ts$/.test(file)
			? resolve(nodeModules, 'typescript/lib', file)
			: resolve(dirname(path), file))
			.filter(file => !outputs.has(file));
	}));
	return { inputs: dependencyInputs(dependencies.flat()), outputs: [...outputs] };
});

await cachedBuild({
	manifest: resolve(outputDir, '.bootstrap-cache/browser.json'),
	inputs: [
		...configFiles,
		import.meta.filename,
		resolve(root, 'spec-browser/index.ts'),
		resolve(root, 'tsconfig.json'),
		resolve(root, 'spec-browser/tsconfig.json'),
		resolve(root, 'package.json'),
		resolve(root, 'package-lock.json'),
		resolve(root, 'node_modules/.package-lock.json'),
		resolve(root, 'node_modules/esbuild-wasm/package.json'),
	],
	key: JSON.stringify({ node: process.version, nodeModules, bundle: true, format: 'esm', platform: 'browser' }),
	outputDir,
}, async () => {
	const { build } = await import('esbuild-wasm');
	const result = await build({
		absWorkingDir: root,
		entryPoints: ['spec-browser/index.ts'],
		bundle: true,
		format: 'esm',
		platform: 'browser',
		metafile: true,
		outfile: resolve(outputDir, 'build/spec-browser.js'),
	});
	return {
		inputs: dependencyInputs(Object.keys(result.metafile.inputs).map(path => resolve(root, path))),
		outputs: Object.keys(result.metafile.outputs).map(path => resolve(root, path)),
	};
});

async function copyIfChanged(destination: string, sources: readonly string[]) {
	await Promise.all(sources.map(async source => {
		const target = resolve(destination, basename(source));
		const [content, previous] = await Promise.all([
			readFile(source),
			readFile(target).catch(() => undefined),
		]);
		if (!previous || !content.equals(previous)) await copyFile(source, target);
	}));
}

const buildDir = resolve(outputDir, 'build');
const packageDir = resolve(buildDir, 'package');
const licenses = (await readdir(resolve(root, 'build')))
	.filter(file => file.startsWith('license-'))
	.map(file => resolve(root, 'build', file));
if (!licenses.length) throw new Error('Missing license files');
await copyIfChanged(buildDir, licenses);
await mkdir(packageDir, { recursive: true });
process.argv[1] = resolve(buildDir, 'cli');
const { runCli }: { runCli(): Promise<void> } = await import(pathToFileURL(resolve(buildDir, 'cli.js')).href);
await runCli();
const configs = (await readdir(buildDir))
	.filter(file => file.startsWith('eslint-config') && file.endsWith('.js'))
	.map(file => resolve(buildDir, file));
if (!configs.length) throw new Error('Missing ESLint config files');
await copyIfChanged(packageDir, [
	...licenses,
	...configs,
	resolve(buildDir, 'spec-browser.js'),
	resolve(root, 'node_modules/@cxl/3doc/3doc.js'),
]);
