import type { Stats } from 'fs';
import { readdir, readFile, writeFile, stat } from 'fs/promises';
import { fromAsync } from '@cxl/rx';
import type { Output, Task } from '@cxl/build';
import { basename } from 'path';

import { compiler, program, type Node } from '@cxl/gbc.markdown';

export interface BlogConfig {
	postsDir?: string | string[];
	headerTemplate?: string;
	highlight?: boolean;
	includeContent?: boolean;
	hrefPrefix?: string;
	processIndex?: string[];
	postTemplate?: string;
	baseUrl?: string;
	indexUrl?: string;
	canonicalUrl?: string;
	debug?: string;
}

export interface PostsJson {
	posts: PostData[];
	tags: Record<string, string[]>;
	types: string[];
}

export interface Meta {
	uuid: string;
	date: string;
	author: string;
	version?: string;
	type?: string;
	summary?: string;
	tags?: string;
	threadId?: string;
	redditId?: string;
}

export interface Post {
	uuid?: string;
	id: string;
	title: string;
	date: string;
	version?: string;
	mtime: string;
	author: string;
	type: string;
	tags?: string;
	href?: string;
	content: string;
	summary: string;
}

export type PostData = {
	content: undefined | string;
} & Omit<Post, 'content'>;

const POST_REGEX = /\.(html|md)$/,
	TITLE_REGEX = /<blog-title>(.+)<\/blog-title>/,
	META_REGEX = /<blog-meta([^>]+?)>/,
	TAGS_REGEX = /<blog-tags>([^]*?)</,
	SUMMARY_TAG_REGEX = /<blog-summary>([^]*?)</m,
	SUMMARY_REGEX = /<p>([^]*?)<\/p/m,
	ATTR_REGEX = /(?:^|\s)([\w-]+)\s*=\s*"([^"]+)"/g;

const DefaultConfig = {
	postsDir: 'posts',
};

function escapeHtml(source: string) {
	return source.replace(/[&<>"']/g, value => {
		switch (value) {
			case '&': return '&amp;';
			case '<': return '&lt;';
			case '>': return '&gt;';
			case '"': return '&quot;';
			default: return '&#39;';
		}
	});
}

function html(source: string): Node {
	return { kind: 'html', block: false, source, start: 0, end: source.length, line: 0 };
}

function isMetaKey(key: string): key is keyof Meta {
	return ['uuid', 'date', 'author', 'version', 'type', 'summary', 'tags', 'threadId', 'redditId'].includes(key);
}

function codeMode(language: string) {
	const mode = language.toLowerCase();
	switch (mode) {
		case 'js': return 'javascript';
		case 'ts': return 'typescript';
		default: return mode || 'text';
	}
}

export function renderMarkdown(source: string, config?: BlogConfig) {
	const meta: Partial<Meta> = {};
	const root = program().parse(source).root;
	const children = (nodes: Node[]) => nodes.map(compiler).join('');

	function transform(node: Node): Node {
		node = transformChildren(node);
		if (node.kind === 'heading') {
			const content = children(node.children);
			if (node.level === 1) return html(`<blog-title>${content}</blog-title>`);
			if (node.level === 2) {
				const title = node.children.map(child => child.kind === 'text' ? child.value : '').join('');
				const id = `h2_${getPostId(title)}`;
				return html(`<a class="h2-anchor" id="${id}" href="#${id}"><h2>${content}</h2></a>`);
			}
		}
		if (node.kind === 'block') {
			const info = node.info ?? '';
			if (info === 'meta') {
				for (const match of node.value.matchAll(/^(\w+):\s*(.+)\s*/gm)) {
					const key = match[1] ?? '';
					if (!isMetaKey(key)) continue;
					const value = match[2] ?? '';
					meta[key] = key === 'date' ? new Date(value).toISOString() : value;
				}
				return html(meta.tags ? `<blog-tags>${escapeHtml(meta.tags)}</blog-tags>` : '');
			}
			if (info.startsWith('demo') || info.startsWith('example')) {
				const type = info.startsWith('demo') ? 'demo' : 'example';
				const libraries = info.split(':')[1];
				return html(`<blog-${type}${libraries ? ` libraries="${escapeHtml(libraries)}"` : ''}><!--${node.value}--></blog-${type}>`);
			}
			const language = info.trim().split(/\s/, 1).join('');
			return html(config?.highlight
				? `<c-code mode="${escapeHtml(codeMode(language))}">${escapeHtml(node.value)}</c-code>`
				: `<blog-code language="${escapeHtml(language)}"><!--${node.value}--></blog-code>`);
		}
		if (node.kind === 'table') {
			const header = node.header.map(value => `<c-th>${compiler(transform(value))}</c-th>`).join('');
			const rows = node.rows.map(row => `<c-tr>${row.map(value => `<c-td>${compiler(transform(value))}</c-td>`).join('')}</c-tr>`).join('');
			return html(`<c-table><thead><c-tr>${header}</c-tr></thead><c-tbody>${rows}</c-tbody></c-table>`);
		}
		if (node.kind === 'td' || node.kind === 'th') return html(children(node.children));
		return node;
	}

	function transformChildren(node: Node): Node {
		switch (node.kind) {
			case 'text':
				return { ...node, children: node.children?.map(transform) };
			case 'root':
			case 'p':
			case 'em':
			case 'strong':
			case 'ul':
			case 'ol':
			case 'li':
			case 'blockquote':
			case 'a':
			case 'img':
			case 'heading':
			case 'td':
			case 'th':
				return { ...node, children: node.children.map(transform) };
			default:
				return node;
		}
	}

	const content = compiler(transform(root)) + (meta.threadId || meta.redditId
		? `<blog-social threadid="${escapeHtml(meta.threadId ?? '')}" redditid="${escapeHtml(meta.redditId ?? '')}"></blog-social>`
		: '');
	return { meta, content };
}

function parseMeta(content: string) {
	const meta = content.match(META_REGEX)?.[1];
	if (!meta) return undefined;

	const result: Record<string, string> = {};
	let attrs;
	while ((attrs = ATTR_REGEX.exec(meta))) {
		const val =
			attrs[1] === 'date' ? new Date(attrs[2] ?? '').toISOString() : attrs[2] ?? '';
		result[attrs[1] ?? ''] = val;
	}
	return result;
}

function getPostId(title: string) {
	return title
		.replace(/[^\w]+/g, '-')
		.replace(/^-|-$/g, '')
		.toLowerCase();
}

function Html(_url: string, content: string, stat: Stats): Post {
	const meta = parseMeta(content) || {};
	const tags = content.match(TAGS_REGEX)?.[1]?.trim() || meta.tags;
	const title =
		content.match(TITLE_REGEX)?.[1] || meta.title || 'Untitled Post';
	const summary =
		content.match(SUMMARY_TAG_REGEX)?.[1]?.trim() ||
		meta.summary ||
		content.match(SUMMARY_REGEX)?.[1]?.trim() ||
		'';
	const type = meta.type || 'post';

	return {
		id: getPostId(title),
		title,
		summary,
		date: meta.date ?? stat.mtime.toISOString(),
		version: meta.version,
		uuid: meta.uuid || '',
		mtime: stat.mtime.toISOString(),
		author: meta.author || '',
		type,
		tags,
		href: meta.href,
		content,
	};
}

async function buildPosts(config: BlogConfig, posts: Post[]) {
	const HEADER = config.headerTemplate
		? await readFile(config.headerTemplate)
		: '';
	return posts.flatMap(p => {
		const source = Buffer.from(`${HEADER}${p.content}`);
		return p.uuid
			? [
					{
						path: `${p.uuid}-${p.id}/index.html`,
						source,
					},
					{
						path: `${p.uuid}.html`,
						source,
					},
			  ]
			: {
					path: `${p.id}.html`,
					source,
			  };
	});
}

async function build(config: BlogConfig): Promise<Output[]> {
	const uuids: string[] = [];
	const hrefPrefix = config.hrefPrefix ?? '';
	const postTemplate = config.postTemplate
		? await readFile(config.postTemplate, 'utf8')
		: undefined;

	function Markdown(url: string, source: string, stats: Stats) {
		const { meta, content } = renderMarkdown(source, config);
		const title =
			source.match(/^#\s+(.+)/)?.[1]?.trim() ||
			basename(url).replace(/\.md$/, '');
		const summary = (
			meta.summary ||
			content.match(SUMMARY_REGEX)?.[1]?.trim() ||
			''
		).replace(/"/g, '&quot;');
		const uuid = meta.uuid;

		if (meta.type === 'post') {
			if (!uuid) throw `Invalid UUID: ${title}`;
			if (uuids.includes(uuid)) throw `UUID Collision: ${title}`;
			uuids.push(uuid);
		}
		const id = getPostId(title);
		const href = `${hrefPrefix}${uuid ? `${uuid}-${id}/` : `${id}.html`}`;

		return {
			id,
			title,
			summary,
			date: meta.date || stats.mtime.toISOString(),
			version: meta.version,
			uuid,
			mtime: stats.mtime.toISOString(),
			author: meta.author || '',
			type: meta.type || (meta.date ? 'post' : 'draft'),
			tags: meta.tags || '',
			href,
			content: postTemplate
				? postTemplate
						.replace(/__BLOG_CONTENT__/, content)
						.replace(/__BLOG_BASEURL__/g, config.baseUrl ?? '')
						.replace(/__BLOG_SUMMARY__/g, summary)
						.replace(/__BLOG_INDEXURL__/g, config.indexUrl ?? '')
						.replace(/__BLOG_DEBUG__/g, config.debug ?? '')
						.replace(
							/__BLOG_CANONICAL__/g,
							`${config.canonicalUrl ?? ''}${href}`,
						)
						.replace(/__BLOG_TITLE__/g, title)
				: content,
		};
	}

	async function getPostData(url: string): Promise<Post> {
		const [source, stats] = await Promise.all([
			readFile(url, 'utf8'),
			stat(url),
		]);

		return url.endsWith('.md')
			? Markdown(url, source, stats)
			: Html(url, source, stats);
	}
	async function buildFromSource(postsDir: string) {
		const files = (await readdir(postsDir)).filter(f => POST_REGEX.test(f));
		return await Promise.all(
			files.map(f => getPostData(`${postsDir}/${f}`)),
		);
	}

	const postsDir = config.postsDir || DefaultConfig.postsDir;
	const posts = Array.isArray(postsDir)
		? (await Promise.all(postsDir.map(buildFromSource))).flat()
		: await buildFromSource(postsDir);

	const postsFiles = await buildPosts(config, posts);
	const tags: Record<string, string[]> = {};
	const types = new Set<string>();

	posts.sort((a, b) => (a.date > b.date ? -1 : 1));
	posts.forEach(a => {
			const typeTags = tags[a.type] || (tags[a.type] = []);
			if (a.tags)
				for (const tag of a.tags.split(' '))
					if (!typeTags.includes(tag)) typeTags.push(tag);

			if (a.type === 'post' && !a.uuid)
				throw new Error(`Post "${a.title}" does not contain a uuid`);

			types.add(a.type);
		});

	const postsJson: PostsJson = {
		posts: config.includeContent
			? posts
			: posts.map(p => ({ ...p, content: undefined })),
		tags,
		types: Array.from(types),
	};

	if (config.processIndex) await processIndex(config.processIndex, postsJson);

	return [
		{
			path: 'posts.json',
			source: Buffer.from(JSON.stringify(postsJson)),
		},
		...postsFiles,
	];
}

export function dateYMD(date: string): string {
	const d = new Date(date);
	const pad = (n: number) => n.toString().padStart(2, '0');
	return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export function dateShort(date: Date | string): string {
	return new Date(date).toLocaleDateString('en-US', {
		year: 'numeric',
		month: 'short',
		day: 'numeric',
	});
}

function processIndex(files: string[], { posts, tags }: PostsJson) {
	const index = posts
		.map(
			p => `
	<article data-tags="${
		p.tags
	}" itemscope itemtype="https://schema.org/BlogPosting">
  <header>
    <h2 itemprop="headline">
      <a href="${p.href}" itemprop="url">${p.title}</a>
    </h2>
    <p>
      <time datetime="${dateYMD(p.date)}" itemprop="datePublished">${dateShort(
			p.date,
		)}</time>
    </p>
  </header>
  <p itemprop="description">${p.summary}</p>
</article>`,
		)
		.join('');
	const tagsHtml =
		tags.post
			?.sort()
			.map(t => `<c-chip size="-1">${t}</c-chip>`)
			.join('') ?? '';

	return Promise.all(
		files.map(async filePath => {
			const source = await readFile(filePath, 'utf8');
			const newSource = source
				.replace(/__BLOG_TITLE__/, 'Home')
				.replace(/__BLOG_INDEX__/, index)
				.replace(/__BLOG_TAGS__/, tagsHtml);
			await writeFile(filePath, newSource);
		}),
	);
}

export function buildBlog(config: BlogConfig): Task {
	return fromAsync(() => build(config)).mergeMap(outputs => outputs);
}
