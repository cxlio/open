import { relative, join } from 'path';
import { readFile } from 'fs/promises';

import { Observable, fromAsync } from '../rx/index.js';
import { Output, appLog, resolveRequire } from './builder.js';

import type { TsconfigJson } from './tsc.js';
import type { ESLint } from 'eslint';

function handleEslintResult(results: ESLint.LintResult[]) {
	const result: Output[] = [];
	let hasErrors: boolean = false;

	for (const { errorCount, filePath, messages } of results) {
		const file = relative(process.cwd(), filePath);

		appLog(`eslint ${file}`);
		if (errorCount) {
			hasErrors = true;
			messages.forEach(r =>
				console.error(
					`${file}#${r.line}:${r.column}: ${r.message} (${r.ruleId})`,
				),
			);
		}
	}
	if (hasErrors) throw new Error('eslint errors found.');

	return result;
}

export function eslint(files = ['**/*.ts?(x)'], options?: ESLint.Options) {
	return new Observable<Output>(subs => {
		const { ESLint } = resolveRequire<typeof import('eslint')>('eslint');
		appLog(`eslint ${ESLint.version}`);
		const linter = new ESLint({
			cache: true,
			cwd: process.cwd(),
			overrideConfigFile: join(import.meta.dirname, 'eslint-config.js'),
			...options,
		});
		linter
			.lintFiles(files)
			.then(handleEslintResult)
			.then(
				() => subs.complete(),
				e => subs.error(e),
			);
	});
}

export function eslintTsconfig(path: string | TsconfigJson = 'tsconfig.json') {
	return fromAsync(async () => {
		return typeof path === 'string'
			? (JSON.parse(await readFile(path, 'utf8')) as TsconfigJson)
			: path;
	}).switchMap(tsconfigFile =>
		eslint(tsconfigFile.files ?? tsconfigFile.include, {
			ignorePatterns: [...(tsconfigFile.exclude ?? []), '*.js'],
			errorOnUnmatchedPattern: false,
		}),
	);
}
