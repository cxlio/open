import { relative } from 'path';
import { Observable, Subscriber } from '../rx/index.js';
import type {
	BuilderProgram,
	BuildOptions,
	Diagnostic,
	FormatDiagnosticsHost,
	Program,
	ParsedCommandLine,
	InvalidatedProject,
	ParseConfigFileHost,
} from 'typescript';
import * as ts from 'typescript';
import { Output } from './builder.js';

export interface TsconfigJson {
	compilerOptions?: {
		outDir?: string;
	};
	files?: string[];
	include?: string[];
	exclude?: string[];
}

const { readDirectory, getCurrentDirectory, fileExists, readFile } = ts.sys;
const DefaultTsconfig = 'tsconfig.json';

const parseConfigHost: ParseConfigFileHost = {
	useCaseSensitiveFileNames: true,
	readDirectory,
	getCurrentDirectory,
	fileExists,
	readFile,
	onUnRecoverableConfigFileDiagnostic(e) {
		throw e;
	},
};

const diagnosticsHost: FormatDiagnosticsHost = {
	getCurrentDirectory,
	getNewLine: () => '\n',
	getCanonicalFileName: n => n,
};

export const tscVersion = ts.version;

function getErrorProperty(error: object, property: 'message' | 'messageText') {
	if (!(property in error)) return;

	const value = Object.getOwnPropertyDescriptor(error, property)?.value;
	return typeof value === 'string' ? value : undefined;
}

export function buildDiagnostics(program: Program | BuilderProgram) {
	return [
		...program.getConfigFileParsingDiagnostics(),
		...program.getOptionsDiagnostics(),
		...program.getGlobalDiagnostics(),
		...program.getDeclarationDiagnostics(),
	];
}

export function printDiagnostics(
	diagnostics: readonly Diagnostic[],
	host = diagnosticsHost,
) {
	console.error(ts.formatDiagnosticsWithColorAndContext(diagnostics, host));

	throw new Error('Typescript compilation failed');
}

function getBuilder(
	tsconfig = DefaultTsconfig,
	defaultOptions: BuildOptions = { module: ts.ModuleKind.CommonJS },
) {
	const host = ts.createSolutionBuilderHost(ts.sys);
	const options = parseTsConfig(tsconfig);

	if (options.errors.length) {
		printDiagnostics(options.errors);
	}

	const outputDir = options.options.outDir;
	if (!outputDir) throw new Error(`No outDir field set in ${tsconfig}`);

	const builder = ts.createSolutionBuilder(host, [tsconfig], defaultOptions);
	return { outputDir, builder, options };
}

export function tsbuild(
	tsconfig = DefaultTsconfig,
	subs: Subscriber<Output>,
	defaultOptions: BuildOptions = { module: ts.ModuleKind.CommonJS },
) {
	const { outputDir, builder } = getBuilder(tsconfig, defaultOptions);

	let project: InvalidatedProject<BuilderProgram> | undefined;
	let outDir = '';

	function writeFile(name: string, source: string) {
		if (outDir && name.startsWith(outDir)) {
			name = relative(outputDir, name);
			subs.next({ path: name, source: Buffer.from(source) });
		} else {
			console.warn(`File "${name}" is outside of outDir. Ignoring.`);
		}
	}

	while ((project = builder.getNextInvalidatedProject())) {
		if (project.kind === ts.InvalidatedProjectKind.Build) {
			const program = project.getProgram();
			outDir = project.getCompilerOptions().outDir ?? '';
			if (program) {
				const diagnostics = buildDiagnostics(program);
				if (diagnostics.length) printDiagnostics(diagnostics);
			}
		}

		const status = project.done(undefined, writeFile);

		if (status !== ts.ExitStatus.Success)
			throw `${project.project}: Typescript compilation failed`;
	}
}

export function tsconfig(tsconfig = DefaultTsconfig, options?: BuildOptions) {
	return new Observable<Output>(subs => {
		tsbuild(tsconfig, subs, options);
		subs.complete();
	});
}

export function parseTsConfig(tsconfig: string) {
	let parsed: ParsedCommandLine | undefined;
	try {
		parsed = ts.getParsedCommandLineOfConfigFile(
			tsconfig,
			{},
			parseConfigHost,
		);
	} catch (e) {
		if (e instanceof Error) throw e;
		if (!e || typeof e !== 'object') throw new Error('Unknown Error');
		const msg =
			getErrorProperty(e, 'message') ??
			getErrorProperty(e, 'messageText');

		throw new Error(msg ?? 'Unknown Error');
	}

	if (!parsed) {
		console.log(process.cwd());
		throw new Error(`Could not parse config file "${tsconfig}"`);
	}

	return parsed;
}
