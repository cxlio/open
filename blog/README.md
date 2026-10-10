# @cxl/blog 
	
[![npm version](https://badge.fury.io/js/%40cxl%2Fblog.svg)](https://badge.fury.io/js/%40cxl%2Fblog)

Static blog generation with Markdown, metadata, templates, and browser code highlighting.

## Project Details

-   Branch Version: [0.0.1](https://npmjs.com/package/@cxl/blog/v/0.0.1)
-   License: GPL-3.0
-   Documentation: [Link](https://cxlio.github.io/docs/@cxl/blog)
-   Report Issues: [Github](https://github.com/cxlio/open/issues)

## Installation

	npm install @cxl/blog

## Usage

```js
import { buildBlog } from '@cxl/blog';

const outputs = await buildBlog({ postsDir: 'posts' });
```

`buildBlog()` returns a promise containing output files with `path` and `source`
properties. Replace subscription calls with `await buildBlog(config)`.
