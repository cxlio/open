import { observable } from '../rx/index.js';

import type { Output } from './builder.js';

import {
	buildDocs as build3doc,
	type BuildDocsOptions,
} from '@cxl/3doc/render.js';

export function buildDocs(options: BuildDocsOptions) {
	return observable<Output>(subs => {
		build3doc(
			{
				clean: true,
				summary: true,
				markdown: true,
				markdownSummary: false,
				cxlExtensions: true,
				...options,
			},
			file => {
				subs.next({
					path: file.name,
					source: Buffer.from(file.content),
				});
				return Promise.resolve();
			},
		).then(
			() => subs.complete(),
			e => subs.error(e),
		);
	});
}
