import js from '@eslint/js';
import { defineConfig } from 'eslint/config';
import ts from 'typescript-eslint';

export default defineConfig([
	js.configs.recommended,
	ts.configs.recommended, //TypeChecked,
	{
		files: ['**/*.ts', '**/*.tsx'],
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
					message:
						'Param type `unknown` is banned. Use a concrete type.',
				},
			],
		},
	},
]);
