#!/usr/bin/env node
import { existsSync } from 'fs';
import { parseArgvHelp } from '../program/index.js';
import { buildParameters } from './builder.js';

if (import.meta.main) {
	if (parseArgvHelp(buildParameters).handled) process.exit(0);
	if (existsSync('./project.json')) {
		const { buildRoot } = await import('./root.js');
		await buildRoot();
	} else {
		const { buildLibrary } = await import('./library.js');
		await buildLibrary();
	}
}
