import { writeFile } from 'fs/promises';
import type { JsonResult } from '../spec/index.js';
import {
	renderSpecificationDocument,
	type SpecificationDocumentOptions,
} from './specification.js';

export function writeSpecificationDocument(
	path: string | undefined,
	test: JsonResult,
	options?: SpecificationDocumentOptions,
) {
	return path
		? writeFile(path, renderSpecificationDocument(test, options))
		: Promise.resolve();
}
