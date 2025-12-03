#!/usr/bin/env node
export { basename, file, files, concatFile, copyDir, zip } from './file.js';
export { pkg, readme, esbuild } from './package.js';
export { Package } from './npm.js';
export { buildLibrary } from './library.js';
export {
	BuildConfiguration,
	Output,
	Task,
	build,
	exec,
	shell,
} from './builder.js';

export * from './git.js';
export * from './lint.js';
export { tsconfig } from './tsc.js';
export { buildDocs } from './docs.js';

import { existsSync } from 'fs';

if (import.meta.main) {
	if (existsSync('./project.json')) {
		const { buildRoot } = await import('./root.js');
		await buildRoot();
	} else {
		const { buildLibrary } = await import('./library.js');
		await buildLibrary();
	}
}
