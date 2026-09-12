import js from '@eslint/js';
import { defineConfig } from 'eslint/config';
import ts from 'typescript-eslint';
import { configs as sonarjsConfigs } from 'eslint-plugin-sonarjs';
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

function hasEarlierCall(
	fn: typescript.Expression,
	method:
		| 'mockRequestAnimationFrame'
		| 'mockSetInterval'
		| 'mockSetTimeout',
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
			method:
				| 'mockRequestAnimationFrame'
				| 'mockSetInterval'
				| 'mockSetTimeout',
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
			":matches(CallExpression[callee.type='Identifier'][callee.name='requestAnimationFrame'], CallExpression[callee.type='MemberExpression'][callee.object.name=/^(globalThis|self|window)$/][callee.property.name='requestAnimationFrame'])"(
				node: Rule.Node,
			) {
				checkTimer(node, 'mockRequestAnimationFrame');
			},
			":matches(CallExpression[callee.type='Identifier'][callee.name='setInterval'], CallExpression[callee.type='MemberExpression'][callee.object.name=/^(globalThis|self|window)$/][callee.property.name='setInterval'])"(
				node: Rule.Node,
			) {
				checkTimer(node, 'mockSetInterval');
			},
			":matches(CallExpression[callee.type='Identifier'][callee.name='setTimeout'], CallExpression[callee.type='MemberExpression'][callee.object.name=/^(globalThis|self|window)$/][callee.property.name='setTimeout'])"(
				node: Rule.Node,
			) {
				checkTimer(node, 'mockSetTimeout');
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
		return {
			"BinaryExpression[operator='in']"(node: Rule.Node) {
				context.report({ node, messageId: 'preferTypeDiscrimination' });
			},
		};
	},
};

const localPlugin = {
	rules: {
		'no-real-timers-in-spec': noRealTimersInSpec,
		'no-test-timeout-in-spec': noTestTimeoutInSpec,
		'no-return-in-spec': noReturnInSpec,
		'no-throw-in-spec': noThrowInSpec,
		'prefer-type-discrimination': preferTypeDiscrimination,
	},
};

const sharedRules = {
	'@typescript-eslint/member-ordering': 'error',
	'no-extend-native': 'error',
	'@typescript-eslint/no-useless-constructor': 'error',
	'@typescript-eslint/no-redundant-type-constituents': 'error',
	'@typescript-eslint/no-non-null-assertion': 'error',
	'@typescript-eslint/no-unnecessary-type-arguments': 'error',
	'@typescript-eslint/switch-exhaustiveness-check': [
		'error',
		{ considerDefaultExhaustiveForUnions: true },
	],
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
		'local/prefer-type-discrimination': 'warn',

		'no-mixed-spaces-and-tabs': 'off',
		'no-prototype-builtins': 'error',
		'no-dupe-class-members': 'error',
		'sort-imports': 'off',
		eqeqeq: 'error',
		'@typescript-eslint/no-var-requires': 'off',
		'@typescript-eslint/no-explicit-any': 2,
		'@typescript-eslint/no-unused-vars': 'off',
		'@typescript-eslint/explicit-function-return-type': 'off',
		'@typescript-eslint/no-this-alias': 'off',
		'@typescript-eslint/no-use-before-define': 'off',
		'@typescript-eslint/no-empty-interface': 'off',
		'@typescript-eslint/no-unnecessary-type-assertion': 'error',
		'@typescript-eslint/no-floating-promises': 'error',
		'prefer-promise-reject-errors': 'off',
		'@typescript-eslint/prefer-promise-reject-errors': 'error',
		complexity: ['error', { max: 22, variant: 'modified' }],
		'@typescript-eslint/no-misused-promises': [
			'error',
			{ checksVoidReturn: { attributes: false } },
		],
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
		'@typescript-eslint/prefer-optional-chain': 'error',

		'@typescript-eslint/no-unsafe-call': 'error',
		'@typescript-eslint/unbound-method': 'off',
		'@typescript-eslint/no-unsafe-member-access': 'error',
		'@typescript-eslint/no-unsafe-return': 'error',
		'@typescript-eslint/no-unsafe-argument': 'error',
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
