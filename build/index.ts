#!/usr/bin/env node
export { basename, file, files, concatFile, copyDir, zip } from './file.js';
export { pkg, readme, esbuild } from './package.js';
export { Package } from './npm.js';
export { buildLibrary } from './library.js';
export { Task, build, exec, shell } from './builder.js';

import { buildLibrary } from './library.js';
if (import.meta.main) await buildLibrary();
