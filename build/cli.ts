#!/usr/bin/env node
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
