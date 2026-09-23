import js from '@eslint/js';
import { defineConfig } from 'eslint/config';
import ts from 'typescript-eslint';
import { configs as sonarjsConfigs } from 'eslint-plugin-sonarjs';
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

const localPlugin = {
	rules: {
		'no-relative-package-imports': noRelativePackageImports,
		'no-real-timers-in-spec': noRealTimersInSpec,
		'no-test-timeout-in-spec': noTestTimeoutInSpec,
		'no-return-in-spec': noReturnInSpec,
		'no-throw-in-spec': noThrowInSpec,
		'prefer-type-discrimination': preferTypeDiscrimination,
	},
};

const sharedRules = {
	'local/no-relative-package-imports': 'error',
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
	'@typescript-eslint/no-floating-promises': 'error',
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
		'@typescript-eslint/no-unnecessary-condition': [
			'error',
			{ allowConstantLoopConditions: true },
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

export default defineConfig([
	js.configs.recommended,
	ts.configs.recommended,
	//ts.configs.recommendedTypeCheckedOnly,
	tsConfig,
	sonarjsConfigs.recommended,
	{
		rules: {
			'require-atomic-updates': ['error', { allowProperties: true }],
			'sonarjs/cognitive-complexity': 'off',
			'sonarjs/no-all-duplicated-branches': 'error',
			'sonarjs/no-duplicated-branches': 'error',
			'sonarjs/no-identical-conditions': 'error',
			'sonarjs/no-identical-expressions': 'error',
			'sonarjs/no-identical-functions': 'error',
			'sonarjs/function-return-type': 'off',
			'sonarjs/no-nested-assignment': 'off',
			'sonarjs/no-nested-conditional': 'off',
			'sonarjs/no-nested-template-literals': 'off',
			'sonarjs/prefer-regexp-exec': 'off',
		},
	},
]);
