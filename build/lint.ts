import { resolve, dirname, relative } from 'path';

import { Observable, fromAsync } from '../rx/index.js';
import { readJson } from '../program/index.js';
import {
	appLog,
	buildOutputOptions,
	type Output,
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
	return eslintWithConfig(files, options, 'default');
}

function eslintWithConfig(
	files: string[],
	options: ESLint.Options | undefined,
	configName: 'default' | 'specConfig',
) {
	return new Observable<Output>(subs => {
		Promise.all([import('eslint'), import('./eslint-config.js')]).then(
			([{ ESLint }, config]) => {
				if (buildOutputOptions().verbose) appLog(`eslint ${ESLint.version}`);
				const linter = new ESLint({
					cache: true,
					cwd: process.cwd(),
					overrideConfigFile: true,
					baseConfig: config[configName],
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
	return eslintConfig(path, 'default');
}

export function eslintTestTsconfig(path = 'tsconfig.test.json') {
	return eslintConfig(path, 'specConfig');
}

function eslintConfig(
	path: string | TsconfigJson,
	configName: 'default' | 'specConfig',
) {
	let cwd: string;
	let project: string | undefined;
	return fromAsync(async () => {
		if (typeof path === 'string') {
			cwd = dirname(resolve(path));
			project = resolve(path);
			return readJson<TsconfigJson>(path);
		}
		return path;
	}).switchMap(tsconfigFile =>
		eslintWithConfig(
			tsconfigFile.files ?? tsconfigFile.include ?? [],
			{
				ignorePatterns: [...(tsconfigFile.exclude ?? []), '*.js'],
				errorOnUnmatchedPattern: false,
				cwd,
				...(project
					? {
							overrideConfig: {
								languageOptions: {
									parserOptions: {
										project,
										projectService: false,
									},
								},
							},
						}
					: {}),
			},
			configName,
		),
	);
}
