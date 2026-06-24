import { resolve, dirname, relative } from 'path';

import { Observable, fromAsync } from '../rx/index.js';
import { readJson } from '../program/index.js';
import {
	Output,
	appLog,
	buildOutputOptions,
	resolveRequire,
} from './builder.js';

import type { TsconfigJson } from './tsc.js';
import type { ESLint } from 'eslint';

function handleEslintResult(results: ESLint.LintResult[]) {
	const result: Output[] = [];
	let hasErrors: boolean = false;
	const verbose = buildOutputOptions().verbose;

	for (const { errorCount, filePath, messages } of results) {
		const file = relative(process.cwd(), filePath);

		if (verbose) appLog(`eslint ${file}`);
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
		import('./eslint-config.js').then(
			config => {
				if (buildOutputOptions().verbose) appLog(`eslint ${ESLint.version}`);
				const linter = new ESLint({
					cache: true,
					cwd: process.cwd(),
					overrideConfigFile: true,
					baseConfig: config.default,
					...options,
				});
				return linter.lintFiles(files).then(handleEslintResult);
			},
			e => subs.error(e),
		).then(
			() => subs.complete(),
			e => subs.error(e),
		);
	});
}

export function eslintTsconfig(path: string | TsconfigJson = 'tsconfig.json') {
	let cwd: string;
	return fromAsync(async () => {
		if (typeof path === 'string') {
			cwd = dirname(resolve(path));
			return readJson<TsconfigJson>(path);
		}
		return path;
	}).switchMap(tsconfigFile =>
		eslint(tsconfigFile.files ?? tsconfigFile.include, {
			ignorePatterns: [...(tsconfigFile.exclude ?? []), '*.js'],
			errorOnUnmatchedPattern: false,
			cwd,
		}),
	);
}
