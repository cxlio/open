import { existsSync } from 'fs';
import { parseArgvHelp } from '@cxl/program';
import { buildParameters } from './builder.js';

export async function main() {
	if (parseArgvHelp(buildParameters).handled) return;
	if (existsSync('./project.json')) {
		const { buildRoot } = await import('./root.js');
		await buildRoot();
	} else {
		const { buildLibrary } = await import('./library.js');
		await buildLibrary();
	}
}
