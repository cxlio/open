import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { rejects } from 'node:assert/strict';
import { spec } from '@cxl/spec';
import { buildBlog, dateShort, dateYMD, renderMarkdown, type PostsJson } from './index.js';

async function fixture(run: (dir: string) => Promise<void>) {
	const dir = await mkdtemp(join(tmpdir(), 'cxl-blog-'));
	try {
		await run(dir);
	} finally {
		await rm(dir, { recursive: true, force: true });
	}
}

function post(title: string, uuid: string, date = '2026-01-01') {
	return `# ${title}\n\n\`\`\`meta\nuuid: ${uuid}\ndate: ${date}\nauthor: Author\ntype: post\ntags: code typescript\n\`\`\`\n\nSummary paragraph.\n`;
}

export default spec('blog', s => {
	s.test('resolves outputs for an empty posts directory', async a => {
		await fixture(async dir => {
			const files = await buildBlog({ postsDir: dir });
			a.equal(files.length, 1);
			a.equal(files[0]?.path, 'posts.json');
			a.equalValues(JSON.parse(files[0]?.source.toString() ?? ''), {
				posts: [],
				tags: {},
				types: [],
			});
		});
	});

	s.test('renders title, heading anchors, nested headings, and raw HTML', a => {
		const { content } = renderMarkdown('# Title\n\n## Hello *there* ##\n\n> ## Nested\n\n### Small\n\n<div>Raw</div>\n');
		a.ok(content.includes('<blog-title>Title</blog-title>'));
		a.ok(content.includes('id="h2_hello-there"'));
		a.ok(content.includes('<em>there</em>'));
		a.ok(content.includes('id="h2_nested"'));
		a.ok(content.includes('<h3>Small</h3>'));
		a.ok(content.includes('<div>Raw</div>'));
		a.ok(renderMarkdown('Setext\n------\n').content.includes('id="h2_setext"'));
	});

	s.test('extracts metadata without leaking it between calls', a => {
		const { meta, content } = renderMarkdown(post('Title', 'id') + '\n```meta\nthreadId: thread\nredditId: reddit\n```\n');
		a.equal(meta.date, '2026-01-01T00:00:00.000Z');
		a.equal(meta.author, 'Author');
		a.ok(content.includes('<blog-tags>code typescript</blog-tags>'));
		a.ok(content.includes('<blog-social threadid="thread" redditid="reddit"></blog-social>'));
		a.equalValues(renderMarkdown('# Other').meta, {});
		a.throws(() => renderMarkdown('```meta\ndate: invalid\n```'));
	});

	s.test('renders demo and example fences', a => {
		const { content } = renderMarkdown('```demo:@cxl/ui\n<button>Run</button>\n```\n\n```example\nexample()\n```');
		a.ok(content.includes('<blog-demo libraries="@cxl/ui"><!--<button>Run</button>\n--></blog-demo>'));
		a.ok(content.includes('<blog-example><!--example()\n--></blog-example>'));
	});

	s.test('renders custom tables with formatted cells', a => {
		const { content } = renderMarkdown('| A | B |\n| - | - |\n| *x* | `y` |');
		a.ok(content.includes('<c-table><thead><c-tr><c-th>A</c-th><c-th>B</c-th>'));
		a.ok(content.includes('<c-tbody><c-tr><c-td><em>x</em></c-td><c-td><code>y</code></c-td>'));
	});

	s.test('preserves fence languages and escapes readable highlighted code', a => {
		const source = '```ts\nconst x = "<tag> &";\n```';
		a.ok(renderMarkdown(source).content.includes('<blog-code language="ts"><!--const x = "<tag> &";\n--></blog-code>'));
		a.ok(renderMarkdown(source, { highlight: true }).content.includes('<c-code mode="typescript">const x = &quot;&lt;tag&gt; &amp;&quot;;\n</c-code>'));
		a.ok(renderMarkdown('    plain <code>\n', { highlight: true }).content.includes('<c-code mode="text">plain &lt;code&gt;'));
		a.ok(renderMarkdown('```css\na {}\n```', { highlight: true }).content.includes('mode="css"'));
		a.ok(renderMarkdown('```JS\nconst x = 1;\n```', { highlight: true }).content.includes('mode="javascript"'));
	});

	s.test('formats dates', a => {
		a.equal(dateYMD('2026-01-02T12:00:00'), '2026-01-02');
		a.equal(dateShort('2026-01-02T12:00:00'), 'Jan 2, 2026');
		a.equal(dateShort(new Date('2026-01-02T12:00:00')), 'Jan 2, 2026');
	});

	s.test('generates sorted posts, tags, aliases, templates, and index', async a => {
		await fixture(async dir => {
			const postsDir = join(dir, 'posts');
			await mkdir(postsDir);
			await writeFile(join(postsDir, 'old.md'), post('Old', 'old', '2025-01-01'));
			await writeFile(join(postsDir, 'new.md'), post('New', 'new'));
			await writeFile(join(postsDir, 'ignored.txt'), 'ignore');
			const postTemplate = join(dir, 'template.html');
			const headerTemplate = join(dir, 'header.html');
			const index = join(dir, 'index.html');
			await writeFile(postTemplate, '__BLOG_TITLE__|__BLOG_BASEURL__|__BLOG_INDEXURL__|__BLOG_CANONICAL__|__BLOG_DEBUG__|__BLOG_SUMMARY__|__BLOG_CONTENT__');
			await writeFile(headerTemplate, '<!doctype html>');
			await writeFile(index, '__BLOG_TITLE__|__BLOG_TAGS__|__BLOG_INDEX__');
			const files = await buildBlog({ postsDir, postTemplate, headerTemplate, processIndex: [index], hrefPrefix: '/posts/', baseUrl: '/', indexUrl: '/index.html', canonicalUrl: 'https://example.com', debug: 'debug' });
			a.equal(files.length, 5);
			const data: PostsJson = JSON.parse(files[0]?.source.toString() ?? '');
			a.equalValues(data.posts.map(p => p.title), ['New', 'Old']);
			a.equalValues(data.tags.post, ['code', 'typescript']);
			a.equalValues(data.types, ['post']);
			a.equal(data.posts[0]?.content, undefined);
			const html = files.find(f => f.path === 'new-new/index.html')?.source.toString() ?? '';
			a.ok(html.startsWith('<!doctype html>New|/|/index.html|https://example.com/posts/new-new/|debug|Summary paragraph.|'));
			a.equal(files.find(f => f.path === 'new.html')?.source.toString(), html);
			const renderedIndex = await readFile(index, 'utf8');
			a.ok(renderedIndex.includes('Home|<c-chip size="-1">code</c-chip>'));
			a.ok(renderedIndex.indexOf('>New</a>') < renderedIndex.indexOf('>Old</a>'));
		});
	});

	s.test('supports multiple directories, HTML posts, and drafts', async a => {
		await fixture(async dir => {
			const second = join(dir, 'second');
			await mkdir(second);
			await writeFile(join(dir, 'draft.md'), 'Draft paragraph.');
			await writeFile(join(second, 'page.html'), '<blog-meta author="Author" date="2026-01-01" type="page"><blog-title>Page</blog-title><blog-summary>Summary</blog-summary><blog-tags>html</blog-tags>');
			const files = await buildBlog({ postsDir: [dir, second], includeContent: true });
			const data: PostsJson = JSON.parse(files[0]?.source.toString() ?? '');
			a.equal(data.posts.length, 2);
			a.ok(data.posts.every(p => p.content));
			const draft = data.posts.find(p => p.type === 'draft');
			a.equal(draft?.title, 'draft');
			a.equal(draft?.href, 'draft.html');
			a.ok(files.some(f => f.path === 'draft.html'));
			a.equal(data.posts.find(p => p.title === 'Page')?.summary, 'Summary');
		});
	});

	s.test('rejects missing UUIDs, duplicate UUIDs, and missing directories', async a => {
		await fixture(async dir => {
			await writeFile(join(dir, 'missing.md'), '# Missing\n\n```meta\ntype: post\n```');
			await rejects(buildBlog({ postsDir: dir }));
			await writeFile(join(dir, 'missing.md'), post('One', 'same'));
			await writeFile(join(dir, 'duplicate.md'), post('Two', 'same'));
			await rejects(buildBlog({ postsDir: dir }));
			await rejects(buildBlog({ postsDir: join(dir, 'absent') }));
			a.ok(true);
		});
	});
});
