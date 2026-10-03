import { existsSync } from 'fs';
import { parseArgv, parseArgvHelp } from '@cxl/program';
import { resolve } from 'path';
import { buildParameters } from './builder.js';
import { withBuildDirectory } from './package.js';

export async function main() {
	if (parseArgvHelp(buildParameters).handled) return;
	const { packages } = parseArgv(buildParameters);
	if (packages !== undefined) {
		const directories = packages.split(',');
		if (directories.some(directory => !directory.trim()))
			throw new Error('Package directories must not be empty');
		const paths = directories.map(directory => resolve(directory.trim()));
		for (const directory of paths)
			await withBuildDirectory(directory, async () => {
				const { buildLibrary } = await import('./library.js');
				await buildLibrary();
			});
		return;
	}
	if (existsSync('./project.json')) {
		const { buildRoot } = await import('./root.js');
		await buildRoot();
	} else {
		const { buildLibrary } = await import('./library.js');
		await buildLibrary();
	}
}
