import runNode from './runner-node.js';
import runPuppeteer from './runner-puppeteer.js';

import type { SpecRunner } from './index.js';

export function run(options: SpecRunner) {
	const hardTimeout = Math.min(options.hardTimeout ?? 60_000, 60_000);
	const timeoutId = setTimeout(() => {
		throw new Error(
			`Spec runner timed out after ${hardTimeout / 1000} seconds`,
		);
	}, hardTimeout);
	const runner = options.node ? runNode(options) : runPuppeteer(options);
	return runner.finally(() => clearTimeout(timeoutId));
}
