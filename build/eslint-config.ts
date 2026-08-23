import js from '@eslint/js';
import { defineConfig } from 'eslint/config';
import ts from 'typescript-eslint';
import { configs as sonarjsConfigs } from 'eslint-plugin-sonarjs';
import type { Rule } from 'eslint';
import type { FlatConfig } from 'typescript-eslint';
import * as typescript from 'typescript';

type AncestorNode = ReturnType<
	Rule.RuleContext['sourceCode']['getAncestors']
>[number];

function enclosingFunction(ancestors: readonly AncestorNode[]) {
	for (let i = ancestors.length - 1; i >= 0; i--) {
		const node = ancestors[i];
		if (
			node?.type === 'ArrowFunctionExpression' ||
			node?.type === 'FunctionExpression'
		)
			return node;
	}
}

function isSpecTestFunction(type: typescript.Type | undefined) {
	const symbol = type?.aliasSymbol;
	if (symbol?.getName() !== 'TestFn') return false;
	return symbol.declarations?.some(declaration => {
		const file = declaration.getSourceFile().fileName.replace(/\\/g, '/');
		return (
			file.includes('/node_modules/@cxl/spec/') ||
			file.endsWith('/spec/index.ts') ||
			file.endsWith('/spec/index.d.ts')
		);
	});
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
		const services: {
			program: typescript.Program;
			esTreeNodeToTSNodeMap: {
				get(node: AncestorNode): typescript.Node | undefined;
			};
		} = context.sourceCode.parserServices;
		const checker = services.program.getTypeChecker();
		return {
			ThrowStatement(node: Rule.Node) {
				const fn = enclosingFunction(context.sourceCode.getAncestors(node));
				if (!fn) return;
				const tsNode = services.esTreeNodeToTSNodeMap.get(fn);
				if (!tsNode || !typescript.isExpression(tsNode)) return;
				if (isSpecTestFunction(checker.getContextualType(tsNode)))
					context.report({ node, messageId: 'noThrowInSpec' });
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
		'no-throw-in-spec': noThrowInSpec,
		'prefer-type-discrimination': preferTypeDiscrimination,
	},
};

export const tsConfig: FlatConfig.Config = {
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
		'@typescript-eslint/member-ordering': 'error',
		'local/prefer-type-discrimination': 'warn',

		'no-mixed-spaces-and-tabs': 'off',
		'no-prototype-builtins': 'error',
		'no-dupe-class-members': 'error',
		'no-extend-native': 'error',
		'sort-imports': 'off',
		eqeqeq: 'error',
		'@typescript-eslint/no-var-requires': 'off',
		'@typescript-eslint/no-useless-constructor': 'error',
		'@typescript-eslint/no-explicit-any': 2,
		'@typescript-eslint/no-unused-vars': 'off',
		'@typescript-eslint/explicit-function-return-type': 'off',
		'@typescript-eslint/no-this-alias': 'off',
		'@typescript-eslint/no-use-before-define': 'off',
		'@typescript-eslint/no-empty-interface': 'off',
		'@typescript-eslint/no-unnecessary-type-assertion': 'error',
		'@typescript-eslint/no-redundant-type-constituents': 'error',
		'@typescript-eslint/no-non-null-assertion': 'error',
		'@typescript-eslint/no-unnecessary-type-arguments': 'error',
		'@typescript-eslint/no-floating-promises': 'error',
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
		/*'@typescript-eslint/strict-boolean-expressions': [
				'error',
				{ allowString: true, allowNumber: false },
			],*/
		'@typescript-eslint/no-unnecessary-condition': [
			'error',
			{ allowConstantLoopConditions: true },
		],
		'@typescript-eslint/switch-exhaustiveness-check': [
			'error',
			{ considerDefaultExhaustiveForUnions: true },
		],

		// Prefer modern nullable patterns
		/*'@typescript-eslint/prefer-nullish-coalescing': [
				'error',
				{ ignoreMixedLogicalExpressions: true },
			],*/
		'@typescript-eslint/prefer-optional-chain': 'error',

		'@typescript-eslint/no-unsafe-call': 'error',
		'@typescript-eslint/no-unsafe-member-access': 'error',
		'@typescript-eslint/no-unsafe-return': 'error',
		'@typescript-eslint/no-unsafe-argument': 'error',
		'no-restricted-syntax': [
			'error',
			{
				selector: [
					// Named params: function foo(x: unknown)
					'FunctionDeclaration > :matches(Identifier, RestElement)[typeAnnotation.typeAnnotation.type="TSUnknownKeyword"]',
					'FunctionExpression > :matches(Identifier, RestElement)[typeAnnotation.typeAnnotation.type="TSUnknownKeyword"]',
					'ArrowFunctionExpression > :matches(Identifier, RestElement)[typeAnnotation.typeAnnotation.type="TSUnknownKeyword"]',
					// Interface/type method signatures: { foo(x: unknown): void }
					'TSMethodSignature > :matches(Identifier, RestElement)[typeAnnotation.typeAnnotation.type="TSUnknownKeyword"]',
				].join(', '),
				message: 'Param type `unknown` is banned. Use a concrete type.',
			},
		],
	},
};

export const specConfig = defineConfig([
	ts.configs.base,
	{
		files: ['**/*.ts', '**/*.tsx'],
		plugins: { local: localPlugin },
		rules: { 'local/no-throw-in-spec': 'error' },
	},
]);

export default defineConfig([
	js.configs.recommended,
	ts.configs.recommended,
	tsConfig,
	sonarjsConfigs.recommended,
	{
		rules: {
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
