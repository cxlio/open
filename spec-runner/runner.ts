import runNode from './runner-node.js';
import runPuppeteer from './runner-puppeteer.js';

import type { SpecRunner } from './index.js';

export function run(options: SpecRunner) {
	return options.node ? runNode(options) : runPuppeteer(options);
}
