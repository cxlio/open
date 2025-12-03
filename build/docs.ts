import { observable } from '../rx/index.js';

import type { Output } from './builder.js';

import type { BuildDocsOptions } from '@cxl/3doc/render.js';

export function buildDocs(options: BuildDocsOptions) {
	return observable<Output>(subs => {
		import('@cxl/3doc/render.js').then(({ buildDocs }) =>
			buildDocs(
				{
					clean: true,
					summary: true,
					markdown: true,
					cxlExtensions: true,
					...options,
				},
				file => {
					subs.next({
						path: file.name,
						source: Buffer.from(file.content),
					});
				},
			).then(() => subs.complete()),
		);
	});
}
