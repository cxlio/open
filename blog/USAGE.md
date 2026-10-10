## Usage

```js
import { buildBlog } from '@cxl/blog';

const outputs = await buildBlog({ postsDir: 'posts' });
```

`buildBlog()` returns a promise containing output files with `path` and `source`
properties. Replace subscription calls with `await buildBlog(config)`.
