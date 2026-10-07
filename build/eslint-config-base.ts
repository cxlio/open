import js from '@eslint/js';
import { defineConfig } from 'eslint/config';
import ts from 'typescript-eslint';
import { existsSync, readFileSync } from 'fs';
import { dirname, isAbsolute, join, relative, resolve, sep } from 'path';
import type { Linter, Rule } from 'eslint';
import * as typescript from 'typescript';

type AncestorNode = ReturnType<
	Rule.RuleContext['sourceCode']['getAncestors']
>[number];

type ParserServices = {
	program: typescript.Program;
	esTreeNodeToTSNodeMap: {
		get(node: AncestorNode | Rule.Node): typescript.Node | undefined;
	};
};

function isFunction(node: AncestorNode | undefined) {
	return (
		node?.type === 'ArrowFunctionExpression' ||
		node?.type === 'FunctionExpression' ||
		node?.type === 'FunctionDeclaration'
	);
}

function enclosingFunction(ancestors: readonly AncestorNode[]) {
	for (let i = ancestors.length - 1; i >= 0; i--) {
		const node = ancestors[i];
		if (isFunction(node)) return node;
	}
}

function isSpecTestFunction(type: typescript.Type | undefined) {
	const symbol = type?.aliasSymbol;
	return isSpecSymbol(symbol, 'TestFn');
}

function isSpecSymbol(
	symbol: typescript.Symbol | undefined,
	name: string,
) {
	if (symbol?.getName() !== name) return false;
	return symbol.declarations?.some(declaration => {
		const file = declaration.getSourceFile().fileName.replace(/\\/g, '/');
		return (
			file.includes('/node_modules/@cxl/spec/') ||
			file.endsWith('/spec/index.ts') ||
			file.endsWith('/spec/index.d.ts')
		);
	});
}

function isInSpecTestFunction(
	ancestors: readonly AncestorNode[],
	services: ParserServices,
	checker: typescript.TypeChecker,
) {
	const fn = enclosingFunction(ancestors);
	if (!fn) return false;
	const tsNode = services.esTreeNodeToTSNodeMap.get(fn);
	return (
		!!tsNode &&
		typescript.isExpression(tsNode) &&
		isSpecTestFunction(checker.getContextualType(tsNode))
	);
}

function specTestFunction(
	ancestors: readonly AncestorNode[],
	services: ParserServices,
	checker: typescript.TypeChecker,
) {
	for (let i = ancestors.length - 1; i >= 0; i--) {
		const fn = ancestors[i];
		if (!isFunction(fn)) continue;
		const tsNode = services.esTreeNodeToTSNodeMap.get(fn);
		if (
			tsNode &&
			typescript.isExpression(tsNode) &&
			isSpecTestFunction(checker.getContextualType(tsNode))
		)
			return tsNode;
	}
}

type TimerMockMethod =
	| 'mockRequestAnimationFrame'
	| 'mockSetInterval'
	| 'mockSetTimeout';

function hasEarlierCall(
	fn: typescript.Expression,
	method: TimerMockMethod,
	position: number,
) {
	let found = false;
	function visit(node: typescript.Node) {
		if (found || node.getStart() >= position) return;
		if (
			typescript.isCallExpression(node) &&
			typescript.isPropertyAccessExpression(node.expression) &&
			node.expression.name.text === method
		) {
			found = true;
			return;
		}
		typescript.forEachChild(node, visit);
	}
	typescript.forEachChild(fn, visit);
	return found;
}

function timerMockMethod(
	node: typescript.CallExpression,
): Exclude<TimerMockMethod, 'mockRequestAnimationFrame'> | undefined {
	const expression = node.expression;
	if (typescript.isIdentifier(expression)) {
		if (expression.text === 'setTimeout') return 'mockSetTimeout';
		if (expression.text === 'setInterval') return 'mockSetInterval';
		return;
	}
	if (
		!typescript.isPropertyAccessExpression(expression) ||
		!typescript.isIdentifier(expression.expression) ||
		!['globalThis', 'self', 'window'].includes(expression.expression.text)
	)
		return;
	if (expression.name.text === 'setTimeout') return 'mockSetTimeout';
	if (expression.name.text === 'setInterval') return 'mockSetInterval';
}

function helperTimerMethods(
	node: typescript.CallExpression,
	checker: typescript.TypeChecker,
	sourceFile: typescript.SourceFile,
	seen = new Set<typescript.Node>(),
) {
	const declaration = checker.getResolvedSignature(node)?.declaration;
	if (
		declaration?.getSourceFile() !== sourceFile ||
		seen.has(declaration) ||
		!('body' in declaration) ||
		!declaration.body
	)
		return new Set<TimerMockMethod>();
	seen.add(declaration);
	const methods = new Set<TimerMockMethod>();
	function visit(child: typescript.Node) {
		if (typescript.isCallExpression(child)) {
			const method = timerMockMethod(child);
			if (method) methods.add(method);
			else
				for (const helperMethod of helperTimerMethods(
					child,
					checker,
					sourceFile,
					seen,
				))
					methods.add(helperMethod);
		}
		typescript.forEachChild(child, visit);
	}
	visit(declaration.body);
	return methods;
}

function findPackageRoot(file: string) {
	let directory = dirname(file);
	for (;;) {
		if (existsSync(join(directory, 'package.json'))) return directory;
		const parent = dirname(directory);
		if (parent === directory) return;
		directory = parent;
	}
}

function isNodePackage(packageRoot: string | undefined) {
	if (!packageRoot) return false;
	const packageJson: unknown = JSON.parse(
		readFileSync(join(packageRoot, 'package.json'), 'utf8'),
	);
	if (
		typeof packageJson !== 'object' ||
		!packageJson ||
		!('build' in packageJson)
	)
		return false;
	const build = packageJson.build;
	return (
		typeof build === 'object' &&
		!!build &&
		'platform' in build &&
		build.platform === 'node'
	);
}

function getModuleSpecifier(
	node: Rule.Node,
	services: ParserServices,
) {
	const tsNode = services.esTreeNodeToTSNodeMap.get(node);
	if (
		tsNode &&
		(typescript.isImportDeclaration(tsNode) ||
			typescript.isExportDeclaration(tsNode)) &&
		tsNode.moduleSpecifier &&
		typescript.isStringLiteralLike(tsNode.moduleSpecifier)
	)
		return tsNode.moduleSpecifier.text;
	if (
		tsNode &&
		typescript.isCallExpression(tsNode) &&
		(tsNode.expression.kind === typescript.SyntaxKind.ImportKeyword ||
			(typescript.isIdentifier(tsNode.expression) &&
				tsNode.expression.text === 'require'))
	) {
		const argument = tsNode.arguments[0];
		if (argument && typescript.isStringLiteralLike(argument))
			return argument.text;
	}
}

const noRelativePackageImports: Rule.RuleModule = {
	meta: {
		type: 'problem',
		docs: {
			description: 'Disallow relative imports outside the current package.',
		},
		schema: [],
		messages: {
			noRelativePackageImport:
				'Import sibling packages by package name instead of relative path.',
		},
	},
	create(context) {
		const services: ParserServices = context.sourceCode.parserServices;
		const packageRoot = findPackageRoot(context.filename);
		if (isNodePackage(packageRoot)) return {};
		function checkImport(node: Rule.Node) {
			const specifier = getModuleSpecifier(node, services);
			if (!packageRoot || !specifier?.startsWith('.')) return;
			const target = resolve(dirname(context.filename), specifier);
			const targetPath = relative(packageRoot, target);
			if (
				targetPath === '..' ||
				targetPath.startsWith(`..${sep}`) ||
				isAbsolute(targetPath)
			)
				context.report({
					node,
					messageId: 'noRelativePackageImport',
				});
		}
		return {
			ImportDeclaration: checkImport,
			ExportNamedDeclaration: checkImport,
			ExportAllDeclaration: checkImport,
			ImportExpression: checkImport,
			"CallExpression[callee.name='require']": checkImport,
		};
	},
};

const noThrowInSpec: Rule.RuleModule = {
	meta: {
		type: 'problem',
		docs: {
			description: 'Disallow throwing directly from spec test functions.',
		},
		schema: [],
		messages: {
			noThrowInSpec:
				'Do not throw directly from a spec test function. Use a test assertion.',
		},
	},
	create(context) {
		const services: ParserServices = context.sourceCode.parserServices;
		const checker = services.program.getTypeChecker();
		return {
			ThrowStatement(node: Rule.Node) {
				if (
					isInSpecTestFunction(
						context.sourceCode.getAncestors(node),
						services,
						checker,
					)
				)
					context.report({ node, messageId: 'noThrowInSpec' });
			},
		};
	},
};

const noReturnInSpec: Rule.RuleModule = {
	meta: {
		type: 'problem',
		docs: {
			description: 'Disallow returning directly from spec test functions.',
		},
		schema: [],
		messages: {
			noReturnInSpec:
				'Do not return from a spec test function. Use assertions and async/await.',
		},
	},
	create(context) {
		const services: ParserServices = context.sourceCode.parserServices;
		const checker = services.program.getTypeChecker();
		return {
			ReturnStatement(node: Rule.Node) {
				if (
					isInSpecTestFunction(
						context.sourceCode.getAncestors(node),
						services,
						checker,
					)
				)
					context.report({ node, messageId: 'noReturnInSpec' });
			},
		};
	},
};

const noRealTimersInSpec: Rule.RuleModule = {
	meta: {
		type: 'problem',
		docs: {
			description: 'Disallow real timing APIs in spec test functions.',
		},
		schema: [],
		messages: {
			noRealTimer:
				'Do not use real timing APIs in a spec test. Use {{method}}() and advance virtual time.',
		},
	},
	create(context) {
		const services: ParserServices = context.sourceCode.parserServices;
		const checker = services.program.getTypeChecker();
		function checkTimer(
			node: Rule.Node,
			method: TimerMockMethod,
		) {
			const fn = specTestFunction(
				context.sourceCode.getAncestors(node),
				services,
				checker,
			);
			const tsNode = services.esTreeNodeToTSNodeMap.get(node);
			if (!fn || !tsNode || hasEarlierCall(fn, method, tsNode.getStart())) return;
			context.report({
				node,
				messageId: 'noRealTimer',
				data: { method: `a.${method}` },
			});
		}
		return {
			CallExpression(node: Rule.Node) {
				const tsNode = services.esTreeNodeToTSNodeMap.get(node);
				if (!tsNode || !typescript.isCallExpression(tsNode)) return;
				const directMethod = timerMockMethod(tsNode);
				if (directMethod) {
					checkTimer(node, directMethod);
					return;
				}
				const fn = specTestFunction(
					context.sourceCode.getAncestors(node),
					services,
					checker,
				);
				if (!fn) return;
				const declaration = checker.getResolvedSignature(tsNode)?.declaration;
				if (
					declaration?.getSourceFile() === fn.getSourceFile() &&
					declaration.getStart() >= fn.getStart() &&
					declaration.end <= fn.end
				)
					return;
				for (const method of helperTimerMethods(
					tsNode,
					checker,
					tsNode.getSourceFile(),
				)) {
					if (!hasEarlierCall(fn, method, tsNode.getStart()))
						context.report({
							node,
							messageId: 'noRealTimer',
							data: { method: `a.${method}` },
						});
				}
			},
			":matches(CallExpression[callee.type='Identifier'][callee.name='requestAnimationFrame'], CallExpression[callee.type='MemberExpression'][callee.object.name=/^(globalThis|self|window)$/][callee.property.name='requestAnimationFrame'])"(
				node: Rule.Node,
			) {
				checkTimer(node, 'mockRequestAnimationFrame');
			},
		};
	},
};

const noTestTimeoutInSpec: Rule.RuleModule = {
	meta: {
		type: 'problem',
		docs: {
			description: 'Disallow custom test timeouts.',
		},
		schema: [],
		messages: {
			noTestTimeout:
				'Do not extend test timeouts. Make the test faster or remove unnecessary work.',
		},
	},
	create(context) {
		const services: ParserServices = context.sourceCode.parserServices;
		const checker = services.program.getTypeChecker();
		return {
			CallExpression(node: Rule.Node) {
				const tsNode = services.esTreeNodeToTSNodeMap.get(node);
				if (
					!tsNode ||
					!typescript.isCallExpression(tsNode) ||
					!typescript.isPropertyAccessExpression(tsNode.expression) ||
					tsNode.expression.name.text !== 'setTimeout'
				)
					return;
				const receiver = checker.getTypeAtLocation(
					tsNode.expression.expression,
				);
				if (!isSpecSymbol(receiver.getProperty('setTimeout'), 'setTimeout'))
					return;
				context.report({ node, messageId: 'noTestTimeout' });
			},
		};
	},
};

const preferTypeDiscrimination: Rule.RuleModule = {
	meta: {
		type: 'suggestion',
		docs: {
			description:
				'Prefer a constrained type or an explicitly discriminated union.',
		},
		schema: [],
		messages: {
			preferTypeDiscrimination:
				'Prefer a constrained type or an explicitly discriminated union.',
		},
	},
	create(context) {
		const services: ParserServices = context.sourceCode.parserServices;
		const checker = services.program.getTypeChecker();
		const openTypeFlags =
			typescript.TypeFlags.Any |
			typescript.TypeFlags.Unknown |
			typescript.TypeFlags.TypeParameter |
			typescript.TypeFlags.NonPrimitive;
		function isOpenType(type: typescript.Type): boolean {
			if (type.flags & openTypeFlags) return true;
			if (type.isUnionOrIntersection())
				return type.types.some(isOpenType);
			if (
				checker.getIndexInfoOfType(type, typescript.IndexKind.String) ||
				checker.getIndexInfoOfType(type, typescript.IndexKind.Number)
			)
				return true;
			const declarations = type.getSymbol()?.declarations;
			return (
				!!declarations?.length &&
				declarations.every(declaration => {
					const file = declaration
						.getSourceFile()
						.fileName.replace(/\\/g, '/');
					return file.includes('/node_modules/');
				})
			);
		}
		return {
			"BinaryExpression[operator='in']"(node: Rule.Node) {
				const tsNode = services.esTreeNodeToTSNodeMap.get(node);
				if (
					!tsNode ||
					!typescript.isBinaryExpression(tsNode) ||
					!typescript.isStringLiteralLike(tsNode.left) ||
					isOpenType(checker.getTypeAtLocation(tsNode.right))
				)
					return;
				context.report({ node, messageId: 'preferTypeDiscrimination' });
			},
		};
	},
};

const noTrivialTypeGuard: Rule.RuleModule = {
	meta: {
		type: 'suggestion',
		docs: { description: 'Disallow functions that wrap a single type check.' },
		schema: [],
		messages: {
			noTrivialTypeGuard: 'Use the type check directly instead of wrapping it in a function.',
		},
	},
	create(context) {
		const services: ParserServices = context.sourceCode.parserServices;
		const checker = services.program.getTypeChecker();
		function matchesPredicate(
			expression: typescript.Expression,
			predicate: typescript.TypePredicateNode,
		): boolean {
			if (!typescript.isIdentifier(predicate.parameterName) || !predicate.type)
				return false;
			const source = expression.getSourceFile();
			const start = expression.getStart();
			let parameter = '__NarrowedType';
			while (source.text.includes(parameter)) parameter += '_';
			const declaredType = checker.getTypeFromTypeNode(predicate.type);
			const constituents = declaredType.isIntersection() ? declaredType.types : [declaredType];
			const structural = constituents.every(type =>
				!!(type.flags & typescript.TypeFlags.Object) &&
				!checker.isArrayType(type) && !checker.isTupleType(type) &&
				type.getProperties().every(property => property.declarations?.every(declaration =>
					!(typescript.getCombinedModifierFlags(declaration) &
						(typescript.ModifierFlags.Private | typescript.ModifierFlags.Protected)) &&
					!(typescript.isPropertyDeclaration(declaration) &&
						typescript.isPrivateIdentifier(declaration.name)),
				) ?? true) &&
				!type.getCallSignatures().length && !type.getConstructSignatures().length,
			);
			const identity = (type: string) => structural
				? `{ [${parameter}_Key in keyof (${type})]: (${type})[${parameter}_Key] }`
				: type;
			const signature = (type: string) =>
				`(<${parameter},>(): ${parameter} extends (${identity(type)}) ? 1 : 2 => { throw 0; })`;
			const text = source.text.slice(0, start) +
				`(${expression.getText()}) ? (${predicate.parameterName.text}, ${signature(`typeof ${predicate.parameterName.text}`)}) : ${signature(predicate.type.getText())}` +
				source.text.slice(expression.end);
			const options = services.program.getCompilerOptions();
			const host = typescript.createCompilerHost(options);
			const readFile = host.readFile;
			host.readFile = file => file === source.fileName
				? text
				: readFile(file);
			const getSourceFile = host.getSourceFile;
			host.getSourceFile = (file, languageVersion, onError, shouldCreateNewSourceFile) =>
				file === source.fileName
					? getSourceFile(file, languageVersion, onError, shouldCreateNewSourceFile)
					: services.program.getSourceFile(file) ??
						getSourceFile(file, languageVersion, onError, shouldCreateNewSourceFile);
			const program = typescript.createProgram({
				rootNames: services.program.getRootFileNames(),
				options,
				host,
				projectReferences: services.program.getProjectReferences(),
			});
			const narrowedChecker = program.getTypeChecker();
			let narrowed: typescript.Type | undefined;
			let declared: typescript.Type | undefined;
			let narrowedSignature: typescript.Type | undefined;
			let declaredSignature: typescript.Type | undefined;
			function visit(node: typescript.Node) {
				if (typescript.isConditionalExpression(node) && node.getStart() === start &&
					typescript.isParenthesizedExpression(node.whenTrue) &&
					typescript.isBinaryExpression(node.whenTrue.expression)) {
					narrowed = narrowedChecker.getTypeAtLocation(node.whenTrue.expression.left);
					narrowedSignature = narrowedChecker.getTypeAtLocation(node.whenTrue.expression.right);
					declaredSignature = narrowedChecker.getTypeAtLocation(node.whenFalse);
				}
				if (typescript.isTypePredicateNode(node) &&
					node.getStart() === predicate.getStart() && node.type)
					declared = narrowedChecker.getTypeFromTypeNode(node.type);
				typescript.forEachChild(node, visit);
			}
			const narrowedSource = program.getSourceFile(source.fileName);
			if (narrowedSource) visit(narrowedSource);
			const openFlags = typescript.TypeFlags.Any | typescript.TypeFlags.Unknown;
			return !!narrowed && !!declared && !!narrowedSignature && !!declaredSignature &&
				!(narrowed.flags & openFlags) && !(declared.flags & openFlags) &&
				narrowedChecker.isTypeAssignableTo(narrowed, declared) &&
				narrowedChecker.isTypeAssignableTo(declared, narrowed) &&
				narrowedChecker.isTypeAssignableTo(narrowedSignature, declaredSignature) &&
				narrowedChecker.isTypeAssignableTo(declaredSignature, narrowedSignature);
		}
		return {
			'FunctionDeclaration, FunctionExpression, ArrowFunctionExpression'(
				node: Rule.Node,
			) {
				const fn = services.esTreeNodeToTSNodeMap.get(node);
				if (
					!fn ||
					!(typescript.isFunctionDeclaration(fn) ||
						typescript.isFunctionExpression(fn) ||
						typescript.isArrowFunction(fn) ||
						typescript.isMethodDeclaration(fn)) ||
					!fn.body
				)
					return;
				if (
					!typescript.isFunctionDeclaration(fn) &&
					!typescript.isVariableDeclaration(fn.parent)
				)
					return;
				const body = fn.body;
				const onlyStatement = typescript.isBlock(body)
					? body.statements[0]
					: undefined;
				const expression = typescript.isBlock(body)
					? body.statements.length === 1 &&
						onlyStatement &&
						typescript.isReturnStatement(onlyStatement)
						? onlyStatement.expression
						: undefined
					: body;
				if (!expression) return;
				const predicate = fn.type && typescript.isTypePredicateNode(fn.type)
					? fn.type
					: undefined;
				const isParameter = (value: typescript.Node): boolean => {
					if (typescript.isParenthesizedExpression(value))
						return isParameter(value.expression);
					return typescript.isIdentifier(value) &&
						(!predicate || (typescript.isIdentifier(predicate.parameterName) &&
							predicate.parameterName.text === value.text)) &&
						fn.parameters.some(
							parameter =>
								typescript.isIdentifier(parameter.name) &&
								parameter.name.text === value.text,
						);
				};
				const isLiteral = (value: typescript.Node) =>
					typescript.isLiteralExpression(value) ||
					value.kind === typescript.SyntaxKind.NullKeyword ||
					(typescript.isIdentifier(value) && value.text === 'undefined');
				function isEqualityCheck(
					left: typescript.Expression,
					right: typescript.Expression,
				) {
					const isCheckedValue = (value: typescript.Expression) =>
						isParameter(value) ||
						(typescript.isTypeOfExpression(value) &&
							isParameter(value.expression));
					return (
						(isCheckedValue(left) && isLiteral(right)) ||
						(isCheckedValue(right) && isLiteral(left))
					);
				}
				function isSingleCheck(value: typescript.Expression): boolean {
					if (typescript.isParenthesizedExpression(value))
						return isSingleCheck(value.expression);
					if (typescript.isPrefixUnaryExpression(value))
						return (
							value.operator === typescript.SyntaxKind.ExclamationToken &&
							isSingleCheck(value.operand)
						);
					if (typescript.isCallExpression(value)) {
						if (value.arguments.length !== 1) return false;
						const signature = checker.getResolvedSignature(value);
						const predicate = signature &&
							checker.getTypePredicateOfSignature(signature);
						const argument = predicate?.kind ===
							typescript.TypePredicateKind.Identifier
							? value.arguments[predicate.parameterIndex]
							: undefined;
						return !!argument && isParameter(argument);
					}
					if (!typescript.isBinaryExpression(value)) return false;
					const { left, right, operatorToken } = value;
					if (operatorToken.kind === typescript.SyntaxKind.InstanceOfKeyword) {
						return isParameter(left);
					}
					if (operatorToken.kind === typescript.SyntaxKind.InKeyword) {
						return isLiteral(left) && isParameter(right);
					}
					const isEqualityOperator = [
						typescript.SyntaxKind.EqualsEqualsToken,
						typescript.SyntaxKind.EqualsEqualsEqualsToken,
						typescript.SyntaxKind.ExclamationEqualsToken,
						typescript.SyntaxKind.ExclamationEqualsEqualsToken,
					].includes(operatorToken.kind);
					if (!isEqualityOperator) return false;
					return isEqualityCheck(left, right);
				}
				if (isSingleCheck(expression) &&
					(!predicate || matchesPredicate(expression, predicate)))
					context.report({ node, messageId: 'noTrivialTypeGuard' });
			},
		};
	},
};

const noUndeclaredProperties: Rule.RuleModule = {
	meta: {
		type: 'problem',
		docs: {
			description: 'Disallow adding properties absent from the target type.',
		},
		schema: [],
		messages: {
			undeclaredProperty:
				'Property "{{name}}" is not declared on the target type. Create a new object with an explicit extended type instead.',
		},
	},
	create(context) {
		const services: ParserServices = context.sourceCode.parserServices;
		const checker = services.program.getTypeChecker();
		function allowsProperty(
			type: typescript.Type,
			name: string,
			key: typescript.Type,
		): boolean {
			if (type.flags & (typescript.TypeFlags.Any | typescript.TypeFlags.Unknown))
				return true;
			if (type.flags & typescript.TypeFlags.TypeParameter) {
				const constraint = checker.getBaseConstraintOfType(type);
				return !constraint || allowsProperty(constraint, name, key);
			}
			if (type.isUnion())
				return type.types.every(branch => allowsProperty(branch, name, key));
			return (
				type.getProperties().some(property => property.getName() === name) ||
				checker.getIndexInfosOfType(type).some(index =>
					checker.isTypeAssignableTo(key, index.keyType) ||
					(index.keyType.flags & typescript.TypeFlags.Number &&
						String(Number(name)) === name),
				)
			);
		}
		return {
			CallExpression(node: Rule.Node) {
				const call = services.esTreeNodeToTSNodeMap.get(node);
				if (!call || !typescript.isCallExpression(call)) return;
				const declaration = checker.getResolvedSignature(call)?.declaration;
				if (
					!declaration ||
					!typescript.isMethodSignature(declaration) ||
					!services.program.isSourceFileDefaultLibrary(declaration.getSourceFile()) ||
					!typescript.isInterfaceDeclaration(declaration.parent) ||
					declaration.parent.name.text !== 'ObjectConstructor' ||
					!typescript.isIdentifier(declaration.name)
				)
					return;
				const method = declaration.name.text;
				if (!['assign', 'defineProperty', 'defineProperties'].includes(method)) return;
				let target = call.arguments[0];
				if (!target) return;
				while (typescript.isParenthesizedExpression(target))
					target = target.expression;
				if (typescript.isObjectLiteralExpression(target)) return;
				const targetType = checker.getTypeAtLocation(target);
				const reported = new Set<string>();
				function checkKey(
					name: string,
					key: typescript.Type = checker.getStringLiteralType(name),
				) {
					if (reported.has(name) || allowsProperty(targetType, name, key))
						return;
					reported.add(name);
					context.report({ node, messageId: 'undeclaredProperty', data: { name } });
				}
				function checkSource(type: typescript.Type) {
					if (type.isUnion()) {
						for (const branch of type.types) checkSource(branch);
						return;
					}
					for (const property of checker.getPropertiesOfType(type)) {
						const name = property.getName();
						checkKey(
							name,
							name.startsWith('__@')
								? checker.getESSymbolType()
								: checker.getStringLiteralType(name),
						);
					}
				}
				function checkPropertyKey(key: typescript.Type) {
					for (const branch of key.isUnion() ? key.types : [key]) {
						if (branch.isStringLiteral() || branch.isNumberLiteral())
							checkKey(String(branch.value));
						else if (
							branch.flags & typescript.TypeFlags.UniqueESSymbol &&
							'escapedName' in branch
						)
							checkKey(String(branch.escapedName), branch);
					}
				}
				const source = call.arguments[1];
				if (!source) return;
				if (method === 'assign') {
					for (const argument of call.arguments.slice(1))
						checkSource(checker.getTypeAtLocation(argument));
				} else if (method === 'defineProperties')
					checkSource(checker.getTypeAtLocation(source));
				else checkPropertyKey(checker.getTypeAtLocation(source));
			},
		};
	},
};

const localPlugin = {
	rules: {
		'no-relative-package-imports': noRelativePackageImports,
		'no-real-timers-in-spec': noRealTimersInSpec,
		'no-test-timeout-in-spec': noTestTimeoutInSpec,
		'no-return-in-spec': noReturnInSpec,
		'no-throw-in-spec': noThrowInSpec,
		'prefer-type-discrimination': preferTypeDiscrimination,
		'no-trivial-type-guard': noTrivialTypeGuard,
		'no-undeclared-properties': noUndeclaredProperties,
	},
};

const sharedRules = {
	'local/no-relative-package-imports': 'error',
	'local/no-undeclared-properties': 'error',
	'@typescript-eslint/member-ordering': 'error',
	'no-extend-native': 'error',
	'no-dupe-class-members': 'error',
	eqeqeq: 'error',
	'@typescript-eslint/no-useless-constructor': 'error',
	'@typescript-eslint/no-redundant-type-constituents': 'error',
	'@typescript-eslint/no-non-null-assertion': 'error',
	'@typescript-eslint/no-unnecessary-type-arguments': 'error',
	'@typescript-eslint/no-unnecessary-type-assertion': 'error',
	'@typescript-eslint/no-misused-promises': [
		'error',
		{ checksVoidReturn: { attributes: false } },
	],
	'@typescript-eslint/no-floating-promises': [
		'error',
		{ ignoreVoid: false },
	],
	'@typescript-eslint/no-unnecessary-condition': [
		'error',
		{ allowConstantLoopConditions: true },
	],
	'@typescript-eslint/switch-exhaustiveness-check': [
		'error',
		{ considerDefaultExhaustiveForUnions: true },
	],
	'@typescript-eslint/prefer-optional-chain': 'error',
	'@typescript-eslint/no-unsafe-call': 'error',
	'@typescript-eslint/no-unsafe-member-access': 'error',
	'@typescript-eslint/no-unsafe-return': 'error',
	'@typescript-eslint/no-unsafe-argument': 'error',
	complexity: ['error', { max: 22, variant: 'modified' }],
	'local/prefer-type-discrimination': 'error',
	'local/no-trivial-type-guard': 'error',
} satisfies NonNullable<Linter.Config['rules']>;

export const tsConfig: Linter.Config = {
	files: ['**/*.ts', '**/*.tsx'],
	plugins: {
		local: localPlugin,
	},
	languageOptions: {
		ecmaVersion: 2022,
		sourceType: 'module',
		parserOptions: {
			// enables type-aware rules without hardcoding a project path
			projectService: true,
		},
	},
	rules: {
		...sharedRules,

		'no-mixed-spaces-and-tabs': 'off',
		'no-prototype-builtins': 'error',
		'sort-imports': 'off',
		'@typescript-eslint/no-var-requires': 'off',
		'@typescript-eslint/no-explicit-any': 2,
		'@typescript-eslint/no-unused-vars': 'off',
		'@typescript-eslint/explicit-function-return-type': 'off',
		'@typescript-eslint/no-this-alias': 'off',
		'@typescript-eslint/no-use-before-define': 'off',
		'@typescript-eslint/no-empty-interface': 'off',
		'prefer-promise-reject-errors': 'off',
		'@typescript-eslint/prefer-promise-reject-errors': 'error',
		'@typescript-eslint/consistent-type-assertions': [
			'error',
			{
				assertionStyle: 'never',
			},
		],
		'@typescript-eslint/unbound-method': 'off',
		'no-restricted-syntax': [
			'error',
			{
				selector: [
					'FunctionDeclaration > :matches(Identifier, RestElement)[typeAnnotation.typeAnnotation.type="TSUnknownKeyword"]',
					'FunctionExpression > :matches(Identifier, RestElement)[typeAnnotation.typeAnnotation.type="TSUnknownKeyword"]',
					'ArrowFunctionExpression > :matches(Identifier, RestElement)[typeAnnotation.typeAnnotation.type="TSUnknownKeyword"]',
					'TSMethodSignature > :matches(Identifier, RestElement)[typeAnnotation.typeAnnotation.type="TSUnknownKeyword"]',
				].join(', '),
				message: 'Param type `unknown` is banned. Use a concrete type.',
			},
			{
				selector: 'MemberExpression[object.name="Reflect"]',
				message:
					'Reflect API usage is banned. Use typed language constructs.',
			},
		],
	},
};

export const specConfig = defineConfig([
	js.configs.recommended,
	ts.configs.recommended,
	{
		files: ['**/*.ts', '**/*.tsx'],
		plugins: { local: localPlugin },
		rules: {
			...sharedRules,
			'@typescript-eslint/no-this-alias': 'off',
			'@typescript-eslint/no-unused-vars': 'off',
			'local/no-real-timers-in-spec': 'error',
			'local/no-test-timeout-in-spec': 'error',
			'local/no-return-in-spec': 'error',
			'local/no-throw-in-spec': 'error',
		},
	},
	{
		files: ['**/test-screenshot.ts'],
		rules: {
			'local/no-test-timeout-in-spec': 'off',
		},
	},
]);
