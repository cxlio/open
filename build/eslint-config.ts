import js from '@eslint/js';
import { defineConfig } from 'eslint/config';
import ts from 'typescript-eslint';
import { configs as sonarjsConfigs } from 'eslint-plugin-sonarjs';
import { tsConfig } from './eslint-config-base.js';

export { specConfig, tsConfig } from './eslint-config-base.js';

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
