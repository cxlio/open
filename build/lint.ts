import { relative, join } from 'path';

import { Observable } from '../rx/index.js';
import { Output, appLog, resolveRequire } from './builder.js';

import type { ESLint } from 'eslint';

function handleEslintResult(results: ESLint.LintResult[]) {
	const result: Output[] = [];
	let hasErrors = false;

	results.forEach(result => {
		const errorCount = result.errorCount;
		const file = relative(process.cwd(), result.filePath);

		appLog(`eslint ${file}`);
		if (errorCount) {
			hasErrors = true;
			result.messages.forEach(r =>
				console.error(
					`${file}#${r.line}:${r.column}: ${r.message} (${r.ruleId})`,
				),
			);
		}
	});
	if (hasErrors) throw new Error('eslint errors found.');

	return result;
}

export function eslint(options?: ESLint.Options) {
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
			.lintFiles(['**/*.ts?(x)'])
			.then(handleEslintResult)
			.then(
				() => subs.complete(),
				e => subs.error(e),
			);
	});
}
