import { dirname, join, relative, resolve } from 'path';
import { builtinModules } from 'module';
import { existsSync, readdirSync, readFileSync } from 'fs';
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
import { getPackageName } from './package.js';

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

const builtinPackages = new Set([
	...builtinModules,
	...builtinModules.map(name => `node:${name}`),
]);

function declarationName(name: string) {
	const value = name.replace(/[^A-Za-z0-9_$]/g, '_');
	return /^[A-Za-z_$]/.test(value) ? value : `_${value}`;
}

function workspaceDeclarations(entryFile: string) {
	const outputRoot = resolve(dirname(dirname(entryFile)));
	const sourceRoot = dirname(outputRoot);
	const packages = new Map<string, string>();
	for (const entry of readdirSync(sourceRoot, { withFileTypes: true })) {
		if (!entry.isDirectory()) continue;
		const packageFile = join(sourceRoot, entry.name, 'package.json');
		const declarationDir = join(outputRoot, entry.name);
		if (!existsSync(packageFile) || !existsSync(declarationDir)) continue;
		const value: unknown = JSON.parse(readFileSync(packageFile, 'utf8'));
		if (
			value &&
			typeof value === 'object' &&
			'name' in value &&
			typeof value.name === 'string'
		)
			packages.set(value.name, declarationDir);
	}
	return packages;
}

function projectDeclarations(tsconfig: string) {
	if (!existsSync(tsconfig)) return;
	const outputs = new Map<string, string>();
	const projects = new Map<string, ParsedCommandLine>();
	const load = (configFile: string) => {
		configFile = resolve(configFile);
		if (projects.has(configFile)) return;
		const parsed = parseTsConfig(configFile);
		projects.set(configFile, parsed);
		for (const sourceFile of parsed.fileNames) {
			const declaration = ts
				.getOutputFileNames(
					parsed,
					sourceFile,
					ts.sys.useCaseSensitiveFileNames,
				)
				.find(file => /\.d\.(?:ts|mts|cts)$/.test(file));
			if (declaration) outputs.set(resolve(sourceFile), declaration);
		}
		for (const reference of parsed.projectReferences ?? [])
			load(ts.resolveProjectReferencePath(reference));
	};
	load(tsconfig);
	return { options: projects.get(resolve(tsconfig))?.options, outputs };
}

export function getProjectOutputFiles(tsconfig = DefaultTsconfig) {
	const parsed = parseTsConfig(tsconfig);
	const files = parsed.fileNames.flatMap(sourceFile =>
		ts
			.getOutputFileNames(
				parsed,
				sourceFile,
				ts.sys.useCaseSensitiveFileNames,
			),
	);
	return {
		declarationFiles: files.filter(file =>
			/\.d\.(?:ts|mts|cts)$/.test(file),
		),
		javascriptFiles: files.filter(file => /\.[cm]?js$/.test(file)),
	};
}

function declarationProgram(entryFile: string, tsconfig: string) {
	const workspace = workspaceDeclarations(entryFile);
	const project = projectDeclarations(tsconfig);
	const paths: Record<string, string[]> = {};
	for (const [name, declarationDir] of workspace) {
		paths[name] = [join(declarationDir, 'index.d.ts')];
		paths[`${name}/*`] = [join(declarationDir, '*')];
	}
	const options: ts.CompilerOptions = {
		allowSyntheticDefaultImports:
			project?.options?.allowSyntheticDefaultImports,
		baseUrl: '/',
		esModuleInterop: project?.options?.esModuleInterop,
		module: ts.ModuleKind.ESNext,
		moduleResolution: ts.ModuleResolutionKind.Node10,
		paths,
		skipLibCheck: true,
		target: ts.ScriptTarget.Latest,
	};
	const host = ts.createCompilerHost(options);
	host.resolveModuleNameLiterals = (moduleLiterals, containingFile) =>
		moduleLiterals.map(moduleLiteral => {
			const specifier = moduleLiteral.text;
			const resolved = ts.resolveModuleName(
				specifier,
				containingFile,
				options,
				host,
			).resolvedModule;
			if (resolved) return { resolvedModule: resolved };
			const sourceModule =
				project?.options &&
				ts.resolveModuleName(
					specifier,
					containingFile,
					project.options,
					host,
				).resolvedModule;
			if (sourceModule) {
				const declaration =
					sourceModule.extension === ts.Extension.Dts
						? sourceModule.resolvedFileName
						: project.outputs.get(resolve(sourceModule.resolvedFileName));
				if (declaration && existsSync(declaration))
					return {
						resolvedModule: {
							extension: ts.Extension.Dts,
							isExternalLibraryImport:
								sourceModule.isExternalLibraryImport,
							resolvedFileName: declaration,
						},
					};
			}
			const absolute = resolve(dirname(containingFile), specifier);
			const nodeModulesPath = absolute.split('/node_modules/')[1];
			const workspaceSpecifier = nodeModulesPath ?? specifier;
			const name = getPackageName(workspaceSpecifier);
			if (!name) return { resolvedModule: undefined };
			const declarationDir = workspace.get(name);
			if (!declarationDir) return { resolvedModule: undefined };
			const subpath = workspaceSpecifier
				.slice(name.length)
				.replace(/^\//, '');
			const relativeFile = subpath
				? subpath.replace(/\.js$/, '.d.ts')
				: 'index.d.ts';
			const resolvedFileName = join(declarationDir, relativeFile);
			if (!existsSync(resolvedFileName))
				return { resolvedModule: undefined };
			return {
				resolvedModule: {
					extension: ts.Extension.Dts,
					isExternalLibraryImport: false,
					resolvedFileName,
				},
			};
		});
	return ts.createProgram([entryFile], options, host);
}

function moduleSpecifier(node: ts.Node) {
	if (
		(ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) &&
		node.moduleSpecifier &&
		ts.isStringLiteral(node.moduleSpecifier)
	)
		return node.moduleSpecifier;
}

function sourceFileForModule(
	checker: ts.TypeChecker,
	specifier: ts.StringLiteral,
) {
	const symbol = checker.getSymbolAtLocation(specifier);
	return symbol?.declarations?.find(ts.isSourceFile);
}

function moduleStatement(node: ts.Node) {
	if (ts.isSourceFile(node)) return;
	while (!ts.isSourceFile(node.parent)) node = node.parent;
	return ts.isImportDeclaration(node) || ts.isExportDeclaration(node)
		? node
		: undefined;
}

function topLevelStatement(node: ts.Node) {
	if (ts.isSourceFile(node)) return;
	while (!ts.isSourceFile(node.parent)) node = node.parent;
	return ts.isStatement(node) ? node : undefined;
}

function aliasedSymbol(checker: ts.TypeChecker, symbol: ts.Symbol) {
	const seen = new Set<ts.Symbol>();
	while (symbol.flags & ts.SymbolFlags.Alias) {
		if (seen.has(symbol)) break;
		seen.add(symbol);
		symbol = checker.getAliasedSymbol(symbol);
	}
	return symbol;
}

function topLevelNames(statement: ts.Statement) {
	if (
		(ts.isClassDeclaration(statement) ||
			ts.isInterfaceDeclaration(statement) ||
			ts.isTypeAliasDeclaration(statement) ||
			ts.isFunctionDeclaration(statement) ||
			ts.isEnumDeclaration(statement) ||
			ts.isModuleDeclaration(statement)) &&
		statement.name &&
		ts.isIdentifier(statement.name)
	)
		return [statement.name];
	if (!ts.isVariableStatement(statement)) return [];
	const names: ts.Identifier[] = [];
	const collect = (name: ts.BindingName) => {
		if (ts.isIdentifier(name)) names.push(name);
		else for (const element of name.elements) if (!ts.isOmittedExpression(element)) collect(element.name);
	};
	for (const declaration of statement.declarationList.declarations)
		collect(declaration.name);
	return names;
}

type AmbientStatement =
	| ts.ModuleDeclaration
	| ts.ClassDeclaration
	| ts.FunctionDeclaration
	| ts.EnumDeclaration
	| ts.VariableStatement;

function assignAnonymousSymbols(
	publicExports: { name: string; symbol: ts.Symbol }[],
	symbolNames: Map<ts.Symbol, string>,
	uniqueName: (base: string, fileIndex: number) => string,
) {
	const anonymousSymbols = new Map<ts.Node, ts.Symbol>();
	for (const { name, symbol } of publicExports) {
		if (!symbolNames.has(symbol))
			symbolNames.set(symbol, uniqueName(name, 0));
		for (const declaration of symbol.declarations ?? [])
			if (
				(ts.isClassDeclaration(declaration) ||
					ts.isFunctionDeclaration(declaration)) &&
				!declaration.name
			)
				anonymousSymbols.set(declaration, symbol);
	}
	return anonymousSymbols;
}

interface NamespaceExport {
	name: string;
	members: { name: string; symbol: ts.Symbol }[];
}

function getNamespaceExport(
	checker: ts.TypeChecker,
	exported: ts.Symbol,
): NamespaceExport | undefined {
	if (!exported.declarations?.some(ts.isNamespaceExport)) return;
	const module = aliasedSymbol(checker, exported);
	return {
		name: exported.getName(),
		members: checker.getExportsOfModule(module).map(member => ({
			name: member.getName(),
			symbol: aliasedSymbol(checker, member),
		})),
	};
}

function getNamespaceTypeParameters(symbol: ts.Symbol) {
	return symbol.declarations
		?.map(declaration => {
			if (
				ts.isClassDeclaration(declaration) ||
				ts.isInterfaceDeclaration(declaration) ||
				ts.isTypeAliasDeclaration(declaration) ||
				ts.isFunctionDeclaration(declaration)
			)
				return declaration.typeParameters;
		})
		.find(parameters => parameters !== undefined);
}

function createNamespaceDeclaration(
	checker: ts.TypeChecker,
	namespace: NamespaceExport,
	symbolNames: Map<ts.Symbol, string>,
) {
	const members: ts.Statement[] = [];
	for (const { name, symbol } of namespace.members) {
		const local = symbolNames.get(symbol);
		if (!local)
			throw new Error(
				`Unable to bundle namespace export "${namespace.name}.${name}"`,
			);
		if (symbol.flags & ts.SymbolFlags.Value)
			members.push(
				ts.factory.createVariableStatement(
					[ts.factory.createModifier(ts.SyntaxKind.ExportKeyword)],
					ts.factory.createVariableDeclarationList(
						[
							ts.factory.createVariableDeclaration(
								name,
								undefined,
								ts.factory.createTypeQueryNode(
									ts.factory.createIdentifier(local),
								),
							),
						],
						ts.NodeFlags.Const,
					),
				),
			);
		if (symbol.flags & ts.SymbolFlags.Type) {
			const typeParameters = getNamespaceTypeParameters(symbol)?.map(
				parameter =>
					ts.factory.createTypeParameterDeclaration(
						undefined,
						parameter.name.text,
						parameter.constraint &&
							checker.typeToTypeNode(
								checker.getTypeFromTypeNode(parameter.constraint),
								undefined,
								ts.NodeBuilderFlags.NoTruncation,
							),
						parameter.default &&
							checker.typeToTypeNode(
								checker.getTypeFromTypeNode(parameter.default),
								undefined,
								ts.NodeBuilderFlags.NoTruncation,
							),
					),
			);
			members.push(
				ts.factory.createTypeAliasDeclaration(
					[ts.factory.createModifier(ts.SyntaxKind.ExportKeyword)],
					name,
					typeParameters,
					ts.factory.createTypeReferenceNode(
						local,
						typeParameters?.map(parameter =>
							ts.factory.createTypeReferenceNode(parameter.name),
						),
					),
				),
			);
		}
	}
	return ts.factory.createModuleDeclaration(
		[ts.factory.createModifier(ts.SyntaxKind.DeclareKeyword)],
		ts.factory.createIdentifier(namespace.name),
		ts.factory.createModuleBlock(members),
		ts.NodeFlags.Namespace,
	);
}

export function bundleDeclarations(
	entryFile: string,
	externalPackages: readonly string[],
	tsconfig = DefaultTsconfig,
) {
	const external = new Set(externalPackages);
	const isExternal = (specifier: string) => {
		const name = getPackageName(specifier);
		return builtinPackages.has(specifier) || (!!name && external.has(name));
	};
	const program = declarationProgram(entryFile, tsconfig);
	const checker = program.getTypeChecker();
	const entry = program.getSourceFile(entryFile);
	if (!entry) throw new Error(`Declaration entry not found: ${entryFile}`);

	const files: ts.SourceFile[] = [];
	const includedFiles = new Set<ts.SourceFile>();
	const statements = new Set<ts.Statement>();
	const publicExports: { name: string; symbol: ts.Symbol }[] = [];
	const namespaceExports: NamespaceExport[] = [];
	const entrySymbol = checker.getSymbolAtLocation(entry);
	if (!entrySymbol) {
		if (!entry.statements.length) return 'export {};\n';
		throw new Error(`Declaration entry has no module symbol: ${entryFile}`);
	}
	const includeStatement = (statement: ts.Statement) => {
		if (statements.has(statement)) return false;
		statements.add(statement);
		const sourceFile = statement.getSourceFile();
		if (!includedFiles.has(sourceFile)) {
			includedFiles.add(sourceFile);
			files.push(sourceFile);
		}
		return true;
	};
	const includeSymbol = (symbol: ts.Symbol, crossModule = false) => {
		symbol = aliasedSymbol(checker, symbol);
		for (const declaration of symbol.declarations ?? []) {
			const sourceFile = declaration.getSourceFile();
			if (
				!crossModule &&
				sourceFile.fileName.includes('/node_modules/') &&
				!includedFiles.has(sourceFile)
			)
				continue;
			const statement = topLevelStatement(declaration);
			if (statement && includeStatement(statement))
				ts.forEachChild(statement, includeNode);
		}
	};
	const requireInternalModule = (
		specifier: ts.StringLiteral,
		sourceFile: ts.SourceFile,
	) => {
		if (!sourceFileForModule(checker, specifier))
			throw new Error(
				`Unable to bundle declaration import "${specifier.text}" from ${sourceFile.fileName}`,
			);
	};
	const includeImportType = (node: ts.ImportTypeNode) => {
		if (
			!ts.isLiteralTypeNode(node.argument) ||
			!ts.isStringLiteral(node.argument.literal)
		)
			return false;
		const specifier = node.argument.literal;
		if (isExternal(specifier.text)) return true;
		requireInternalModule(specifier, node.getSourceFile());
		const symbol = node.qualifier && checker.getSymbolAtLocation(node.qualifier);
		if (symbol) includeSymbol(symbol, true);
		for (const argument of node.typeArguments ?? []) includeNode(argument);
		return true;
	};
	const includeQualifiedName = (node: ts.QualifiedName) => {
		let left = node.left;
		while (ts.isQualifiedName(left)) left = left.left;
		const alias = checker.getSymbolAtLocation(left);
		const statement = alias?.declarations
			?.map(moduleStatement)
			.find(value => value);
		const specifier = statement && moduleSpecifier(statement);
		if (!specifier) return false;
		if (isExternal(specifier.text)) {
			includeStatement(statement);
			return true;
		}
		requireInternalModule(specifier, statement.getSourceFile());
		const symbol = checker.getSymbolAtLocation(node.right);
		if (symbol) includeSymbol(symbol, true);
		return true;
	};
	const includeIdentifier = (node: ts.Identifier) => {
		const symbol = checker.getSymbolAtLocation(node);
		if (!symbol) return;
		const statement = symbol.declarations
			?.map(moduleStatement)
			.find(value => value);
		const specifier = statement && moduleSpecifier(statement);
		if (specifier) {
			if (isExternal(specifier.text)) {
				includeStatement(statement);
				return;
			}
			requireInternalModule(specifier, statement.getSourceFile());
		}
		includeSymbol(symbol, !!specifier);
	};
	const includeNode = (node: ts.Node): void => {
		if (ts.isImportTypeNode(node) && includeImportType(node)) return;
		if (ts.isQualifiedName(node) && includeQualifiedName(node)) return;
		if (ts.isIdentifier(node)) includeIdentifier(node);
		ts.forEachChild(node, includeNode);
	};
	for (const exported of checker.getExportsOfModule(entrySymbol)) {
		const name = exported.getName();
		const namespace = getNamespaceExport(checker, exported);
		if (namespace) {
			namespaceExports.push(namespace);
			for (const member of namespace.members)
				includeSymbol(member.symbol, true);
			continue;
		}
		const externalExport = exported.declarations
			?.map(moduleStatement)
			.find(statement => {
				const specifier = statement && moduleSpecifier(statement);
				return specifier && isExternal(specifier.text);
			});
		if (externalExport) {
			includeStatement(externalExport);
			continue;
		}
		const symbol = aliasedSymbol(checker, exported);
		publicExports.push({ name, symbol });
		includeSymbol(symbol, true);
	}

	const symbolNames = new Map<ts.Symbol, string>();
	const aliasNames = new Map<ts.Symbol, string>();
	const usedNames = new Set(namespaceExports.map(({ name }) => name));
	for (const { name, symbol } of publicExports) {
		if (
			name !== 'default' &&
			!symbolNames.has(symbol) &&
			!usedNames.has(name)
		) {
			symbolNames.set(symbol, name);
			usedNames.add(name);
		}
	}

	const uniqueName = (base: string, fileIndex: number) => {
		const prefix = `__dts_${fileIndex}_${declarationName(base)}`;
		let name = prefix;
		let suffix = 2;
		while (usedNames.has(name)) name = `${prefix}_${suffix++}`;
		usedNames.add(name);
		return name;
	};
	const anonymousSymbols = assignAnonymousSymbols(
		publicExports,
		symbolNames,
		uniqueName,
	);
	files.forEach((sourceFile, fileIndex) => {
		for (const statement of sourceFile.statements) {
			if (!statements.has(statement)) continue;
			for (const name of topLevelNames(statement)) {
				const symbol = checker.getSymbolAtLocation(name);
				if (symbol && !symbolNames.has(symbol))
					symbolNames.set(symbol, uniqueName(symbol.getName(), fileIndex));
			}
			if (!ts.isImportDeclaration(statement) || !statement.importClause)
				continue;
			const specifier = statement.moduleSpecifier;
			if (!ts.isStringLiteral(specifier) || !isExternal(specifier.text))
				continue;
			const names: ts.Identifier[] = [];
			if (statement.importClause.name) names.push(statement.importClause.name);
			const bindings = statement.importClause.namedBindings;
			if (bindings) {
				if (ts.isNamespaceImport(bindings)) names.push(bindings.name);
				else for (const element of bindings.elements) names.push(element.name);
			}
			for (const name of names) {
				const symbol = checker.getSymbolAtLocation(name);
				if (symbol)
					aliasNames.set(symbol, uniqueName(symbol.getName(), fileIndex));
			}
		}
	});

	const transformer: ts.TransformerFactory<ts.SourceFile> = context => {
		const transformModuleDeclaration = (node: ts.ModuleDeclaration) => {
			if (
				ts.isIdentifier(node.name) &&
				node.name.text === 'global'
			)
				return ts.factory.updateModuleDeclaration(
					node,
					node.modifiers,
					node.name,
					node.body &&
						ts.visitNode(node.body, visitor, ts.isModuleBody),
				);
			if (!ts.isStringLiteral(node.name) || isExternal(node.name.text))
				return;
			const symbol = checker.getSymbolAtLocation(node.name);
			const name =
				symbol && symbolNames.get(aliasedSymbol(checker, symbol));
			const body =
				node.body && ts.visitNode(node.body, visitor, ts.isModuleBody);
			if (name)
				return ts.factory.updateModuleDeclaration(
					node,
					[ts.factory.createModifier(ts.SyntaxKind.DeclareKeyword)],
					ts.factory.createIdentifier(name),
					body,
				);
			return body && ts.isModuleBlock(body) ? [...body.statements] : [];
		};
		const nameAnonymousDeclaration = (
			node: ts.ClassDeclaration | ts.FunctionDeclaration,
		) => {
			const symbol = anonymousSymbols.get(node);
			const name = symbol && symbolNames.get(symbol);
			if (!name) return node;
			if (ts.isClassDeclaration(node))
				return ts.factory.updateClassDeclaration(
					node,
					node.modifiers,
					ts.factory.createIdentifier(name),
					node.typeParameters,
					node.heritageClauses,
					node.members,
				);
			return ts.factory.updateFunctionDeclaration(
				node,
				node.modifiers,
				node.asteriskToken,
				ts.factory.createIdentifier(name),
				node.typeParameters,
				node.parameters,
				node.type,
				node.body,
			);
		};
		const ambientModifiers = (node: AmbientStatement) => {
			const modifiers = node.modifiers?.filter(
				modifier =>
					modifier.kind !== ts.SyntaxKind.ExportKeyword &&
					modifier.kind !== ts.SyntaxKind.DefaultKeyword,
			);
			return [
					...(modifiers ?? []),
					ts.factory.createModifier(ts.SyntaxKind.DeclareKeyword),
				];
		};
		const ambientDeclaration = (node: AmbientStatement) => {
			const modifiers = ambientModifiers(node);
			if (ts.isModuleDeclaration(node))
				return ts.factory.updateModuleDeclaration(
					node,
					modifiers,
					node.name,
					node.body,
				);
			if (ts.isClassDeclaration(node))
				return ts.factory.updateClassDeclaration(
					node,
					modifiers,
					node.name,
					node.typeParameters,
					node.heritageClauses,
					node.members,
				);
			if (ts.isFunctionDeclaration(node))
				return ts.factory.updateFunctionDeclaration(
					node,
					modifiers,
					node.asteriskToken,
					node.name,
					node.typeParameters,
					node.parameters,
					node.type,
					node.body,
				);
			if (ts.isEnumDeclaration(node))
				return ts.factory.updateEnumDeclaration(
					node,
					modifiers,
					node.name,
					node.members,
				);
			return ts.factory.updateVariableStatement(
				node,
				modifiers,
				node.declarationList,
			);
		};
		const transformImportSpecifier = (node: ts.ImportSpecifier) => {
			const symbol = checker.getSymbolAtLocation(node.name);
			const name = symbol && aliasNames.get(symbol);
			return name
				? ts.factory.createImportSpecifier(
						node.isTypeOnly,
						node.propertyName ?? node.name,
						ts.factory.createIdentifier(name),
					)
				: node;
		};
		const shouldRemove = (node: ts.Node) => {
			if (ts.isExportAssignment(node)) return true;
			if (ts.isExportDeclaration(node) && !node.moduleSpecifier) return true;
			if (
				(ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) &&
				node.moduleSpecifier &&
				ts.isStringLiteral(node.moduleSpecifier)
			)
				return !isExternal(node.moduleSpecifier.text);
			return (
				node.kind === ts.SyntaxKind.ExportKeyword ||
				node.kind === ts.SyntaxKind.DefaultKeyword
			);
		};
		const renameIdentifier = (node: ts.Identifier) => {
			const symbol = checker.getSymbolAtLocation(node);
			const name =
				symbol &&
				(aliasNames.get(symbol) ??
					symbolNames.get(aliasedSymbol(checker, symbol)));
			return name && name !== node.text
				? ts.factory.createIdentifier(name)
				: node;
		};
		const isAmbientStatement = (node: ts.Node): node is AmbientStatement =>
			ts.isModuleDeclaration(node) ||
			ts.isClassDeclaration(node) ||
			ts.isFunctionDeclaration(node) ||
			ts.isEnumDeclaration(node) ||
			ts.isVariableStatement(node);
		const transformQualifiedName = (node: ts.QualifiedName) => {
			let left = node.left;
			while (ts.isQualifiedName(left)) left = left.left;
			const alias = checker.getSymbolAtLocation(left);
			const statement = alias?.declarations
				?.map(moduleStatement)
				.find(value => value);
			const specifier = statement && moduleSpecifier(statement);
			if (!specifier || isExternal(specifier.text)) return;
			const symbol = checker.getSymbolAtLocation(node.right);
			const name =
				symbol && symbolNames.get(aliasedSymbol(checker, symbol));
			return name ? ts.factory.createIdentifier(name) : undefined;
		};
		const transformPropertyAccess = (node: ts.PropertyAccessExpression) => {
			let expression = node.expression;
			while (ts.isPropertyAccessExpression(expression))
				expression = expression.expression;
			if (!ts.isIdentifier(expression)) return;
			const alias = checker.getSymbolAtLocation(expression);
			const statement = alias?.declarations
				?.map(moduleStatement)
				.find(value => value);
			const specifier = statement && moduleSpecifier(statement);
			if (!specifier || isExternal(specifier.text)) return;
			const symbol = checker.getSymbolAtLocation(node.name);
			const name =
				symbol && symbolNames.get(aliasedSymbol(checker, symbol));
			return name ? ts.factory.createIdentifier(name) : undefined;
		};
		const transformImportType = (node: ts.ImportTypeNode) => {
			if (
				!ts.isLiteralTypeNode(node.argument) ||
				!ts.isStringLiteral(node.argument.literal) ||
				isExternal(node.argument.literal.text) ||
				!node.qualifier
			)
				return;
			const symbol = checker.getSymbolAtLocation(node.qualifier);
			const name = symbol && symbolNames.get(aliasedSymbol(checker, symbol));
			return name
				? ts.factory.createTypeReferenceNode(
						name,
						node.typeArguments &&
							ts.visitNodes(node.typeArguments, visitor, ts.isTypeNode),
					)
				: undefined;
		};
		const visitor: ts.Visitor = node => {
			if (ts.isModuleDeclaration(node)) {
				const transformed = transformModuleDeclaration(node);
				if (transformed) return transformed;
			}
			if (shouldRemove(node)) return undefined;
			if (
				(ts.isClassDeclaration(node) || ts.isFunctionDeclaration(node)) &&
				!node.name &&
				anonymousSymbols.has(node)
			)
				return ts.visitEachChild(
					ambientDeclaration(nameAnonymousDeclaration(node)),
					visitor,
					context,
				);
			if (
				isAmbientStatement(node) &&
				ts.isSourceFile(node.parent) &&
				!node.modifiers?.some(
					modifier => modifier.kind === ts.SyntaxKind.DeclareKeyword,
				)
			)
				return ts.visitEachChild(ambientDeclaration(node), visitor, context);
			if (ts.isImportSpecifier(node)) return transformImportSpecifier(node);
			if (ts.isQualifiedName(node))
				return transformQualifiedName(node) ??
					ts.visitEachChild(node, visitor, context);
			if (ts.isPropertyAccessExpression(node))
				return transformPropertyAccess(node) ??
					ts.visitEachChild(node, visitor, context);
			if (ts.isImportTypeNode(node))
				return transformImportType(node) ??
					ts.visitEachChild(node, visitor, context);
			if (ts.isIdentifier(node)) return renameIdentifier(node);
			return ts.visitEachChild(node, visitor, context);
		};
		return sourceFile => ts.visitEachChild(sourceFile, visitor, context);
	};
	const printer = ts.createPrinter({ newLine: ts.NewLineKind.LineFeed });
	const chunks: string[] = [];
	for (const sourceFile of files) {
		const selected = ts.factory.updateSourceFile(
			sourceFile,
			sourceFile.statements.filter(statement => statements.has(statement)),
		);
		const result = ts.transform(selected, [transformer]);
		const transformed = result.transformed[0];
		if (transformed) {
			for (const statement of transformed.statements)
				chunks.push(printer.printNode(ts.EmitHint.Unspecified, statement, transformed));
		}
		result.dispose();
	}
	for (const namespace of namespaceExports)
		chunks.push(
			printer.printNode(
				ts.EmitHint.Unspecified,
				createNamespaceDeclaration(checker, namespace, symbolNames),
				entry,
			),
		);
	const exports = publicExports.map(({ name, symbol }) => {
		const local = symbolNames.get(symbol);
		if (!local) throw new Error(`Unable to bundle declaration export "${name}"`);
		return ts.factory.createExportSpecifier(false, local === name ? undefined : local, name);
	});
	for (const { name } of namespaceExports)
		exports.push(
			ts.factory.createExportSpecifier(
				false,
				undefined,
				ts.factory.createIdentifier(name),
			),
		);
	if (exports.length)
		chunks.push(
			printer.printNode(
				ts.EmitHint.Unspecified,
				ts.factory.createExportDeclaration(
					undefined,
					false,
					ts.factory.createNamedExports(exports),
				),
				entry,
			),
		);
	else if (!chunks.length)
		chunks.push(
			printer.printNode(
				ts.EmitHint.Unspecified,
				ts.factory.createExportDeclaration(
					undefined,
					false,
					ts.factory.createNamedExports([]),
				),
				entry,
			),
		);
	return chunks.join('\n') + '\n';
}
