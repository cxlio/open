import js from '@eslint/js';
import ts from 'typescript-eslint';

export default ts.config([
	js.configs.recommended,
	ts.configs.recommended,
	{
		files: ['**/*.ts', '**/*.tsx'],
		languageOptions: {
			ecmaVersion: 2022,
			sourceType: 'module',
		},
		rules: {
			'@typescript-eslint/member-ordering': 'error',

			'no-mixed-spaces-and-tabs': 'off',
			'no-prototype-builtins': 'off',
			'no-dupe-class-members': 'off',
			'sort-imports': 'off',
			'@typescript-eslint/no-var-requires': 'off',
			'@typescript-eslint/no-useless-constructor': 'error',
			'@typescript-eslint/no-explicit-any': 2,
			'@typescript-eslint/no-unused-vars': 'off',
			'@typescript-eslint/explicit-function-return-type': 'off',
			'@typescript-eslint/no-this-alias': 'off',
			'@typescript-eslint/no-use-before-define': 'off',
			'@typescript-eslint/no-empty-interface': 'off',
		},
	},
]);
