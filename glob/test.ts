import { TestApi, spec } from '../spec/index.js';
import { Options, globToRegex } from './index.js';

export default spec('glob', s => {
	function isMatch(
		a: TestApi,
		term: string,
		glob: string | string[],
		op?: Options,
	) {
		const regex = globToRegex(glob, op);
		a.ok(
			regex.test(term),
			`${JSON.stringify(term)} should match glob ${JSON.stringify(
				glob,
			)} (${regex.source})`,
		);
	}
	function isNotMatch(a: TestApi, term: string, glob: string | string[]) {
		const regex = globToRegex(glob);
		a.ok(
			!regex.test(term),
			`"${term}" should not match glob ${JSON.stringify(glob)} (${
				regex.source
			})`,
		);
	}

	function match(list: string[], glob: string) {
		const regex = globToRegex(glob);
		return list.filter(i => regex.test(i));
	}

	s.test('gitignore', a => {
		isMatch(a, 'dist', 'dist/', { gitignore: true });
		isMatch(a, 'dist', '(dist/|node_modules)', { gitignore: true });
		isMatch(a, 'node_modules', '(dist/|node_modules)', { gitignore: true });
	});

	s.test('should return true when any of the patterns match', a => {
		isMatch(a, '.', ['.', 'foo']);
		isMatch(a, 'a', ['a', 'foo']);
		isMatch(a, 'ab', ['*', 'foo', 'bar']);
		isMatch(a, 'ab', ['*b', 'foo', 'bar']);
		isMatch(a, 'ab', ['./*', 'foo', 'bar']);
		isMatch(a, 'ab', ['a*', 'foo', 'bar']);
		isMatch(a, 'ab', ['ab', 'foo']);

		isNotMatch(a, '/ab', ['/a', 'foo']);
		isNotMatch(a, '/ab', ['?/?', 'foo', 'bar']);
		isNotMatch(a, '/ab', ['a/*', 'foo', 'bar']);
		isNotMatch(a, 'a/b/c', ['a/b', 'foo']);
		isNotMatch(a, 'ab', ['*/*', 'foo', 'bar']);
		isNotMatch(a, 'ab', ['/a', 'foo', 'bar']);
		isNotMatch(a, 'ab', ['a', 'foo']);
		isNotMatch(a, 'ab', ['b', 'foo']);
		isNotMatch(a, 'ab', ['c', 'foo', 'bar']);
		isNotMatch(a, 'abcd', ['ab', 'foo']);
		isNotMatch(a, 'abcd', ['bc', 'foo']);
		isNotMatch(a, 'abcd', ['c', 'foo']);
		isNotMatch(a, 'abcd', ['cd', 'foo']);
		isNotMatch(a, 'abcd', ['d', 'foo']);
		isNotMatch(a, 'abcd', ['f', 'foo', 'bar']);
		isNotMatch(a, 'ef', ['/*', 'foo', 'bar']);
	});

	s.test('File extensions', a => {
		isNotMatch(a, '.c.md', '*.md');
		isNotMatch(a, '.c.md', '.c.');
		isNotMatch(a, '.c.md', '.md');
		isNotMatch(a, '.md', '*.md');
		isNotMatch(a, '.md', '.m');
		isNotMatch(a, 'a/b/c.md', '*.md');
		isNotMatch(a, 'a/b/c.md', '.md');
		isNotMatch(a, 'a/b/c.md', 'a/*.md');
		isNotMatch(a, 'a/b/c/c.md', '*.md');
		isNotMatch(a, 'a/b/c/c.md', 'c.js');
		isMatch(a, '.c.md', '.*.md');
		isMatch(a, '.md', '.md');
		isMatch(a, 'a/b/c.js', 'a/**/*.*');
		isMatch(a, 'a/b/c.md', '**/*.md');
		isMatch(a, 'a/b/c.md', 'a/*/*.md');
		isMatch(a, 'c.md', '*.md');
	});

	s.test('File names', a => {
		isMatch(a, 'a.b', 'a.b');
		isMatch(a, 'a.b', '*.b');
		isMatch(a, 'a.b', 'a.*');
		isMatch(a, 'a.b', '*.*');
		isMatch(a, 'a-b.c-d', 'a*.c*');
		isMatch(a, 'a-b.c-d', '*b.*d');
		isMatch(a, 'a-b.c-d', '*.*');
		isMatch(a, 'a-b.c-d', '*.*-*');
		isMatch(a, 'a-b.c-d', '*-*.*-*');
		isMatch(a, 'a-b.c-d', '*.c-*');
		isMatch(a, 'a-b.c-d', '*.*-d');
		isMatch(a, 'a-b.c-d', 'a-*.*-d');
		isMatch(a, 'a-b.c-d', '*-b.c-*');
		isMatch(a, 'a-b.c-d', '*-b*c-*');
		isNotMatch(a, 'a-b.c-d', '*-bc-*');
	});

	s.test('Common glob patterns', a => {
		isNotMatch(a, '/ab', './*/');
		isNotMatch(a, '/ef', '*');
		isNotMatch(a, 'ab', './*/');
		isNotMatch(a, 'ef', '/*');
		isMatch(a, '/ab', '/*');
		isMatch(a, '/cd', '/*');
		isMatch(a, 'ab', '*');
		isMatch(a, 'ab', './*');
		isMatch(a, 'ab', 'ab');
		isMatch(a, 'ab/', './*/');
		isNotMatch(a, 'zzjs', 'z*.js');
		isNotMatch(a, 'zzjs', '*z.js');
	});

	s.test('Non glob patterns', a => {
		// Non-glob patterns
		isMatch(a, '.', '.');
		isMatch(a, '/a', '/a');
		isNotMatch(a, '/ab', '/a');
		isMatch(a, 'a', 'a');
		isNotMatch(a, 'ab', '/a');
		isNotMatch(a, 'ab', 'a');
		isMatch(a, 'ab', 'ab');
		isNotMatch(a, 'abcd', 'cd');
		isNotMatch(a, 'abcd', 'bc');
		isNotMatch(a, 'abcd', 'ab');
	});

	s.test('should match globstars', a => {
		isMatch(a, 'a/b/c/z.js', '**/*.js');
		isMatch(a, 'a/b/z.js', '**/*.js');
		isMatch(a, 'a/z.js', '**/*.js');
		isMatch(a, 'a/b/c/d/e/z.js', 'a/b/**/*.js');
		isMatch(a, 'a/b/c/d/z.js', 'a/b/**/*.js');
		isMatch(a, 'a/b/c/z.js', 'a/b/c/**/*.js');
		isMatch(a, 'a/b/c/z.js', 'a/b/c**/*.js');
		isMatch(a, 'a/b/c/z.js', 'a/b/**/*.js');
		isMatch(a, 'a/b/z.js', 'a/b/**/*.js');

		isNotMatch(a, 'a/z.js', 'a/b/**/*.js');
		isNotMatch(a, 'z.js', 'a/b/**/*.js');

		// https://github.com/micromatch/micromatch/issues/15
		isMatch(a, 'z.js', 'z*');
		isMatch(a, 'z.js', '**/z*');
		isMatch(a, 'z.js', '**/z*.js');
		isMatch(a, 'z.js', '**/*.js');
		isMatch(a, 'foo', '**/foo');
	});
	s.test('dot files', a => {
		a.test(
			'should not match dotfiles when a leading dot is not defined in a path segment',
			a => {
				isNotMatch(a, '.a', '(a)*');
				isNotMatch(a, '.a', '*(a|b)');
				isNotMatch(a, '.a', '*.md');
				isNotMatch(a, '.a', '*[a]');
				isNotMatch(a, '.a', '*[a]*');
				isNotMatch(a, '.a', '*a');
				isNotMatch(a, '.a', '*a*');
				isNotMatch(a, '.a.md', 'a/b/c/*.md');
				isNotMatch(a, '.ab', '*.*');
				isNotMatch(a, '.abc', '.a');
				isNotMatch(a, '.ba', '.a');
				isNotMatch(a, '.c.md', '*.md');
				isNotMatch(a, '.md', 'a/b/c/*.md');
				isNotMatch(a, '.txt', '.md');
				isNotMatch(a, '.verb.txt', '*.md');
				isNotMatch(a, 'a/.c.md', '*.md');
				isNotMatch(a, 'a/b/d/.md', 'a/b/c/*.md');
				isMatch(a, '.a', '.a');
				isMatch(a, '.ab', '.*');
				isMatch(a, '.ab', '.a*');
				isMatch(a, '.b', '.b*');
				isMatch(a, '.md', '.md');
				isMatch(a, 'a/.c.md', 'a/.c.md');
				isMatch(a, 'a/b/c/.xyz.md', 'a/b/c/.*.md');
				isMatch(a, 'a/b/c/d.a.md', 'a/b/c/*.md');
			},
		);
	});
	s.test('should match zero or more directories', a => {
		isNotMatch(a, 'a/b/c/d/', 'a/b/**/f');
		isMatch(a, 'a', 'a/**');
		isMatch(a, 'a', '**');
		isMatch(a, 'a/', '**');
		isMatch(a, 'a/b-c/d/e/z.js', 'a/b-*/**/z.js');
		isMatch(a, 'a/b-c/z.js', 'a/b-*/**/z.js');
		isMatch(a, 'a/b/c/d', '**');
		isMatch(a, 'a/b/c/d/', '**');
		isMatch(a, 'a/b/c/d/', '**/**');
		isMatch(a, 'a/b/c/d/', '**/b/**');
		isMatch(a, 'a/b/c/d/', 'a/b/**');
		isMatch(a, 'a/b/c/d/', 'a/b/**/');
		isMatch(a, 'a/b/c/d/', 'a/b/**/c/**/');
		isMatch(a, 'a/b/c/d/', 'a/b/**/c/**/d/');
		isMatch(a, 'a/b/c/d/e.f', 'a/b/**/**/*.*');
		isMatch(a, 'a/b/c/d/e.f', 'a/b/**/*.*');
		isMatch(a, 'a/b/c/d/e.f', 'a/b/**/c/**/d/*.*');
		isMatch(a, 'a/b/c/d/e.f', 'a/b/**/d/**/*.*');
		isMatch(a, 'a/b/c/d/g/e.f', 'a/b/**/d/**/*.*');
		isMatch(a, 'a/b/c/d/g/g/e.f', 'a/b/**/d/**/*.*');
	});

	s.test('should match slashes', a => {
		isNotMatch(a, 'bar/baz/foo', '*/foo');
		isNotMatch(a, 'deep/foo/bar', '**/bar/*');
		isNotMatch(a, 'deep/foo/bar/baz/x', '*/bar/**');
		isNotMatch(a, 'foo/bar', 'foo?bar');
		isNotMatch(a, 'foo/bar/baz', '**/bar*');
		isNotMatch(a, 'foo/bar/baz', '**/bar**');
		isNotMatch(a, 'foo/baz/bar', 'foo**bar');
		isNotMatch(a, 'foo/baz/bar', 'foo*bar');
		isNotMatch(a, 'deep/foo/bar/baz', '**/bar/*/');
		//assert(
		//	!isMatch('deep/foo/bar/baz/', '**/ bar; /*', { strictSlashes: true })
		//);
		isMatch(a, 'deep/foo/bar/baz/', '**/bar/*');
		isMatch(a, 'deep/foo/bar/baz', '**/bar/*');
		isMatch(a, 'foo', 'foo/**');
		isMatch(a, 'deep/foo/bar/baz/', '**/bar/*{,/}');
		isMatch(a, 'a/b/j/c/z/x.md', 'a/**/j/**/z/*.md');
		isMatch(a, 'a/j/z/x.md', 'a/**/j/**/z/*.md');
		isMatch(a, 'bar/baz/foo', '**/foo');
		isMatch(a, 'deep/foo/bar/', '**/bar/**');
		isMatch(a, 'deep/foo/bar/baz', '**/bar/*');
		isMatch(a, 'deep/foo/bar/baz/', '**/bar/*/');
		isMatch(a, 'deep/foo/bar/baz/', '**/bar/**');
		isMatch(a, 'deep/foo/bar/baz/x', '**/bar/*/*');
		isMatch(a, 'foo/b/a/z/bar', 'foo/**/**/bar');
		isMatch(a, 'foo/b/a/z/bar', 'foo/**/bar');
		isMatch(a, 'foo/bar', 'foo/**/**/bar');
		isMatch(a, 'foo/bar', 'foo/**/bar');
		isMatch(a, 'foo/bar', 'foo[/]bar');
		isMatch(a, 'foo/bar/baz/x', '*/bar/**');
		isMatch(a, 'foo/baz/bar', 'foo/**/**/bar');
		isMatch(a, 'foo/baz/bar', 'foo/**/bar');
		isMatch(a, 'foobazbar', 'foo**bar');
		isMatch(a, 'XXX/foo', '**/foo');

		isMatch(a, 'foo//baz.md', 'foo//baz.md');
		isMatch(a, 'foo//baz.md', 'foo//*baz.md');
		isMatch(a, 'foo//baz.md', 'foo{/,//}baz.md');
		isMatch(a, 'foo/baz.md', 'foo{/,//}baz.md');
		isNotMatch(a, 'foo//baz.md', 'foo/+baz.md');
		isNotMatch(a, 'foo//baz.md', 'foo//+baz.md');
		isNotMatch(a, 'foo//baz.md', 'foo/baz.md');
		isNotMatch(a, 'foo/baz.md', 'foo//baz.md');

		isNotMatch(a, 'aaa/bbb', 'aaa?bbb');
	});

	s.test('braces', a => {
		a.test('should treat single-set braces as literals', a => {
			isMatch(a, 'a {abc} b', 'a {abc} b');
			isMatch(a, 'a {a-b-c} b', 'a {a-b-c} b');
			isMatch(a, 'a {a.c} b', 'a {a.c} b');
		});

		a.test('should match literal braces when escaped', a => {
			isMatch(a, 'a {1,2}', 'a \\{1,2\\}');
			isMatch(a, 'a {a..b}', 'a \\{a..b\\}');
		});

		a.test('should match using brace patterns', a => {
			isNotMatch(a, 'a/c', 'a/{a,b}');
			isNotMatch(a, 'b/b', 'a/{a,b,c}');
			isNotMatch(a, 'b/b', 'a/{a,b}');
			isMatch(a, 'a/a', 'a/{a,b}');
			isMatch(a, 'a/b', 'a/{a,b}');
			isMatch(a, 'a/c', 'a/{a,b,c}');
		});

		a.test('should support brace ranges', a => {
			isMatch(a, 'a/a', 'a/{a..c}');
			isMatch(a, 'a/b', 'a/{a..c}');
			isMatch(a, 'a/c', 'a/{a..c}');
		});

		a.test('should support Kleene stars', a => {
			isMatch(a, 'ab', '{ab,c}*');
			isMatch(a, 'abab', '{ab,c}*');
			isMatch(a, 'abc', '{ab,c}*');
			isMatch(a, 'c', '{ab,c}*');
			isMatch(a, 'cab', '{ab,c}*');
			isMatch(a, 'cc', '{ab,c}*');
			isMatch(a, 'ababab', '{ab,c}*');
			isMatch(a, 'ababc', '{ab,c}*');
			isMatch(a, 'abcab', '{ab,c}*');
			isMatch(a, 'abcc', '{ab,c}*');
			isMatch(a, 'cabab', '{ab,c}*');
			isMatch(a, 'cabc', '{ab,c}*');
			isMatch(a, 'ccab', '{ab,c}*');
			isMatch(a, 'ccc', '{ab,c}*');
		});

		a.test('should not convert braces inside brackets', a => {
			isMatch(a, 'foo{}baz', 'foo[{a,b}]+baz');
			isMatch(a, '{a}{b}{c}', '[abc{}]+');
		});

		a.test('should support braces containing slashes', a => {
			isMatch(a, 'a', '{/,}a/**');
			isMatch(a, 'aa.txt', 'a{a,b/}*.txt');
			isMatch(a, 'ab/.txt', 'a{a,b/}*.txt');
			isMatch(a, 'ab/a.txt', 'a{a,b/}*.txt');
			isMatch(a, 'a/', 'a/**{/,}');
			isMatch(a, 'a/a', 'a/**{/,}');
			isMatch(a, 'a/a/', 'a/**{/,}');
		});

		a.test('should support braces with empty elements', a => {
			isNotMatch(a, 'abc.txt', 'a{,b}.txt');
			isNotMatch(a, 'abc.txt', 'a{a,b,}.txt');
			isNotMatch(a, 'abc.txt', 'a{b,}.txt');
			isMatch(a, 'a.txt', 'a{,b}.txt');
			isMatch(a, 'a.txt', 'a{b,}.txt');
			isMatch(a, 'aa.txt', 'a{a,b,}.txt');
			isMatch(a, 'aa.txt', 'a{a,b,}.txt');
			isMatch(a, 'ab.txt', 'a{,b}.txt');
			isMatch(a, 'ab.txt', 'a{b,}.txt');
		});

		a.test('should support braces with slashes and empty elements', a => {
			isMatch(a, 'a.txt', 'a{,/}*.txt');
			isMatch(a, 'ab.txt', 'a{,/}*.txt');
			isMatch(a, 'a/b.txt', 'a{,/}*.txt');
			isMatch(a, 'a/ab.txt', 'a{,/}*.txt');
		});

		a.test('should support braces with stars', a => {
			isMatch(a, 'a.txt', 'a{,.*{foo,db},\\(bar\\)}.txt');
			isNotMatch(a, 'adb.txt', 'a{,.*{foo,db},\\(bar\\)}.txt');
			isMatch(a, 'a.db.txt', 'a{,.*{foo,db},\\(bar\\)}.txt');

			isMatch(a, 'a.txt', 'a{,*.{foo,db},\\(bar\\)}.txt');
			isNotMatch(a, 'adb.txt', 'a{,*.{foo,db},\\(bar\\)}.txt');
			isMatch(a, 'a.db.txt', 'a{,*.{foo,db},\\(bar\\)}.txt');

			isMatch(a, 'a', 'a{,.*{foo,db},\\(bar\\)}');
			isNotMatch(a, 'adb', 'a{,.*{foo,db},\\(bar\\)}');
			isMatch(a, 'a.db', 'a{,.*{foo,db},\\(bar\\)}');

			isMatch(a, 'a', 'a{,*.{foo,db},\\(bar\\)}');
			isNotMatch(a, 'adb', 'a{,*.{foo,db},\\(bar\\)}');
			isMatch(a, 'a.db', 'a{,*.{foo,db},\\(bar\\)}');

			isNotMatch(a, 'a', '{,.*{foo,db},\\(bar\\)}');
			isNotMatch(a, 'adb', '{,.*{foo,db},\\(bar\\)}');
			isNotMatch(a, 'a.db', '{,.*{foo,db},\\(bar\\)}');
			isMatch(a, '.db', '{,.*{foo,db},\\(bar\\)}');

			isNotMatch(a, 'a', '{,*.{foo,db},\\(bar\\)}');
			isMatch(a, 'a', '{*,*.{foo,db},\\(bar\\)}');
			isNotMatch(a, 'adb', '{,*.{foo,db},\\(bar\\)}');
			isMatch(a, 'a.db', '{,*.{foo,db},\\(bar\\)}');
		});

		a.test('should support braces in patterns with globstars', a => {
			isNotMatch(a, 'a/b/c/xyz.md', 'a/b/**/c{d,e}/**/xyz.md');
			isNotMatch(a, 'a/b/d/xyz.md', 'a/b/**/c{d,e}/**/xyz.md');
			isMatch(a, 'a/b/cd/xyz.md', 'a/b/**/c{d,e}/**/xyz.md');
			isMatch(a, 'a/b/c/xyz.md', 'a/b/**/{c,d,e}/**/xyz.md');
			isMatch(a, 'a/b/d/xyz.md', 'a/b/**/{c,d,e}/**/xyz.md');
		});

		a.test(
			'should support braces with globstars, slashes and empty elements',
			a => {
				isMatch(a, 'a.txt', 'a{,/**/}*.txt');
				isMatch(a, 'a/b.txt', 'a{,/**/,/}*.txt');
				isMatch(a, 'a/x/y.txt', 'a{,/**/}*.txt');
				isNotMatch(a, 'a/x/y/z', 'a{,/**/}*.txt');
			},
		);

		a.test('should support braces with globstars and empty elements', a => {
			isMatch(a, 'a/b/foo/bar/baz.qux', 'a/b{,/**}/bar{,/**}/*.*');
			isMatch(a, 'a/b/bar/baz.qux', 'a/b{,/**}/bar{,/**}/*.*');
		});

		a.test('should support Kleene plus', a => {
			isMatch(a, 'ab', '{ab,c}+');
			isMatch(a, 'abab', '{ab,c}+');
			isMatch(a, 'abc', '{ab,c}+');
			isMatch(a, 'c', '{ab,c}+');
			isMatch(a, 'cab', '{ab,c}+');
			isMatch(a, 'cc', '{ab,c}+');
			isMatch(a, 'ababab', '{ab,c}+');
			isMatch(a, 'ababc', '{ab,c}+');
			isMatch(a, 'abcab', '{ab,c}+');
			isMatch(a, 'abcc', '{ab,c}+');
			isMatch(a, 'cabab', '{ab,c}+');
			isMatch(a, 'cabc', '{ab,c}+');
			isMatch(a, 'ccab', '{ab,c}+');
			isMatch(a, 'ccc', '{ab,c}+');
			isMatch(a, 'ccc', '{a,b,c}+');

			isMatch(a, 'a', '{a,b,c}+');
			isMatch(a, 'b', '{a,b,c}+');
			isMatch(a, 'c', '{a,b,c}+');
			isMatch(a, 'aa', '{a,b,c}+');
			isMatch(a, 'ab', '{a,b,c}+');
			isMatch(a, 'ac', '{a,b,c}+');
			isMatch(a, 'ba', '{a,b,c}+');
			isMatch(a, 'bb', '{a,b,c}+');
			isMatch(a, 'bc', '{a,b,c}+');
			isMatch(a, 'ca', '{a,b,c}+');
			isMatch(a, 'cb', '{a,b,c}+');
			isMatch(a, 'cc', '{a,b,c}+');
			isMatch(a, 'aaa', '{a,b,c}+');
			isMatch(a, 'aab', '{a,b,c}+');
			isMatch(a, 'abc', '{a,b,c}+');
		});

		a.test('should support braces', a => {
			isMatch(a, 'a', '{a,b,c}');
			isMatch(a, 'b', '{a,b,c}');
			isMatch(a, 'c', '{a,b,c}');
			isNotMatch(a, 'aa', '{a,b,c}');
			isNotMatch(a, 'bb', '{a,b,c}');
			isNotMatch(a, 'cc', '{a,b,c}');
		});
	});

	s.test('brackets', a => {
		a.test('should support stars following brackets', a => {
			isMatch(a, 'a', '[a]*');
			isMatch(a, 'aa', '[a]*');
			isMatch(a, 'aaa', '[a]*');
			isMatch(a, 'az', '[a-z]*');
			isMatch(a, 'zzz', '[a-z]*');
		});

		a.test('should match slashes defined in brackets', a => {
			isMatch(a, 'foo/bar', 'foo[/]bar');
			isMatch(a, 'foo/bar/', 'foo[/]bar[/]');
			isMatch(a, 'foo/bar/baz', 'foo[/]bar[/]baz');
		});

		a.test('should not match slashes following brackets', a => {
			isNotMatch(a, 'a/b', '[a]*');
		});
	});

	s.test('parens (non-extglobs)', a => {
		a.test('should support stars following parens', a => {
			isMatch(a, 'a', '(a)*');
			isMatch(a, 'az', '(a)*');
			isNotMatch(a, 'zz', '(a)*');
			isMatch(a, 'ab', '(a|b)*');
			isMatch(a, 'abc', '(a|b)*');
			isMatch(a, 'aa', '(a)*');
			isMatch(a, 'aaab', '(a|b)*');
			isMatch(a, 'aaabbb', '(a|b)*');
		});

		a.test('should not match slashes with single stars', a => {
			isNotMatch(a, 'a/b', '(a)*');
			isNotMatch(a, 'a/b', '(a|b)*');
		});
	});

	s.test('stars', a => {
		a.test(
			'should respect dots defined in glob pattern (micromatch/#23)',
			a => {
				isMatch(a, 'z.js', 'z*');
				isNotMatch(a, 'zzjs', 'z*.js');
				isNotMatch(a, 'zzjs', '*z.js');
			},
		);

		a.test('should match anything except slashes and leading dots', a => {
			isNotMatch(a, 'a/b/c/z.js', '*.js');
			isNotMatch(a, 'a/b/z.js', '*.js');
			isNotMatch(a, 'a/z.js', '*.js');
			isMatch(a, 'z.js', '*.js');

			isNotMatch(a, 'a/.ab', '*/*');
			isNotMatch(a, '.ab', '*');

			isMatch(a, 'z.js', 'z*.js');
			isMatch(a, 'a/z', '*/*');
			isMatch(a, 'a/z.js', '*/z*.js');
			isMatch(a, 'a/z.js', 'a/z*.js');

			isMatch(a, 'ab', '*');
			isMatch(a, 'abc', '*');

			isNotMatch(a, 'bar', 'f*');
			isNotMatch(a, 'foo', '*r');
			isNotMatch(a, 'foo', 'b*');
			isNotMatch(a, 'foo/bar', '*');
			isMatch(a, 'abc', '*c');
			isMatch(a, 'abc', 'a*');
			isMatch(a, 'abc', 'a*c');
			isMatch(a, 'bar', '*r');
			isMatch(a, 'bar', 'b*');
			isMatch(a, 'foo', 'f*');
		});

		a.test('should match spaces', a => {
			isMatch(a, 'one abc two', '*abc*');
			isMatch(a, 'a         b', 'a*b');
		});

		a.test(
			'should support multiple non-consecutive stars in a path segment',
			a => {
				isNotMatch(a, 'foo', '*a*');
				isMatch(a, 'bar', '*a*');
				isMatch(a, 'oneabctwo', '*abc*');
				isNotMatch(a, 'a-b.c-d', '*-bc-*');
				isMatch(a, 'a-b.c-d', '*-*.*-*');
				isMatch(a, 'a-b.c-d', '*-b*c-*');
				isMatch(a, 'a-b.c-d', '*-b.c-*');
				isMatch(a, 'a-b.c-d', '*.*');
				isMatch(a, 'a-b.c-d', '*.*-*');
				isMatch(a, 'a-b.c-d', '*.*-d');
				isMatch(a, 'a-b.c-d', '*.c-*');
				isMatch(a, 'a-b.c-d', '*b.*d');
				isMatch(a, 'a-b.c-d', 'a*.c*');
				isMatch(a, 'a-b.c-d', 'a-*.*-d');
				isMatch(a, 'a.b', '*.*');
				isMatch(a, 'a.b', '*.b');
				isMatch(a, 'a.b', 'a.*');
				isMatch(a, 'a.b', 'a.b');
			},
		);

		a.test('should support multiple stars in a segment', a => {
			isNotMatch(a, 'a-b.c-d', '**-bc-**');
			isMatch(a, 'a-b.c-d', '**-**.**-**');
			isMatch(a, 'a-b.c-d', '**-b**c-**');
			isMatch(a, 'a-b.c-d', '**-b.c-**');
			isMatch(a, 'a-b.c-d', '**.**');
			isMatch(a, 'a-b.c-d', '**.**-**');
			isMatch(a, 'a-b.c-d', '**.**-d');
			isMatch(a, 'a-b.c-d', '**.c-**');
			isMatch(a, 'a-b.c-d', '**b.**d');
			isMatch(a, 'a-b.c-d', 'a**.c**');
			isMatch(a, 'a-b.c-d', 'a-**.**-d');
			isMatch(a, 'a.b', '**.**');
			isMatch(a, 'a.b', '**.b');
			isMatch(a, 'a.b', 'a.**');
			isMatch(a, 'a.b', 'a.b');
		});

		a.test(
			'should return true when one of the given patterns matches the string',
			a => {
				isMatch(a, '/ab', '*/*');
				isMatch(a, '.', '.');
				isNotMatch(a, 'a/.b', 'a/');
				isMatch(a, '/ab', '/*');
				isMatch(a, '/ab', '/??');
				isMatch(a, '/ab', '/?b');
				isMatch(a, '/cd', '/*');
				isMatch(a, 'a', 'a');
				isMatch(a, 'a/.b', 'a/.*');
				isMatch(a, 'a/b', '?/?');
				isMatch(a, 'a/b/c/d/e/j/n/p/o/z/c.md', 'a/**/j/**/z/*.md');
				isMatch(a, 'a/b/c/d/e/z/c.md', 'a/**/z/*.md');
				isMatch(a, 'a/b/c/xyz.md', 'a/b/c/*.md');
				isMatch(a, 'a/b/c/xyz.md', 'a/b/c/*.md');
				isMatch(a, 'a/b/z/.a', 'a/*/z/.a');
				isNotMatch(a, 'a/b/z/.a', 'bz');
				isMatch(a, 'a/bb.bb/aa/b.b/aa/c/xyz.md', 'a/**/c/*.md');
				isMatch(a, 'a/bb.bb/aa/bb/aa/c/xyz.md', 'a/**/c/*.md');
				isMatch(a, 'a/bb.bb/c/xyz.md', 'a/*/c/*.md');
				isMatch(a, 'a/bb/c/xyz.md', 'a/*/c/*.md');
				isMatch(a, 'a/bbbb/c/xyz.md', 'a/*/c/*.md');
				isMatch(a, 'aaa', '*');
				isMatch(a, 'ab', '*');
				isMatch(a, 'ab', 'ab');
			},
		);

		a.test(
			'should return false when the path does not match the pattern',
			a => {
				isNotMatch(a, '/ab', ['*/']);
				isNotMatch(a, '/ab', ['*/a']);
				isNotMatch(a, '/ab', ['/']);
				isNotMatch(a, '/ab', ['/?']);
				isNotMatch(a, '/ab', ['/a']);
				isNotMatch(a, '/ab', ['?/?']);
				isNotMatch(a, '/ab', ['a/*']);
				isNotMatch(a, 'a/.b', ['a/']);
				isNotMatch(a, 'a/b/c', ['a/*']);
				isNotMatch(a, 'a/b/c', ['a/b']);
				isNotMatch(a, 'a/b/c/d/e/z/c.md', ['b/c/d/e']);
				isNotMatch(a, 'a/b/z/.a', ['b/z']);
				isNotMatch(a, 'ab', ['*/*']);
				isNotMatch(a, 'ab', ['/a']);
				isNotMatch(a, 'ab', ['a']);
				isNotMatch(a, 'ab', ['b']);
				isNotMatch(a, 'ab', ['c']);
				isNotMatch(a, 'abcd', ['ab']);
				isNotMatch(a, 'abcd', ['bc']);
				isNotMatch(a, 'abcd', ['c']);
				isNotMatch(a, 'abcd', ['cd']);
				isNotMatch(a, 'abcd', ['d']);
				isNotMatch(a, 'abcd', ['f']);
				isNotMatch(a, 'ef', ['/*']);
			},
		);

		a.test('should match a path segment for each single star', a => {
			isNotMatch(a, 'aaa', '*/*/*');
			isNotMatch(a, 'aaa/bb/aa/rr', '*/*/*');
			isNotMatch(a, 'aaa/bba/ccc', 'aaa*');
			isNotMatch(a, 'aaa/bba/ccc', 'aaa**');
			isNotMatch(a, 'aaa/bba/ccc', 'aaa/*');
			isNotMatch(a, 'aaa/bba/ccc', 'aaa/*ccc');
			isNotMatch(a, 'aaa/bba/ccc', 'aaa/*z');
			isNotMatch(a, 'aaa/bbb', '*/*/*');
			isNotMatch(a, 'ab/zzz/ejkl/hi', '*/*jk*/*i');
			isMatch(a, 'aaa/bba/ccc', '*/*/*');
			isMatch(a, 'aaa/bba/ccc', 'aaa/**');
			isMatch(a, 'aaa/bbb', 'aaa/*');
			isMatch(a, 'ab/zzz/ejkl/hi', '*/*z*/*/*i');
			isMatch(a, 'abzzzejklhi', '*j*i');
		});

		a.test('should support single globs (*)', a => {
			isMatch(a, 'a', '*');
			isMatch(a, 'b', '*');
			isNotMatch(a, 'a/a', '*');
			isNotMatch(a, 'a/a/a', '*');
			isNotMatch(a, 'a/a/b', '*');
			isNotMatch(a, 'a/a/a/a', '*');
			isNotMatch(a, 'a/a/a/a/a', '*');

			isNotMatch(a, 'a', '*/*');
			isMatch(a, 'a/a', '*/*');
			isNotMatch(a, 'a/a/a', '*/*');

			isNotMatch(a, 'a', '*/*/*');
			isNotMatch(a, 'a/a', '*/*/*');
			isMatch(a, 'a/a/a', '*/*/*');
			isNotMatch(a, 'a/a/a/a', '*/*/*');

			isNotMatch(a, 'a', '*/*/*/*');
			isNotMatch(a, 'a/a', '*/*/*/*');
			isNotMatch(a, 'a/a/a', '*/*/*/*');
			isMatch(a, 'a/a/a/a', '*/*/*/*');
			isNotMatch(a, 'a/a/a/a/a', '*/*/*/*');

			isNotMatch(a, 'a', '*/*/*/*/*');
			isNotMatch(a, 'a/a', '*/*/*/*/*');
			isNotMatch(a, 'a/a/a', '*/*/*/*/*');
			isNotMatch(a, 'a/a/b', '*/*/*/*/*');
			isNotMatch(a, 'a/a/a/a', '*/*/*/*/*');
			isMatch(a, 'a/a/a/a/a', '*/*/*/*/*');
			isNotMatch(a, 'a/a/a/a/a/a', '*/*/*/*/*');

			isNotMatch(a, 'a', 'a/*');
			isMatch(a, 'a/a', 'a/*');
			isNotMatch(a, 'a/a/a', 'a/*');
			isNotMatch(a, 'a/a/a/a', 'a/*');
			isNotMatch(a, 'a/a/a/a/a', 'a/*');

			isNotMatch(a, 'a', 'a/*/*');
			isNotMatch(a, 'a/a', 'a/*/*');
			isMatch(a, 'a/a/a', 'a/*/*');
			isNotMatch(a, 'b/a/a', 'a/*/*');
			isNotMatch(a, 'a/a/a/a', 'a/*/*');
			isNotMatch(a, 'a/a/a/a/a', 'a/*/*');

			isNotMatch(a, 'a', 'a/*/*/*');
			isNotMatch(a, 'a/a', 'a/*/*/*');
			isNotMatch(a, 'a/a/a', 'a/*/*/*');
			isMatch(a, 'a/a/a/a', 'a/*/*/*');
			isNotMatch(a, 'a/a/a/a/a', 'a/*/*/*');

			isNotMatch(a, 'a', 'a/*/*/*/*');
			isNotMatch(a, 'a/a', 'a/*/*/*/*');
			isNotMatch(a, 'a/a/a', 'a/*/*/*/*');
			isNotMatch(a, 'a/a/b', 'a/*/*/*/*');
			isNotMatch(a, 'a/a/a/a', 'a/*/*/*/*');
			isMatch(a, 'a/a/a/a/a', 'a/*/*/*/*');

			isNotMatch(a, 'a', 'a/*/a');
			isNotMatch(a, 'a/a', 'a/*/a');
			isMatch(a, 'a/a/a', 'a/*/a');
			isNotMatch(a, 'a/a/b', 'a/*/a');
			isNotMatch(a, 'a/a/a/a', 'a/*/a');
			isNotMatch(a, 'a/a/a/a/a', 'a/*/a');

			isNotMatch(a, 'a', 'a/*/b');
			isNotMatch(a, 'a/a', 'a/*/b');
			isNotMatch(a, 'a/a/a', 'a/*/b');
			isMatch(a, 'a/a/b', 'a/*/b');
			isNotMatch(a, 'a/a/a/a', 'a/*/b');
			isNotMatch(a, 'a/a/a/a/a', 'a/*/b');
		});

		a.test(
			'should only match a single folder per star when globstars are used',
			a => {
				isNotMatch(a, 'a', '*/**/a');
				isNotMatch(a, 'a/a/b', '*/**/a');
				isMatch(a, 'a/a', '*/**/a');
				isMatch(a, 'a/a/a', '*/**/a');
				isMatch(a, 'a/a/a/a', '*/**/a');
				isMatch(a, 'a/a/a/a/a', '*/**/a');
			},
		);

		a.test(
			'should not match a trailing slash when a star is last char',
			a => {
				isNotMatch(a, 'a', '*/');
				isNotMatch(a, 'a', '*/*');
				isNotMatch(a, 'a', 'a/*');
				isNotMatch(a, 'a/', '*/*');
				isNotMatch(a, 'a/', 'a/*');
				isNotMatch(a, 'a/a', '*');
				isNotMatch(a, 'a/a', '*/');
				isNotMatch(a, 'a/x/y', '*/');
				isNotMatch(a, 'a/x/y', '*/*');
				isNotMatch(a, 'a/x/y', 'a/*');
				//isNotMatch(a, 'a/', '*', { strictSlashes: true });
				isMatch(a, 'a/', '*');
				isMatch(a, 'a', '*');
				isMatch(a, 'a/', '*/');
				isMatch(a, 'a/', '*{,/}');
				isMatch(a, 'a/a', '*/*');
				isMatch(a, 'a/a', 'a/*');
			},
		);

		a.test('should work with file extensions', a => {
			isNotMatch(a, 'a.txt', 'a/**/*.txt');
			isMatch(a, 'a/x/y.txt', 'a/**/*.txt');
			isNotMatch(a, 'a/x/y/z', 'a/**/*.txt');

			isNotMatch(a, 'a.txt', 'a/*.txt');
			isMatch(a, 'a/b.txt', 'a/*.txt');
			isNotMatch(a, 'a/x/y.txt', 'a/*.txt');
			isNotMatch(a, 'a/x/y/z', 'a/*.txt');

			isMatch(a, 'a.txt', 'a*.txt');
			isNotMatch(a, 'a/b.txt', 'a*.txt');
			isNotMatch(a, 'a/x/y.txt', 'a*.txt');
			isNotMatch(a, 'a/x/y/z', 'a*.txt');

			isMatch(a, 'a.txt', '*.txt');
			isNotMatch(a, 'a/b.txt', '*.txt');
			isNotMatch(a, 'a/x/y.txt', '*.txt');
			isNotMatch(a, 'a/x/y/z', '*.txt');
		});

		a.test(
			'should not match slashes when globstars are not exclusive in a path segment',
			a => {
				isNotMatch(a, 'foo/baz/bar', 'foo**bar');
				isMatch(a, 'foobazbar', 'foo**bar');
			},
		);

		a.test('should match slashes when defined in braces', a => {
			isMatch(a, 'foo', 'foo{,/**}');
		});

		a.test('should correctly match slashes', a => {
			isNotMatch(a, 'a/b', 'a*');
			isNotMatch(a, 'a/a/bb', 'a/**/b');
			isNotMatch(a, 'a/bb', 'a/**/b');

			isNotMatch(a, 'foo', '*/**');
			isNotMatch(a, 'foo/bar', '**/');
			isNotMatch(a, 'foo/bar', '**/*/');
			isNotMatch(a, 'foo/bar', '*/*/');
			//isNotMatch(a, 'foo/bar/', '**/*', { strictSlashes: true });

			isMatch(a, '/home/foo/..', '**/..');
			isMatch(a, 'a', '**/a');
			isMatch(a, 'a/a', '**');
			isMatch(a, 'a/a', 'a/**');
			isMatch(a, 'a/', 'a/**');
			isMatch(a, 'a', 'a/**');
			isNotMatch(a, 'a/a', '**/');
			isMatch(a, 'a', '**/a/**');
			isMatch(a, 'a', 'a/**');
			isNotMatch(a, 'a/a', '**/');
			isMatch(a, 'a/a', '*/**/a');
			isMatch(a, 'a', 'a/**');
			isMatch(a, 'foo/', '*/**');
			isMatch(a, 'foo/bar', '**/*');
			isMatch(a, 'foo/bar', '*/*');
			isMatch(a, 'foo/bar', '*/**');
			isMatch(a, 'foo/bar/', '**/');
			isMatch(a, 'foo/bar/', '**/*');
			isMatch(a, 'foo/bar/', '**/*/');
			isMatch(a, 'foo/bar/', '*/**');
			isMatch(a, 'foo/bar/', '*/*/');

			isNotMatch(a, 'bar/baz/foo', '*/foo');
			isNotMatch(a, 'deep/foo/bar', '**/bar/*');
			isNotMatch(a, 'deep/foo/bar/baz/x', '*/bar/**');
			isNotMatch(a, 'ef', '/*');
			isNotMatch(a, 'foo/bar', 'foo?bar');
			isNotMatch(a, 'foo/bar/baz', '**/bar*');
			isNotMatch(a, 'foo/bar/baz', '**/bar**');
			isNotMatch(a, 'foo/baz/bar', 'foo**bar');
			isNotMatch(a, 'foo/baz/bar', 'foo*bar');
			isMatch(a, 'foo', 'foo/**');
			isMatch(a, '/ab', '/*');
			isMatch(a, '/cd', '/*');
			isMatch(a, '/ef', '/*');
			isMatch(a, 'a/b/j/c/z/x.md', 'a/**/j/**/z/*.md');
			isMatch(a, 'a/j/z/x.md', 'a/**/j/**/z/*.md');

			isMatch(a, 'bar/baz/foo', '**/foo');
			isMatch(a, 'deep/foo/bar/baz', '**/bar/*');
			isMatch(a, 'deep/foo/bar/baz/', '**/bar/**');
			isMatch(a, 'deep/foo/bar/baz/x', '**/bar/*/*');
			isMatch(a, 'foo/b/a/z/bar', 'foo/**/**/bar');
			isMatch(a, 'foo/b/a/z/bar', 'foo/**/bar');
			isMatch(a, 'foo/bar', 'foo/**/**/bar');
			isMatch(a, 'foo/bar', 'foo/**/bar');
			isMatch(a, 'foo/bar/baz/x', '*/bar/**');
			isMatch(a, 'foo/baz/bar', 'foo/**/**/bar');
			isMatch(a, 'foo/baz/bar', 'foo/**/bar');
			isMatch(a, 'XXX/foo', '**/foo');
		});

		a.test('should ignore leading "./" when defined on pattern', a => {
			isMatch(a, 'ab', './*');
			isNotMatch(a, 'ab', './*/');
			isMatch(a, 'ab/', './*/');
		});

		a.test('should optionally match trailing slashes with braces', a => {
			isMatch(a, 'foo', '**/*');
			isMatch(a, 'foo', '**/*{,/}');
			isMatch(a, 'foo/', '**/*{,/}');
			isMatch(a, 'foo/bar', '**/*{,/}');
			isMatch(a, 'foo/bar/', '**/*{,/}');
		});
	});

	s.test('negation patterns - "!"', a => {
		a.test(
			'should patterns with a leading "!" as negated/inverted globs',
			a => {
				isNotMatch(a, 'abc', '!*');
				isNotMatch(a, 'abc', '!abc');
				isNotMatch(a, 'bar.md', '*!.md');
				isNotMatch(a, 'bar.md', 'foo!.md');
				isNotMatch(a, 'foo!.md', '\\!*!*.md');
				isNotMatch(a, 'foo!bar.md', '\\!*!*.md');
				isMatch(a, '!foo!.md', '*!*.md');
				isMatch(a, '!foo!.md', '\\!*!*.md');
				isMatch(a, 'abc', '!*foo');
				isMatch(a, 'abc', '!foo*');
				isMatch(a, 'abc', '!xyz');
				isMatch(a, 'ba!r.js', '*!*.*');
				isMatch(a, 'bar.md', '*.md');
				isMatch(a, 'foo!.md', '*!*.*');
				isMatch(a, 'foo!.md', '*!*.md');
				isMatch(a, 'foo!.md', '*!.md');
				isMatch(a, 'foo!.md', '*.md');
				isMatch(a, 'foo!.md', 'foo!.md');
				isMatch(a, 'foo!bar.md', '*!*.md');
				isMatch(a, 'foobar.md', '*b*.md');
			},
		);

		a.test('should treat non-leading "!" as literal characters', a => {
			isNotMatch(a, 'a', 'a!!b');
			isNotMatch(a, 'aa', 'a!!b');
			isNotMatch(a, 'a/b', 'a!!b');
			isNotMatch(a, 'a!b', 'a!!b');
			isMatch(a, 'a!!b', 'a!!b');
			isNotMatch(a, 'a/!!/b', 'a!!b');
		});

		a.test(
			'should support negation in globs that have no other special characters',
			a => {
				isNotMatch(a, 'a/b', '!a/b');
				isMatch(a, 'a', '!a/b');
				isMatch(a, 'a.b', '!a/b');
				isMatch(a, 'a/a', '!a/b');
				isMatch(a, 'a/c', '!a/b');
				isMatch(a, 'b/a', '!a/b');
				isMatch(a, 'b/b', '!a/b');
				isMatch(a, 'b/c', '!a/b');
			},
		);

		a.test('should support multiple leading ! to toggle negation', a => {
			isNotMatch(a, 'abc', '!abc');
			isMatch(a, 'abc', '!!abc');
			isNotMatch(a, 'abc', '!!!abc');
			isMatch(a, 'abc', '!!!!abc');
			isNotMatch(a, 'abc', '!!!!!abc');
			isMatch(a, 'abc', '!!!!!!abc');
			isNotMatch(a, 'abc', '!!!!!!!abc');
			isMatch(a, 'abc', '!!!!!!!!abc');
		});

		a.test('should support negation extglobs after leading !', a => {
			isNotMatch(a, 'abc', '!(abc)');
			isMatch(a, 'abc', '!!(abc)');
			isNotMatch(a, 'abc', '!!!(abc)');
			isMatch(a, 'abc', '!!!!(abc)');
			isNotMatch(a, 'abc', '!!!!!(abc)');
			isMatch(a, 'abc', '!!!!!!(abc)');
			isNotMatch(a, 'abc', '!!!!!!!(abc)');
			isMatch(a, 'abc', '!!!!!!!!(abc)');
		});

		a.test('should support negation with globs', a => {
			isNotMatch(a, 'a/a', '!(*/*)');
			isNotMatch(a, 'a/b', '!(*/*)');
			isNotMatch(a, 'a/c', '!(*/*)');
			isNotMatch(a, 'b/a', '!(*/*)');
			isNotMatch(a, 'b/b', '!(*/*)');
			isNotMatch(a, 'b/c', '!(*/*)');
			isNotMatch(a, 'a/b', '!(*/b)');
			isNotMatch(a, 'b/b', '!(*/b)');
			isNotMatch(a, 'a/b', '!(a/b)');
			isNotMatch(a, 'a', '!*');
			isNotMatch(a, 'a.b', '!*');
			isNotMatch(a, 'a/a', '!*/*');
			isNotMatch(a, 'a/b', '!*/*');
			isNotMatch(a, 'a/c', '!*/*');
			isNotMatch(a, 'b/a', '!*/*');
			isNotMatch(a, 'b/b', '!*/*');
			isNotMatch(a, 'b/c', '!*/*');
			isNotMatch(a, 'a/b', '!*/b');
			isNotMatch(a, 'b/b', '!*/b');
			isNotMatch(a, 'a/c', '!*/c');
			isNotMatch(a, 'a/c', '!*/c');
			isNotMatch(a, 'b/c', '!*/c');
			isNotMatch(a, 'b/c', '!*/c');
			isNotMatch(a, 'bar', '!*a*');
			isNotMatch(a, 'fab', '!*a*');
			isNotMatch(a, 'a/a', '!a/(*)');
			isNotMatch(a, 'a/b', '!a/(*)');
			isNotMatch(a, 'a/c', '!a/(*)');
			isNotMatch(a, 'a/b', '!a/(b)');
			isNotMatch(a, 'a/a', '!a/*');
			isNotMatch(a, 'a/b', '!a/*');
			isNotMatch(a, 'a/c', '!a/*');
			isNotMatch(a, 'fab', '!f*b');
			isMatch(a, 'a', '!(*/*)');
			isMatch(a, 'a.b', '!(*/*)');
			isMatch(a, 'a', '!(*/b)');
			isMatch(a, 'a.b', '!(*/b)');
			isMatch(a, 'a/a', '!(*/b)');
			isMatch(a, 'a/c', '!(*/b)');
			isMatch(a, 'b/a', '!(*/b)');
			isMatch(a, 'b/c', '!(*/b)');
			isMatch(a, 'a', '!(a/b)');
			isMatch(a, 'a.b', '!(a/b)');
			isMatch(a, 'a/a', '!(a/b)');
			isMatch(a, 'a/c', '!(a/b)');
			isMatch(a, 'b/a', '!(a/b)');
			isMatch(a, 'b/b', '!(a/b)');
			isMatch(a, 'b/c', '!(a/b)');
			isMatch(a, 'a/a', '!*');
			isMatch(a, 'a/b', '!*');
			isMatch(a, 'a/c', '!*');
			isMatch(a, 'b/a', '!*');
			isMatch(a, 'b/b', '!*');
			isMatch(a, 'b/c', '!*');
			isMatch(a, 'a', '!*/*');
			isMatch(a, 'a.b', '!*/*');
			isMatch(a, 'a', '!*/b');
			isMatch(a, 'a.b', '!*/b');
			isMatch(a, 'a/a', '!*/b');
			isMatch(a, 'a/c', '!*/b');
			isMatch(a, 'b/a', '!*/b');
			isMatch(a, 'b/c', '!*/b');
			isMatch(a, 'a', '!*/c');
			isMatch(a, 'a.b', '!*/c');
			isMatch(a, 'a/a', '!*/c');
			isMatch(a, 'a/b', '!*/c');
			isMatch(a, 'b/a', '!*/c');
			isMatch(a, 'b/b', '!*/c');
			isMatch(a, 'foo', '!*a*');
			isMatch(a, 'a', '!a/(*)');
			isMatch(a, 'a.b', '!a/(*)');
			isMatch(a, 'b/a', '!a/(*)');
			isMatch(a, 'b/b', '!a/(*)');
			isMatch(a, 'b/c', '!a/(*)');
			isMatch(a, 'a', '!a/(b)');
			isMatch(a, 'a.b', '!a/(b)');
			isMatch(a, 'a/a', '!a/(b)');
			isMatch(a, 'a/c', '!a/(b)');
			isMatch(a, 'b/a', '!a/(b)');
			isMatch(a, 'b/b', '!a/(b)');
			isMatch(a, 'b/c', '!a/(b)');
			isMatch(a, 'a', '!a/*');
			isMatch(a, 'a.b', '!a/*');
			isMatch(a, 'b/a', '!a/*');
			isMatch(a, 'b/b', '!a/*');
			isMatch(a, 'b/c', '!a/*');
			isMatch(a, 'bar', '!f*b');
			isMatch(a, 'foo', '!f*b');
		});

		a.test('should negate files with extensions', a => {
			isNotMatch(a, '.md', '!.md');
			isMatch(a, 'a.js', '!**/*.md');
			isNotMatch(a, 'b.md', '!**/*.md');
			isMatch(a, 'c.txt', '!**/*.md');
			isMatch(a, 'a.js', '!*.md');
			isNotMatch(a, 'b.md', '!*.md');
			isMatch(a, 'c.txt', '!*.md');
			isNotMatch(a, 'abc.md', '!*.md');
			isMatch(a, 'abc.txt', '!*.md');
			isNotMatch(a, 'foo.md', '!*.md');
			isMatch(a, 'foo.md', '!.md');
		});

		a.test('should support negated single stars', a => {
			isMatch(a, 'a.js', '!*.md');
			isMatch(a, 'b.txt', '!*.md');
			isNotMatch(a, 'c.md', '!*.md');
			isNotMatch(a, 'a/a/a.js', '!a/*/a.js');
			isNotMatch(a, 'a/b/a.js', '!a/*/a.js');
			isNotMatch(a, 'a/c/a.js', '!a/*/a.js');
			isNotMatch(a, 'a/a/a/a.js', '!a/*/*/a.js');
			isMatch(a, 'b/a/b/a.js', '!a/*/*/a.js');
			isMatch(a, 'c/a/c/a.js', '!a/*/*/a.js');
			isNotMatch(a, 'a/a.txt', '!a/a*.txt');
			isMatch(a, 'a/b.txt', '!a/a*.txt');
			isMatch(a, 'a/c.txt', '!a/a*.txt');
			isNotMatch(a, 'a.a.txt', '!a.a*.txt');
			isMatch(a, 'a.b.txt', '!a.a*.txt');
			isMatch(a, 'a.c.txt', '!a.a*.txt');
			isNotMatch(a, 'a/a.txt', '!a/*.txt');
			isNotMatch(a, 'a/b.txt', '!a/*.txt');
			isNotMatch(a, 'a/c.txt', '!a/*.txt');
		});

		a.test('should support negated globstars (multiple stars)', a => {
			isMatch(a, 'a.js', '!*.md');
			isMatch(a, 'b.txt', '!*.md');
			isNotMatch(a, 'c.md', '!*.md');
			isNotMatch(a, 'a/a/a.js', '!**/a.js');
			isNotMatch(a, 'a/b/a.js', '!**/a.js');
			isNotMatch(a, 'a/c/a.js', '!**/a.js');
			isMatch(a, 'a/a/b.js', '!**/a.js');
			isNotMatch(a, 'a/a/a/a.js', '!a/**/a.js');
			isMatch(a, 'b/a/b/a.js', '!a/**/a.js');
			isMatch(a, 'c/a/c/a.js', '!a/**/a.js');
			isMatch(a, 'a/b.js', '!**/*.md');
			isMatch(a, 'a.js', '!**/*.md');
			isNotMatch(a, 'a/b.md', '!**/*.md');
			isNotMatch(a, 'a.md', '!**/*.md');
			isNotMatch(a, 'a/b.js', '**/*.md');
			isNotMatch(a, 'a.js', '**/*.md');
			isMatch(a, 'a/b.md', '**/*.md');
			isMatch(a, 'a.md', '**/*.md');
			isMatch(a, 'a/b.js', '!**/*.md');
			isMatch(a, 'a.js', '!**/*.md');
			isNotMatch(a, 'a/b.md', '!**/*.md');
			isNotMatch(a, 'a.md', '!**/*.md');
			isMatch(a, 'a/b.js', '!*.md');
			isMatch(a, 'a.js', '!*.md');
			isMatch(a, 'a/b.md', '!*.md');
			isNotMatch(a, 'a.md', '!*.md');
			isMatch(a, 'a.js', '!**/*.md');
			isNotMatch(a, 'b.md', '!**/*.md');
			isMatch(a, 'c.txt', '!**/*.md');
		});

		a.test('should not negate when inside quoted strings', a => {
			isNotMatch(a, 'foo.md', '"!*".md');
			isMatch(a, '"!*".md', '"!*".md');
			isMatch(a, '!*.md', '"!*".md');

			//isNotMatch(a, 'foo.md', '"!*".md', { keepQuotes: true });
			//isMatch(a, '"!*".md', '"!*".md', { keepQuotes: true });
			//isNotMatch(a, '!*.md', '"!*".md', { keepQuotes: true });

			isNotMatch(a, 'foo.md', '"**".md');
			isMatch(a, '"**".md', '"**".md');
			isMatch(a, '**.md', '"**".md');

			//isNotMatch(a, 'foo.md', '"**".md', { keepQuotes: true });
			//isMatch(a, '"**".md', '"**".md', { keepQuotes: true });
			//isNotMatch(a, '**.md', '"**".md', { keepQuotes: true });
		});

		a.test('should negate dotfiles', a => {
			isNotMatch(a, '.dotfile.md', '!.*.md');
			isMatch(a, '.dotfile.md', '!*.md');
			isMatch(a, '.dotfile.txt', '!*.md');
			isMatch(a, '.dotfile.txt', '!*.md');
			isMatch(a, 'a/b/.dotfile', '!*.md');
			isNotMatch(a, '.gitignore', '!.gitignore');
			isMatch(a, 'a', '!.gitignore');
			isMatch(a, 'b', '!.gitignore');
		});

		a.test('should not match slashes with a single star', a => {
			isMatch(a, 'foo/bar.md', '!*.md');
			isNotMatch(a, 'foo.md', '!*.md');
		});

		a.test('should match nested directories with globstars', a => {
			isNotMatch(a, 'a', '!a/**');
			isNotMatch(a, 'a/', '!a/**');
			isNotMatch(a, 'a/b', '!a/**');
			isNotMatch(a, 'a/b/c', '!a/**');
			isMatch(a, 'b', '!a/**');
			isMatch(a, 'b/c', '!a/**');

			isMatch(a, 'foo', '!f*b');
			isMatch(a, 'bar', '!f*b');
			isNotMatch(a, 'fab', '!f*b');
		});
	});
	s.test('from the Bash 4.3 spec/unit tests', a => {
		a.test('should handle "regular globbing"', a => {
			isNotMatch(a, '*', 'a*');
			isNotMatch(a, '**', 'a*');
			isNotMatch(a, '\\*', 'a*');
			isNotMatch(a, 'a/*', 'a*');
			isNotMatch(a, 'b', 'a*');
			isNotMatch(a, 'bc', 'a*');
			isNotMatch(a, 'bcd', 'a*');
			isNotMatch(a, 'bdir/', 'a*');
			isNotMatch(a, 'Beware', 'a*');
			isMatch(a, 'a', 'a*');
			isMatch(a, 'ab', 'a*');
			isMatch(a, 'abc', 'a*');

			isNotMatch(a, '*', '\\a*');
			isNotMatch(a, '**', '\\a*');
			isNotMatch(a, '\\*', '\\a*');

			isMatch(a, 'a', '\\a*');
			isNotMatch(a, 'a/*', '\\a*');
			isMatch(a, 'abc', '\\a*');
			isMatch(a, 'abd', '\\a*');
			isMatch(a, 'abe', '\\a*');
			isNotMatch(a, 'b', '\\a*');
			isNotMatch(a, 'bb', '\\a*');
			isNotMatch(a, 'bcd', '\\a*');
			isNotMatch(a, 'bdir/', '\\a*');
			isNotMatch(a, 'Beware', '\\a*');
			isNotMatch(a, 'c', '\\a*');
			isNotMatch(a, 'ca', '\\a*');
			isNotMatch(a, 'cb', '\\a*');
			isNotMatch(a, 'd', '\\a*');
			isNotMatch(a, 'dd', '\\a*');
			isNotMatch(a, 'de', '\\a*');
		});

		a.test('should match directories', a => {
			isNotMatch(a, '*', 'b*/');
			isNotMatch(a, '**', 'b*/');
			isNotMatch(a, '\\*', 'b*/');
			isNotMatch(a, 'a', 'b*/');
			isNotMatch(a, 'a/*', 'b*/');
			isNotMatch(a, 'abc', 'b*/');
			isNotMatch(a, 'abd', 'b*/');
			isNotMatch(a, 'abe', 'b*/');
			isNotMatch(a, 'b', 'b*/');
			isNotMatch(a, 'bb', 'b*/');
			isNotMatch(a, 'bcd', 'b*/');
			isMatch(a, 'bdir/', 'b*/');
			isNotMatch(a, 'Beware', 'b*/');
			isNotMatch(a, 'c', 'b*/');
			isNotMatch(a, 'ca', 'b*/');
			isNotMatch(a, 'cb', 'b*/');
			isNotMatch(a, 'd', 'b*/');
			isNotMatch(a, 'dd', 'b*/');
			isNotMatch(a, 'de', 'b*/');
		});

		a.test('should use escaped characters as literals', a => {
			isNotMatch(a, '*', '\\^');
			isNotMatch(a, '**', '\\^');
			isNotMatch(a, '\\*', '\\^');
			isNotMatch(a, 'a', '\\^');
			isNotMatch(a, 'a/*', '\\^');
			isNotMatch(a, 'abc', '\\^');
			isNotMatch(a, 'abd', '\\^');
			isNotMatch(a, 'abe', '\\^');
			isNotMatch(a, 'b', '\\^');
			isNotMatch(a, 'bb', '\\^');
			isNotMatch(a, 'bcd', '\\^');
			isNotMatch(a, 'bdir/', '\\^');
			isNotMatch(a, 'Beware', '\\^');
			isNotMatch(a, 'c', '\\^');
			isNotMatch(a, 'ca', '\\^');
			isNotMatch(a, 'cb', '\\^');
			isNotMatch(a, 'd', '\\^');
			isNotMatch(a, 'dd', '\\^');
			isNotMatch(a, 'de', '\\^');

			isMatch(a, '*', '\\*');
			//isMatch(a, '\\*', '\\*');
			isNotMatch(a, '**', '\\*');
			isNotMatch(a, 'a', '\\*');
			isNotMatch(a, 'a/*', '\\*');
			isNotMatch(a, 'abc', '\\*');
			isNotMatch(a, 'abd', '\\*');
			isNotMatch(a, 'abe', '\\*');
			isNotMatch(a, 'b', '\\*');
			isNotMatch(a, 'bb', '\\*');
			isNotMatch(a, 'bcd', '\\*');
			isNotMatch(a, 'bdir/', '\\*');
			isNotMatch(a, 'Beware', '\\*');
			isNotMatch(a, 'c', '\\*');
			isNotMatch(a, 'ca', '\\*');
			isNotMatch(a, 'cb', '\\*');
			isNotMatch(a, 'd', '\\*');
			isNotMatch(a, 'dd', '\\*');
			isNotMatch(a, 'de', '\\*');

			isNotMatch(a, '*', 'a\\*');
			isNotMatch(a, '**', 'a\\*');
			isNotMatch(a, '\\*', 'a\\*');
			isNotMatch(a, 'a', 'a\\*');
			isNotMatch(a, 'a/*', 'a\\*');
			isNotMatch(a, 'abc', 'a\\*');
			isNotMatch(a, 'abd', 'a\\*');
			isNotMatch(a, 'abe', 'a\\*');
			isNotMatch(a, 'b', 'a\\*');
			isNotMatch(a, 'bb', 'a\\*');
			isNotMatch(a, 'bcd', 'a\\*');
			isNotMatch(a, 'bdir/', 'a\\*');
			isNotMatch(a, 'Beware', 'a\\*');
			isNotMatch(a, 'c', 'a\\*');
			isNotMatch(a, 'ca', 'a\\*');
			isNotMatch(a, 'cb', 'a\\*');
			isNotMatch(a, 'd', 'a\\*');
			isNotMatch(a, 'dd', 'a\\*');
			isNotMatch(a, 'de', 'a\\*');

			isMatch(a, 'aqa', '*q*');
			isMatch(a, 'aaqaa', '*q*');
			isNotMatch(a, '*', '*q*');
			isNotMatch(a, '**', '*q*');
			isNotMatch(a, '\\*', '*q*');
			isNotMatch(a, 'a', '*q*');
			isNotMatch(a, 'a/*', '*q*');
			isNotMatch(a, 'abc', '*q*');
			isNotMatch(a, 'abd', '*q*');
			isNotMatch(a, 'abe', '*q*');
			isNotMatch(a, 'b', '*q*');
			isNotMatch(a, 'bb', '*q*');
			isNotMatch(a, 'bcd', '*q*');
			isNotMatch(a, 'bdir/', '*q*');
			isNotMatch(a, 'Beware', '*q*');
			isNotMatch(a, 'c', '*q*');
			isNotMatch(a, 'ca', '*q*');
			isNotMatch(a, 'cb', '*q*');
			isNotMatch(a, 'd', '*q*');
			isNotMatch(a, 'dd', '*q*');
			isNotMatch(a, 'de', '*q*');

			isMatch(a, '*', '\\**');
			isMatch(a, '**', '\\**');
			isNotMatch(a, '\\*', '\\**');
			isNotMatch(a, 'a', '\\**');
			isNotMatch(a, 'a/*', '\\**');
			isNotMatch(a, 'abc', '\\**');
			isNotMatch(a, 'abd', '\\**');
			isNotMatch(a, 'abe', '\\**');
			isNotMatch(a, 'b', '\\**');
			isNotMatch(a, 'bb', '\\**');
			isNotMatch(a, 'bcd', '\\**');
			isNotMatch(a, 'bdir/', '\\**');
			isNotMatch(a, 'Beware', '\\**');
			isNotMatch(a, 'c', '\\**');
			isNotMatch(a, 'ca', '\\**');
			isNotMatch(a, 'cb', '\\**');
			isNotMatch(a, 'd', '\\**');
			isNotMatch(a, 'dd', '\\**');
			isNotMatch(a, 'de', '\\**');
		});

		a.test('should work for quoted characters', a => {
			isNotMatch(a, '*', '"***"');
			isNotMatch(a, '**', '"***"');
			isNotMatch(a, '\\*', '"***"');
			isNotMatch(a, 'a', '"***"');
			isNotMatch(a, 'a/*', '"***"');
			isNotMatch(a, 'abc', '"***"');
			isNotMatch(a, 'abd', '"***"');
			isNotMatch(a, 'abe', '"***"');
			isNotMatch(a, 'b', '"***"');
			isNotMatch(a, 'bb', '"***"');
			isNotMatch(a, 'bcd', '"***"');
			isNotMatch(a, 'bdir/', '"***"');
			isNotMatch(a, 'Beware', '"***"');
			isNotMatch(a, 'c', '"***"');
			isNotMatch(a, 'ca', '"***"');
			isNotMatch(a, 'cb', '"***"');
			isNotMatch(a, 'd', '"***"');
			isNotMatch(a, 'dd', '"***"');
			isNotMatch(a, 'de', '"***"');
			isMatch(a, '***', '"***"');

			isNotMatch(a, '*', "'***'");
			isNotMatch(a, '**', "'***'");
			isNotMatch(a, '\\*', "'***'");
			isNotMatch(a, 'a', "'***'");
			isNotMatch(a, 'a/*', "'***'");
			isNotMatch(a, 'abc', "'***'");
			isNotMatch(a, 'abd', "'***'");
			isNotMatch(a, 'abe', "'***'");
			isNotMatch(a, 'b', "'***'");
			isNotMatch(a, 'bb', "'***'");
			isNotMatch(a, 'bcd', "'***'");
			isNotMatch(a, 'bdir/', "'***'");
			isNotMatch(a, 'Beware', "'***'");
			isNotMatch(a, 'c', "'***'");
			isNotMatch(a, 'ca', "'***'");
			isNotMatch(a, 'cb', "'***'");
			isNotMatch(a, 'd', "'***'");
			isNotMatch(a, 'dd', "'***'");
			isNotMatch(a, 'de', "'***'");
			isMatch(a, "'***'", "'***'");

			isNotMatch(a, '*', '"***"');
			isNotMatch(a, '**', '"***"');
			isNotMatch(a, '\\*', '"***"');
			isNotMatch(a, 'a', '"***"');
			isNotMatch(a, 'a/*', '"***"');
			isNotMatch(a, 'abc', '"***"');
			isNotMatch(a, 'abd', '"***"');
			isNotMatch(a, 'abe', '"***"');
			isNotMatch(a, 'b', '"***"');
			isNotMatch(a, 'bb', '"***"');
			isNotMatch(a, 'bcd', '"***"');
			isNotMatch(a, 'bdir/', '"***"');
			isNotMatch(a, 'Beware', '"***"');
			isNotMatch(a, 'c', '"***"');
			isNotMatch(a, 'ca', '"***"');
			isNotMatch(a, 'cb', '"***"');
			isNotMatch(a, 'd', '"***"');
			isNotMatch(a, 'dd', '"***"');
			isNotMatch(a, 'de', '"***"');

			isMatch(a, '*', '"*"*');
			isMatch(a, '**', '"*"*');
			isNotMatch(a, '\\*', '"*"*');
			isNotMatch(a, 'a', '"*"*');
			isNotMatch(a, 'a/*', '"*"*');
			isNotMatch(a, 'abc', '"*"*');
			isNotMatch(a, 'abd', '"*"*');
			isNotMatch(a, 'abe', '"*"*');
			isNotMatch(a, 'b', '"*"*');
			isNotMatch(a, 'bb', '"*"*');
			isNotMatch(a, 'bcd', '"*"*');
			isNotMatch(a, 'bdir/', '"*"*');
			isNotMatch(a, 'Beware', '"*"*');
			isNotMatch(a, 'c', '"*"*');
			isNotMatch(a, 'ca', '"*"*');
			isNotMatch(a, 'cb', '"*"*');
			isNotMatch(a, 'd', '"*"*');
			isNotMatch(a, 'dd', '"*"*');
			isNotMatch(a, 'de', '"*"*');
		});

		a.test('should match escaped quotes', a => {
			isNotMatch(a, '*', '\\"**\\"');
			isNotMatch(a, '**', '\\"**\\"');
			isNotMatch(a, '\\*', '\\"**\\"');
			isNotMatch(a, 'a', '\\"**\\"');
			isNotMatch(a, 'a/*', '\\"**\\"');
			isNotMatch(a, 'abc', '\\"**\\"');
			isNotMatch(a, 'abd', '\\"**\\"');
			isNotMatch(a, 'abe', '\\"**\\"');
			isNotMatch(a, 'b', '\\"**\\"');
			isNotMatch(a, 'bb', '\\"**\\"');
			isNotMatch(a, 'bcd', '\\"**\\"');
			isNotMatch(a, 'bdir/', '\\"**\\"');
			isNotMatch(a, 'Beware', '\\"**\\"');
			isNotMatch(a, 'c', '\\"**\\"');
			isNotMatch(a, 'ca', '\\"**\\"');
			isNotMatch(a, 'cb', '\\"**\\"');
			isNotMatch(a, 'd', '\\"**\\"');
			isNotMatch(a, 'dd', '\\"**\\"');
			isNotMatch(a, 'de', '\\"**\\"');
			isMatch(a, '"**"', '\\"**\\"');

			isNotMatch(a, '*', 'foo/\\"**\\"/bar');
			isNotMatch(a, '**', 'foo/\\"**\\"/bar');
			isNotMatch(a, '\\*', 'foo/\\"**\\"/bar');
			isNotMatch(a, 'a', 'foo/\\"**\\"/bar');
			isNotMatch(a, 'a/*', 'foo/\\"**\\"/bar');
			isNotMatch(a, 'abc', 'foo/\\"**\\"/bar');
			isNotMatch(a, 'abd', 'foo/\\"**\\"/bar');
			isNotMatch(a, 'abe', 'foo/\\"**\\"/bar');
			isNotMatch(a, 'b', 'foo/\\"**\\"/bar');
			isNotMatch(a, 'bb', 'foo/\\"**\\"/bar');
			isNotMatch(a, 'bcd', 'foo/\\"**\\"/bar');
			isNotMatch(a, 'bdir/', 'foo/\\"**\\"/bar');
			isNotMatch(a, 'Beware', 'foo/\\"**\\"/bar');
			isNotMatch(a, 'c', 'foo/\\"**\\"/bar');
			isNotMatch(a, 'ca', 'foo/\\"**\\"/bar');
			isNotMatch(a, 'cb', 'foo/\\"**\\"/bar');
			isNotMatch(a, 'd', 'foo/\\"**\\"/bar');
			isNotMatch(a, 'dd', 'foo/\\"**\\"/bar');
			isNotMatch(a, 'de', 'foo/\\"**\\"/bar');
			isMatch(a, 'foo/"**"/bar', 'foo/\\"**\\"/bar');

			isNotMatch(a, '*', 'foo/\\"*\\"/bar');
			isNotMatch(a, '**', 'foo/\\"*\\"/bar');
			isNotMatch(a, '\\*', 'foo/\\"*\\"/bar');
			isNotMatch(a, 'a', 'foo/\\"*\\"/bar');
			isNotMatch(a, 'a/*', 'foo/\\"*\\"/bar');
			isNotMatch(a, 'abc', 'foo/\\"*\\"/bar');
			isNotMatch(a, 'abd', 'foo/\\"*\\"/bar');
			isNotMatch(a, 'abe', 'foo/\\"*\\"/bar');
			isNotMatch(a, 'b', 'foo/\\"*\\"/bar');
			isNotMatch(a, 'bb', 'foo/\\"*\\"/bar');
			isNotMatch(a, 'bcd', 'foo/\\"*\\"/bar');
			isNotMatch(a, 'bdir/', 'foo/\\"*\\"/bar');
			isNotMatch(a, 'Beware', 'foo/\\"*\\"/bar');
			isNotMatch(a, 'c', 'foo/\\"*\\"/bar');
			isNotMatch(a, 'ca', 'foo/\\"*\\"/bar');
			isNotMatch(a, 'cb', 'foo/\\"*\\"/bar');
			isNotMatch(a, 'd', 'foo/\\"*\\"/bar');
			isNotMatch(a, 'dd', 'foo/\\"*\\"/bar');
			isNotMatch(a, 'de', 'foo/\\"*\\"/bar');
			isMatch(a, 'foo/"*"/bar', 'foo/\\"*\\"/bar');
			isMatch(a, 'foo/"a"/bar', 'foo/\\"*\\"/bar');
			isMatch(a, 'foo/"b"/bar', 'foo/\\"*\\"/bar');
			isMatch(a, 'foo/"c"/bar', 'foo/\\"*\\"/bar');
			isNotMatch(a, "foo/'*'/bar", 'foo/\\"*\\"/bar');
			isNotMatch(a, "foo/'a'/bar", 'foo/\\"*\\"/bar');
			isNotMatch(a, "foo/'b'/bar", 'foo/\\"*\\"/bar');
			isNotMatch(a, "foo/'c'/bar", 'foo/\\"*\\"/bar');

			isNotMatch(a, '*', 'foo/"*"/bar');
			isNotMatch(a, '**', 'foo/"*"/bar');
			isNotMatch(a, '\\*', 'foo/"*"/bar');
			isNotMatch(a, 'a', 'foo/"*"/bar');
			isNotMatch(a, 'a/*', 'foo/"*"/bar');
			isNotMatch(a, 'abc', 'foo/"*"/bar');
			isNotMatch(a, 'abd', 'foo/"*"/bar');
			isNotMatch(a, 'abe', 'foo/"*"/bar');
			isNotMatch(a, 'b', 'foo/"*"/bar');
			isNotMatch(a, 'bb', 'foo/"*"/bar');
			isNotMatch(a, 'bcd', 'foo/"*"/bar');
			isNotMatch(a, 'bdir/', 'foo/"*"/bar');
			isNotMatch(a, 'Beware', 'foo/"*"/bar');
			isNotMatch(a, 'c', 'foo/"*"/bar');
			isNotMatch(a, 'ca', 'foo/"*"/bar');
			isNotMatch(a, 'cb', 'foo/"*"/bar');
			isNotMatch(a, 'd', 'foo/"*"/bar');
			isNotMatch(a, 'dd', 'foo/"*"/bar');
			isNotMatch(a, 'de', 'foo/"*"/bar');
			isMatch(a, 'foo/*/bar', 'foo/"*"/bar');
			isMatch(a, 'foo/"*"/bar', 'foo/"*"/bar');
			isNotMatch(a, 'foo/"a"/bar', 'foo/"*"/bar');
			isNotMatch(a, 'foo/"b"/bar', 'foo/"*"/bar');
			isNotMatch(a, 'foo/"c"/bar', 'foo/"*"/bar');
			isNotMatch(a, "foo/'*'/bar", 'foo/"*"/bar');
			isNotMatch(a, "foo/'a'/bar", 'foo/"*"/bar');
			isNotMatch(a, "foo/'b'/bar", 'foo/"*"/bar');
			isNotMatch(a, "foo/'c'/bar", 'foo/"*"/bar');

			isNotMatch(a, '*', "\\'**\\'");
			isNotMatch(a, '**', "\\'**\\'");
			isNotMatch(a, '\\*', "\\'**\\'");
			isNotMatch(a, 'a', "\\'**\\'");
			isNotMatch(a, 'a/*', "\\'**\\'");
			isNotMatch(a, 'abc', "\\'**\\'");
			isNotMatch(a, 'abd', "\\'**\\'");
			isNotMatch(a, 'abe', "\\'**\\'");
			isNotMatch(a, 'b', "\\'**\\'");
			isNotMatch(a, 'bb', "\\'**\\'");
			isNotMatch(a, 'bcd', "\\'**\\'");
			isNotMatch(a, 'bdir/', "\\'**\\'");
			isNotMatch(a, 'Beware', "\\'**\\'");
			isNotMatch(a, 'c', "\\'**\\'");
			isNotMatch(a, 'ca', "\\'**\\'");
			isNotMatch(a, 'cb', "\\'**\\'");
			isNotMatch(a, 'd', "\\'**\\'");
			isNotMatch(a, 'dd', "\\'**\\'");
			isNotMatch(a, 'de', "\\'**\\'");
			isMatch(a, "'**'", "\\'**\\'");
		});

		a.test(
			"Pattern from Larry Wall's Configure that caused bash to blow up:",
			a => {
				isNotMatch(a, '*', '[a-c]b*');
				isNotMatch(a, '**', '[a-c]b*');
				isNotMatch(a, '\\*', '[a-c]b*');
				isNotMatch(a, 'a', '[a-c]b*');
				isNotMatch(a, 'a/*', '[a-c]b*');
				isMatch(a, 'abc', '[a-c]b*');
				isMatch(a, 'abd', '[a-c]b*');
				isMatch(a, 'abe', '[a-c]b*');
				isNotMatch(a, 'b', '[a-c]b*');
				isMatch(a, 'bb', '[a-c]b*');
				isNotMatch(a, 'bcd', '[a-c]b*');
				isNotMatch(a, 'bdir/', '[a-c]b*');
				isNotMatch(a, 'Beware', '[a-c]b*');
				isNotMatch(a, 'c', '[a-c]b*');
				isNotMatch(a, 'ca', '[a-c]b*');
				isMatch(a, 'cb', '[a-c]b*');
				isNotMatch(a, 'd', '[a-c]b*');
				isNotMatch(a, 'dd', '[a-c]b*');
				isNotMatch(a, 'de', '[a-c]b*');
			},
		);

		a.test('should support character classes', a => {
			isNotMatch(a, '*', 'a*[^c]');
			isNotMatch(a, '**', 'a*[^c]');
			isNotMatch(a, '\\*', 'a*[^c]');
			isNotMatch(a, 'a', 'a*[^c]');
			isNotMatch(a, 'a/*', 'a*[^c]');
			isNotMatch(a, 'abc', 'a*[^c]');
			isMatch(a, 'abd', 'a*[^c]');
			isMatch(a, 'abe', 'a*[^c]');
			isNotMatch(a, 'b', 'a*[^c]');
			isNotMatch(a, 'bb', 'a*[^c]');
			isNotMatch(a, 'bcd', 'a*[^c]');
			isNotMatch(a, 'bdir/', 'a*[^c]');
			isNotMatch(a, 'Beware', 'a*[^c]');
			isNotMatch(a, 'c', 'a*[^c]');
			isNotMatch(a, 'ca', 'a*[^c]');
			isNotMatch(a, 'cb', 'a*[^c]');
			isNotMatch(a, 'd', 'a*[^c]');
			isNotMatch(a, 'dd', 'a*[^c]');
			isNotMatch(a, 'de', 'a*[^c]');
			isNotMatch(a, 'baz', 'a*[^c]');
			isNotMatch(a, 'bzz', 'a*[^c]');
			isNotMatch(a, 'BZZ', 'a*[^c]');
			isNotMatch(a, 'beware', 'a*[^c]');
			isNotMatch(a, 'BewAre', 'a*[^c]');

			isMatch(a, 'a-b', 'a[X-]b');
			isMatch(a, 'aXb', 'a[X-]b');

			isNotMatch(a, '*', '[a-y]*[^c]');
			//isMatch(a, 'a*', '[a-y]*[^c]', { bash: true });
			isNotMatch(a, '**', '[a-y]*[^c]');
			isNotMatch(a, '\\*', '[a-y]*[^c]');
			isNotMatch(a, 'a', '[a-y]*[^c]');
			//isMatch(a, 'a123b', '[a-y]*[^c]', { bash: true });
			//isNotMatch(a, 'a123c', '[a-y]*[^c]', { bash: true });
			//isMatch(a, 'ab', '[a-y]*[^c]', { bash: true });
			isNotMatch(a, 'a/*', '[a-y]*[^c]');
			isNotMatch(a, 'abc', '[a-y]*[^c]');
			isMatch(a, 'abd', '[a-y]*[^c]');
			isMatch(a, 'abe', '[a-y]*[^c]');
			isNotMatch(a, 'b', '[a-y]*[^c]');
			//isMatch(a, 'bd', '[a-y]*[^c]', { bash: true });
			isMatch(a, 'bb', '[a-y]*[^c]');
			isMatch(a, 'bcd', '[a-y]*[^c]');
			isMatch(a, 'bdir/', '[a-y]*[^c]');
			isNotMatch(a, 'Beware', '[a-y]*[^c]');
			isNotMatch(a, 'c', '[a-y]*[^c]');
			isMatch(a, 'ca', '[a-y]*[^c]');
			isMatch(a, 'cb', '[a-y]*[^c]');
			isNotMatch(a, 'd', '[a-y]*[^c]');
			isMatch(a, 'dd', '[a-y]*[^c]');
			//isMatch(a, 'dd', '[a-y]*[^c]', { regex: true });
			isMatch(a, 'dd', '[a-y]*[^c]');
			isMatch(a, 'de', '[a-y]*[^c]');
			isMatch(a, 'baz', '[a-y]*[^c]');
			isMatch(a, 'bzz', '[a-y]*[^c]');
			isMatch(a, 'bzz', '[a-y]*[^c]');
			//isNotMatch(a, 'bzz', '[a-y]*[^c]', { regex: true });
			isNotMatch(a, 'BZZ', '[a-y]*[^c]');
			isMatch(a, 'beware', '[a-y]*[^c]');
			isNotMatch(a, 'BewAre', '[a-y]*[^c]');

			isMatch(a, 'a*b/ooo', 'a\\*b/*');
			isMatch(a, 'a*b/ooo', 'a\\*?/*');

			isNotMatch(a, '*', 'a[b]c');
			isNotMatch(a, '**', 'a[b]c');
			isNotMatch(a, '\\*', 'a[b]c');
			isNotMatch(a, 'a', 'a[b]c');
			isNotMatch(a, 'a/*', 'a[b]c');
			isMatch(a, 'abc', 'a[b]c');
			isNotMatch(a, 'abd', 'a[b]c');
			isNotMatch(a, 'abe', 'a[b]c');
			isNotMatch(a, 'b', 'a[b]c');
			isNotMatch(a, 'bb', 'a[b]c');
			isNotMatch(a, 'bcd', 'a[b]c');
			isNotMatch(a, 'bdir/', 'a[b]c');
			isNotMatch(a, 'Beware', 'a[b]c');
			isNotMatch(a, 'c', 'a[b]c');
			isNotMatch(a, 'ca', 'a[b]c');
			isNotMatch(a, 'cb', 'a[b]c');
			isNotMatch(a, 'd', 'a[b]c');
			isNotMatch(a, 'dd', 'a[b]c');
			isNotMatch(a, 'de', 'a[b]c');
			isNotMatch(a, 'baz', 'a[b]c');
			isNotMatch(a, 'bzz', 'a[b]c');
			isNotMatch(a, 'BZZ', 'a[b]c');
			isNotMatch(a, 'beware', 'a[b]c');
			isNotMatch(a, 'BewAre', 'a[b]c');

			isNotMatch(a, '*', 'a["b"]c');
			isNotMatch(a, '**', 'a["b"]c');
			isNotMatch(a, '\\*', 'a["b"]c');
			isNotMatch(a, 'a', 'a["b"]c');
			isNotMatch(a, 'a/*', 'a["b"]c');
			isMatch(a, 'abc', 'a["b"]c');
			isNotMatch(a, 'abd', 'a["b"]c');
			isNotMatch(a, 'abe', 'a["b"]c');
			isNotMatch(a, 'b', 'a["b"]c');
			isNotMatch(a, 'bb', 'a["b"]c');
			isNotMatch(a, 'bcd', 'a["b"]c');
			isNotMatch(a, 'bdir/', 'a["b"]c');
			isNotMatch(a, 'Beware', 'a["b"]c');
			isNotMatch(a, 'c', 'a["b"]c');
			isNotMatch(a, 'ca', 'a["b"]c');
			isNotMatch(a, 'cb', 'a["b"]c');
			isNotMatch(a, 'd', 'a["b"]c');
			isNotMatch(a, 'dd', 'a["b"]c');
			isNotMatch(a, 'de', 'a["b"]c');
			isNotMatch(a, 'baz', 'a["b"]c');
			isNotMatch(a, 'bzz', 'a["b"]c');
			isNotMatch(a, 'BZZ', 'a["b"]c');
			isNotMatch(a, 'beware', 'a["b"]c');
			isNotMatch(a, 'BewAre', 'a["b"]c');

			isNotMatch(a, '*', 'a[\\\\b]c');
			isNotMatch(a, '**', 'a[\\\\b]c');
			isNotMatch(a, '\\*', 'a[\\\\b]c');
			isNotMatch(a, 'a', 'a[\\\\b]c');
			isNotMatch(a, 'a/*', 'a[\\\\b]c');
			isMatch(a, 'abc', 'a[\\\\b]c');
			isNotMatch(a, 'abd', 'a[\\\\b]c');
			isNotMatch(a, 'abe', 'a[\\\\b]c');
			isNotMatch(a, 'b', 'a[\\\\b]c');
			isNotMatch(a, 'bb', 'a[\\\\b]c');
			isNotMatch(a, 'bcd', 'a[\\\\b]c');
			isNotMatch(a, 'bdir/', 'a[\\\\b]c');
			isNotMatch(a, 'Beware', 'a[\\\\b]c');
			isNotMatch(a, 'c', 'a[\\\\b]c');
			isNotMatch(a, 'ca', 'a[\\\\b]c');
			isNotMatch(a, 'cb', 'a[\\\\b]c');
			isNotMatch(a, 'd', 'a[\\\\b]c');
			isNotMatch(a, 'dd', 'a[\\\\b]c');
			isNotMatch(a, 'de', 'a[\\\\b]c');
			isNotMatch(a, 'baz', 'a[\\\\b]c');
			isNotMatch(a, 'bzz', 'a[\\\\b]c');
			isNotMatch(a, 'BZZ', 'a[\\\\b]c');
			isNotMatch(a, 'beware', 'a[\\\\b]c');
			isNotMatch(a, 'BewAre', 'a[\\\\b]c');

			isNotMatch(a, '*', 'a[\\b]c');
			isNotMatch(a, '**', 'a[\\b]c');
			isNotMatch(a, '\\*', 'a[\\b]c');
			isNotMatch(a, 'a', 'a[\\b]c');
			isNotMatch(a, 'a/*', 'a[\\b]c');
			isNotMatch(a, 'abc', 'a[\\b]c');
			isNotMatch(a, 'abd', 'a[\\b]c');
			isNotMatch(a, 'abe', 'a[\\b]c');
			isNotMatch(a, 'b', 'a[\\b]c');
			isNotMatch(a, 'bb', 'a[\\b]c');
			isNotMatch(a, 'bcd', 'a[\\b]c');
			isNotMatch(a, 'bdir/', 'a[\\b]c');
			isNotMatch(a, 'Beware', 'a[\\b]c');
			isNotMatch(a, 'c', 'a[\\b]c');
			isNotMatch(a, 'ca', 'a[\\b]c');
			isNotMatch(a, 'cb', 'a[\\b]c');
			isNotMatch(a, 'd', 'a[\\b]c');
			isNotMatch(a, 'dd', 'a[\\b]c');
			isNotMatch(a, 'de', 'a[\\b]c');
			isNotMatch(a, 'baz', 'a[\\b]c');
			isNotMatch(a, 'bzz', 'a[\\b]c');
			isNotMatch(a, 'BZZ', 'a[\\b]c');
			isNotMatch(a, 'beware', 'a[\\b]c');
			isNotMatch(a, 'BewAre', 'a[\\b]c');

			isNotMatch(a, '*', 'a[b-d]c');
			isNotMatch(a, '**', 'a[b-d]c');
			isNotMatch(a, '\\*', 'a[b-d]c');
			isNotMatch(a, 'a', 'a[b-d]c');
			isNotMatch(a, 'a/*', 'a[b-d]c');
			isMatch(a, 'abc', 'a[b-d]c');
			isNotMatch(a, 'abd', 'a[b-d]c');
			isNotMatch(a, 'abe', 'a[b-d]c');
			isNotMatch(a, 'b', 'a[b-d]c');
			isNotMatch(a, 'bb', 'a[b-d]c');
			isNotMatch(a, 'bcd', 'a[b-d]c');
			isNotMatch(a, 'bdir/', 'a[b-d]c');
			isNotMatch(a, 'Beware', 'a[b-d]c');
			isNotMatch(a, 'c', 'a[b-d]c');
			isNotMatch(a, 'ca', 'a[b-d]c');
			isNotMatch(a, 'cb', 'a[b-d]c');
			isNotMatch(a, 'd', 'a[b-d]c');
			isNotMatch(a, 'dd', 'a[b-d]c');
			isNotMatch(a, 'de', 'a[b-d]c');
			isNotMatch(a, 'baz', 'a[b-d]c');
			isNotMatch(a, 'bzz', 'a[b-d]c');
			isNotMatch(a, 'BZZ', 'a[b-d]c');
			isNotMatch(a, 'beware', 'a[b-d]c');
			isNotMatch(a, 'BewAre', 'a[b-d]c');

			isNotMatch(a, '*', 'a?c');
			isNotMatch(a, '**', 'a?c');
			isNotMatch(a, '\\*', 'a?c');
			isNotMatch(a, 'a', 'a?c');
			isNotMatch(a, 'a/*', 'a?c');
			isMatch(a, 'abc', 'a?c');
			isNotMatch(a, 'abd', 'a?c');
			isNotMatch(a, 'abe', 'a?c');
			isNotMatch(a, 'b', 'a?c');
			isNotMatch(a, 'bb', 'a?c');
			isNotMatch(a, 'bcd', 'a?c');
			isNotMatch(a, 'bdir/', 'a?c');
			isNotMatch(a, 'Beware', 'a?c');
			isNotMatch(a, 'c', 'a?c');
			isNotMatch(a, 'ca', 'a?c');
			isNotMatch(a, 'cb', 'a?c');
			isNotMatch(a, 'd', 'a?c');
			isNotMatch(a, 'dd', 'a?c');
			isNotMatch(a, 'de', 'a?c');
			isNotMatch(a, 'baz', 'a?c');
			isNotMatch(a, 'bzz', 'a?c');
			isNotMatch(a, 'BZZ', 'a?c');
			isNotMatch(a, 'beware', 'a?c');
			isNotMatch(a, 'BewAre', 'a?c');

			isMatch(a, 'man/man1/bash.1', '*/man*/bash.*');

			isMatch(a, '*', '[^a-c]*');
			isMatch(a, '**', '[^a-c]*');
			isNotMatch(a, 'a', '[^a-c]*');
			isNotMatch(a, 'a/*', '[^a-c]*');
			isNotMatch(a, 'abc', '[^a-c]*');
			isNotMatch(a, 'abd', '[^a-c]*');
			isNotMatch(a, 'abe', '[^a-c]*');
			isNotMatch(a, 'b', '[^a-c]*');
			isNotMatch(a, 'bb', '[^a-c]*');
			isNotMatch(a, 'bcd', '[^a-c]*');
			isNotMatch(a, 'bdir/', '[^a-c]*');
			isMatch(a, 'Beware', '[^a-c]*');
			//isMatch(a, 'Beware', '[^a-c]*', { bash: true });
			isNotMatch(a, 'c', '[^a-c]*');
			isNotMatch(a, 'ca', '[^a-c]*');
			isNotMatch(a, 'cb', '[^a-c]*');
			isMatch(a, 'd', '[^a-c]*');
			isMatch(a, 'dd', '[^a-c]*');
			isMatch(a, 'de', '[^a-c]*');
			isNotMatch(a, 'baz', '[^a-c]*');
			isNotMatch(a, 'bzz', '[^a-c]*');
			isMatch(a, 'BZZ', '[^a-c]*');
			isNotMatch(a, 'beware', '[^a-c]*');
			isMatch(a, 'BewAre', '[^a-c]*');
		});

		a.test('should support basic wildmatch (brackets) features', a => {
			isNotMatch(a, 'aab', 'a[]-]b');
			isNotMatch(a, 'ten', '[ten]');
			isMatch(a, ']', ']');
			isMatch(a, 'a-b', 'a[]-]b');
			isMatch(a, 'a]b', 'a[]-]b');
			isMatch(a, 'a]b', 'a[]]b');
			isMatch(a, 'aab', 'a[\\]a\\-]b');
			isMatch(a, 'ten', 't[a-g]n');
			isMatch(a, 'ton', 't[^a-g]n');
		});

		a.test('should support extended slash-matching features', a => {
			isNotMatch(a, 'foo/bar', 'f[^eiu][^eiu][^eiu][^eiu][^eiu]r');
			isMatch(a, 'foo/bar', 'foo[/]bar');
			isMatch(a, 'foo-bar', 'f[^eiu][^eiu][^eiu][^eiu][^eiu]r');
		});

		a.test('should match escaped characters', a => {
			/*if (process.platform !== 'win32') {
				isMatch(a, '\\*', '\\*');
				isMatch(a, 'XXX/\\', '[A-Z]+/\\\\');
			}*/

			isMatch(a, '[ab]', '\\[ab]');
			isMatch(a, '[ab]', '[\\[:]ab]');
		});

		a.test('should consolidate extra stars', a => {
			isNotMatch(a, 'bbc', 'a**c');
			isMatch(a, 'abc', 'a**c');
			isNotMatch(a, 'bbd', 'a**c');

			isNotMatch(a, 'bbc', 'a***c');
			isMatch(a, 'abc', 'a***c');
			isNotMatch(a, 'bbd', 'a***c');

			isNotMatch(a, 'bbc', 'a*****?c');
			isMatch(a, 'abc', 'a*****?c');
			isNotMatch(a, 'bbc', 'a*****?c');

			isMatch(a, 'bbc', '?*****??');
			isMatch(a, 'abc', '?*****??');

			isMatch(a, 'bbc', '*****??');
			isMatch(a, 'abc', '*****??');

			isMatch(a, 'bbc', '?*****?c');
			isMatch(a, 'abc', '?*****?c');

			isMatch(a, 'bbc', '?***?****c');
			isMatch(a, 'abc', '?***?****c');
			isNotMatch(a, 'bbd', '?***?****c');

			isMatch(a, 'bbc', '?***?****?');
			isMatch(a, 'abc', '?***?****?');

			isMatch(a, 'bbc', '?***?****');
			isMatch(a, 'abc', '?***?****');

			isMatch(a, 'bbc', '*******c');
			isMatch(a, 'abc', '*******c');

			isMatch(a, 'bbc', '*******?');
			isMatch(a, 'abc', '*******?');

			isMatch(a, 'abcdecdhjk', 'a*cd**?**??k');
			isMatch(a, 'abcdecdhjk', 'a**?**cd**?**??k');
			isMatch(a, 'abcdecdhjk', 'a**?**cd**?**??k***');
			isMatch(a, 'abcdecdhjk', 'a**?**cd**?**??***k');
			isMatch(a, 'abcdecdhjk', 'a**?**cd**?**??***k**');
			isMatch(a, 'abcdecdhjk', 'a****c**?**??*****');
		});

		a.test('none of these should output anything', a => {
			isNotMatch(a, 'abc', '??**********?****?');
			isNotMatch(a, 'abc', '??**********?****c');
			isNotMatch(a, 'abc', '?************c****?****');
			isNotMatch(a, 'abc', '*c*?**');
			isNotMatch(a, 'abc', 'a*****c*?**');
			isNotMatch(a, 'abc', 'a********???*******');
			a.throws(() => isNotMatch(a, 'a', '[]'));
			a.throws(() => isNotMatch(a, '[', '[abc'));
		});
	});

	s.test('non-globs', a => {
		a.test('should match non-globs', a => {
			isNotMatch(a, '/ab', '/a');
			isNotMatch(a, 'a/a', 'a/b');
			isNotMatch(a, 'a/a', 'a/c');
			isNotMatch(a, 'a/b', 'a/c');
			isNotMatch(a, 'a/c', 'a/b');
			isNotMatch(a, 'aaa', 'aa');
			isNotMatch(a, 'ab', '/a');
			isNotMatch(a, 'ab', 'a');

			isMatch(a, '/a', '/a');
			isMatch(a, '/a/', '/a/');
			isMatch(a, '/a/a', '/a/a');
			isMatch(a, '/a/a/', '/a/a/');
			isMatch(a, '/a/a/a', '/a/a/a');
			isMatch(a, '/a/a/a/', '/a/a/a/');
			isMatch(a, '/a/a/a/a', '/a/a/a/a');
			isMatch(a, '/a/a/a/a/a', '/a/a/a/a/a');

			isMatch(a, 'a', 'a');
			isMatch(a, 'a/', 'a/');
			isMatch(a, 'a/a', 'a/a');
			isMatch(a, 'a/a/', 'a/a/');
			isMatch(a, 'a/a/a', 'a/a/a');
			isMatch(a, 'a/a/a/', 'a/a/a/');
			isMatch(a, 'a/a/a/a', 'a/a/a/a');
			isMatch(a, 'a/a/a/a/a', 'a/a/a/a/a');
		});

		a.test('should match literal dots', a => {
			isMatch(a, '.', '.');
			isMatch(a, '..', '..');
			isNotMatch(a, '...', '..');
			isMatch(a, '...', '...');
			isMatch(a, '....', '....');
			isNotMatch(a, '....', '...');
		});

		a.test('should handle escaped characters as literals', a => {
			isNotMatch(a, 'abc', 'abc\\*');
			isMatch(a, 'abc*', 'abc\\*');
		});
	});

	s.test('qmarks and stars', a => {
		a.test('should match question marks with question marks', a => {
			a.equalValues(match(['?', '??', '???'], '?'), ['?']);
			a.equalValues(match(['?', '??', '???'], '??'), ['??']);
			a.equalValues(match(['?', '??', '???'], '???'), ['???']);
		});

		a.test(
			'should match question marks and stars with question marks and stars',
			a => {
				a.equalValues(match(['?', '??', '???'], '?*'), [
					'?',
					'??',
					'???',
				]);
				a.equalValues(match(['?', '??', '???'], '*?'), [
					'?',
					'??',
					'???',
				]);
				a.equalValues(match(['?', '??', '???'], '?*?'), ['??', '???']);
				a.equalValues(match(['?*', '?*?', '?*?*?'], '?*'), [
					'?*',
					'?*?',
					'?*?*?',
				]);
				a.equalValues(match(['?*', '?*?', '?*?*?'], '*?'), [
					'?*',
					'?*?',
					'?*?*?',
				]);
				a.equalValues(match(['?*', '?*?', '?*?*?'], '?*?'), [
					'?*',
					'?*?',
					'?*?*?',
				]);
			},
		);

		a.test('should support consecutive stars and question marks', a => {
			a.equalValues(match(['aaa', 'aac', 'abc'], 'a*?c'), ['aac', 'abc']);
			a.equalValues(match(['abc', 'abb', 'acc'], 'a**?c'), [
				'abc',
				'acc',
			]);
			a.equalValues(match(['abc', 'aaaabbbbbbccccc'], 'a*****?c'), [
				'abc',
				'aaaabbbbbbccccc',
			]);
			a.equalValues(match(['a', 'ab', 'abc', 'abcd'], '*****?'), [
				'a',
				'ab',
				'abc',
				'abcd',
			]);
			a.equalValues(match(['a', 'ab', 'abc', 'abcd'], '*****??'), [
				'ab',
				'abc',
				'abcd',
			]);
			a.equalValues(match(['a', 'ab', 'abc', 'abcd'], '?*****??'), [
				'abc',
				'abcd',
			]);
			a.equalValues(match(['abc', 'abb', 'zzz'], '?*****?c'), ['abc']);
			a.equalValues(match(['abc', 'bbb', 'zzz'], '?***?****?'), [
				'abc',
				'bbb',
				'zzz',
			]);
			a.equalValues(match(['abc', 'bbb', 'zzz'], '?***?****c'), ['abc']);
			a.equalValues(match(['abc'], '*******?'), ['abc']);
			a.equalValues(match(['abc'], '*******c'), ['abc']);
			a.equalValues(match(['abc'], '?***?****'), ['abc']);
			a.equalValues(match(['abcdecdhjk'], 'a****c**?**??*****'), [
				'abcdecdhjk',
			]);
			a.equalValues(match(['abcdecdhjk'], 'a**?**cd**?**??***k'), [
				'abcdecdhjk',
			]);
			a.equalValues(match(['abcdecdhjk'], 'a**?**cd**?**??***k**'), [
				'abcdecdhjk',
			]);
			a.equalValues(match(['abcdecdhjk'], 'a**?**cd**?**??k'), [
				'abcdecdhjk',
			]);
			a.equalValues(match(['abcdecdhjk'], 'a**?**cd**?**??k***'), [
				'abcdecdhjk',
			]);
			a.equalValues(match(['abcdecdhjk'], 'a*cd**?**??k'), [
				'abcdecdhjk',
			]);
		});

		a.test('should match one character per question mark', a => {
			const fixtures = ['a', 'aa', 'ab', 'aaa', 'abcdefg'];
			a.equalValues(match(fixtures, '?'), ['a']);
			a.equalValues(match(fixtures, '??'), ['aa', 'ab']);
			a.equalValues(match(fixtures, '???'), ['aaa']);
			a.equalValues(
				match(['a/', '/a/', '/a/b/', '/a/b/c/', '/a/b/c/d/'], '??'),
				[],
			);
			a.equalValues(match(['a/b/c.md'], 'a/?/c.md'), ['a/b/c.md']);
			a.equalValues(match(['a/bb/c.md'], 'a/?/c.md'), []);
			a.equalValues(match(['a/bb/c.md'], 'a/??/c.md'), ['a/bb/c.md']);
			a.equalValues(match(['a/bbb/c.md'], 'a/??/c.md'), []);
			a.equalValues(match(['a/bbb/c.md'], 'a/???/c.md'), ['a/bbb/c.md']);
			a.equalValues(match(['a/bbbb/c.md'], 'a/????/c.md'), [
				'a/bbbb/c.md',
			]);
		});

		a.test('should not match slashes question marks', a => {
			const fixtures = [
				'//',
				'a/',
				'/a',
				'/a/',
				'aa',
				'/aa',
				'a/a',
				'aaa',
				'/aaa',
			];
			a.log(globToRegex('/?').source);
			a.equalValues(match(fixtures, '/?'), ['/a', '/a/']);
			a.equalValues(match(fixtures, '/??'), ['/aa']);
			a.equalValues(match(fixtures, '/???'), ['/aaa']);
			a.equalValues(match(fixtures, '/?/'), ['/a/']);
			a.equalValues(match(fixtures, '??'), ['aa']);
			a.equalValues(match(fixtures, '?/?'), ['a/a']);
			a.equalValues(match(fixtures, '???'), ['aaa']);
			a.equalValues(match(fixtures, 'a?a'), ['aaa']);
			a.equalValues(match(fixtures, 'aa?'), ['aaa']);
			a.equalValues(match(fixtures, '?aa'), ['aaa']);
		});

		a.test('should support question marks and stars between slashes', a => {
			a.equalValues(match(['a/b.bb/c/d/efgh.ijk/e'], 'a/*/?/**/e'), [
				'a/b.bb/c/d/efgh.ijk/e',
			]);
			a.equalValues(match(['a/b/c/d/e'], 'a/?/c/?/*/e'), []);
			a.equalValues(match(['a/b/c/d/e/e'], 'a/?/c/?/*/e'), [
				'a/b/c/d/e/e',
			]);
			a.equalValues(match(['a/b/c/d/efgh.ijk/e'], 'a/*/?/**/e'), [
				'a/b/c/d/efgh.ijk/e',
			]);
			a.equalValues(match(['a/b/c/d/efghijk/e'], 'a/*/?/**/e'), [
				'a/b/c/d/efghijk/e',
			]);
			a.equalValues(match(['a/b/c/d/efghijk/e'], 'a/?/**/e'), [
				'a/b/c/d/efghijk/e',
			]);
			a.equalValues(match(['a/b/c/d/efghijk/e'], 'a/?/c/?/*/e'), [
				'a/b/c/d/efghijk/e',
			]);
			a.equalValues(match(['a/bb/e'], 'a/?/**/e'), []);
			a.equalValues(match(['a/bb/e'], 'a/?/e'), []);
			a.equalValues(match(['a/bbb/c/d/efgh.ijk/e'], 'a/*/?/**/e'), [
				'a/bbb/c/d/efgh.ijk/e',
			]);
		});

		a.test('should match no more than one character between slashes', a => {
			const fixtures = [
				'a/a',
				'a/a/a',
				'a/aa/a',
				'a/aaa/a',
				'a/aaaa/a',
				'a/aaaaa/a',
			];
			a.equalValues(match(fixtures, '?/?'), ['a/a']);
			a.equalValues(match(fixtures, '?/???/?'), ['a/aaa/a']);
			a.equalValues(match(fixtures, '?/????/?'), ['a/aaaa/a']);
			a.equalValues(match(fixtures, '?/?????/?'), ['a/aaaaa/a']);
			a.equalValues(match(fixtures, 'a/?'), ['a/a']);
			a.equalValues(match(fixtures, 'a/?/a'), ['a/a/a']);
			a.equalValues(match(fixtures, 'a/??/a'), ['a/aa/a']);
			a.equalValues(match(fixtures, 'a/???/a'), ['a/aaa/a']);
			a.equalValues(match(fixtures, 'a/????/a'), ['a/aaaa/a']);
			a.equalValues(match(fixtures, 'a/????a/a'), ['a/aaaaa/a']);
		});

		a.test('should not match non-leading dots with question marks', a => {
			const fixtures = [
				'.',
				'.a',
				'a',
				'aa',
				'a.a',
				'aa.a',
				'aaa',
				'aaa.a',
				'aaaa.a',
				'aaaaa',
			];
			a.equalValues(match(fixtures, '?'), ['a']);
			a.equalValues(match(fixtures, '.?'), ['.a']);
			a.equalValues(match(fixtures, '?a'), ['aa']);
			a.equalValues(match(fixtures, '??'), ['aa']);
			a.equalValues(match(fixtures, '?a?'), ['aaa']);
			a.equalValues(match(fixtures, 'aaa?a'), ['aaa.a', 'aaaaa']);
			a.equalValues(match(fixtures, 'a?a?a'), ['aaa.a', 'aaaaa']);
			a.equalValues(match(fixtures, 'a???a'), ['aaa.a', 'aaaaa']);
			a.equalValues(match(fixtures, 'a?????'), ['aaaa.a']);
		});

		/*a.test('should match non-leading dots with question marks when options.dot is true', a => {
    const fixtures = ['.', '.a', 'a', 'aa', 'a.a', 'aa.a', '.aa', 'aaa.a', 'aaaa.a', 'aaaaa'];
    const opts = { dot: true };
    a.equalValues(match(fixtures, '?', opts), ['.', 'a']);
    a.equalValues(match(fixtures, '.?', opts), ['.a']);
    a.equalValues(match(fixtures, '?a', opts), ['.a', 'aa']);
    a.equalValues(match(fixtures, '??', opts), ['.a', 'aa']);
    a.equalValues(match(fixtures, '?a?', opts), ['.aa']);
  });*/
	});

	s.test('Wildmat (git) tests', a => {
		a.test('Basic wildmat features', a => {
			isNotMatch(a, 'foo', '*f');
			isNotMatch(a, 'foo', '??');
			isNotMatch(a, 'foo', 'bar');
			isNotMatch(a, 'foobar', 'foo\\*bar');
			isMatch(a, '?a?b', '\\??\\?b');
			isMatch(a, 'aaaaaaabababab', '*ab');
			isMatch(a, 'foo', '*');
			isMatch(a, 'foo', '*foo*');
			isMatch(a, 'foo', '???');
			isMatch(a, 'foo', 'f*');
			isMatch(a, 'foo', 'foo');
			isMatch(a, 'foobar', '*ob*a*r*');
		});

		a.test('should support recursion', a => {
			isNotMatch(
				a,
				'-adobe-courier-bold-o-normal--12-120-75-75-/-70-iso8859-1',
				'-*-*-*-*-*-*-12-*-*-*-m-*-*-*',
			);
			isNotMatch(
				a,
				'-adobe-courier-bold-o-normal--12-120-75-75-X-70-iso8859-1',
				'-*-*-*-*-*-*-12-*-*-*-m-*-*-*',
			);
			isNotMatch(a, 'ab/cXd/efXg/hi', '*X*i');
			isNotMatch(a, 'ab/cXd/efXg/hi', '*Xg*i');
			isNotMatch(
				a,
				'abcd/abcdefg/abcdefghijk/abcdefghijklmnop.txtz',
				'**/*a*b*g*n*t',
			);
			isNotMatch(a, 'foo', '*/*/*');
			isNotMatch(a, 'foo', 'fo');
			isNotMatch(a, 'foo/bar', '*/*/*');
			isNotMatch(a, 'foo/bar', 'foo?bar');
			isNotMatch(a, 'foo/bb/aa/rr', '*/*/*');
			isNotMatch(a, 'foo/bba/arr', 'foo*');
			isNotMatch(a, 'foo/bba/arr', 'foo**');
			isNotMatch(a, 'foo/bba/arr', 'foo/*');
			isNotMatch(a, 'foo/bba/arr', 'foo/**arr');
			isNotMatch(a, 'foo/bba/arr', 'foo/**z');
			isNotMatch(a, 'foo/bba/arr', 'foo/*arr');
			isNotMatch(a, 'foo/bba/arr', 'foo/*z');
			isNotMatch(
				a,
				'XXX/adobe/courier/bold/o/normal//12/120/75/75/X/70/iso8859/1',
				'XXX/*/*/*/*/*/*/12/*/*/*/m/*/*/*',
			);
			isMatch(
				a,
				'-adobe-courier-bold-o-normal--12-120-75-75-m-70-iso8859-1',
				'-*-*-*-*-*-*-12-*-*-*-m-*-*-*',
			);
			isMatch(a, 'ab/cXd/efXg/hi', '**/*X*/**/*i');
			isMatch(a, 'ab/cXd/efXg/hi', '*/*X*/*/*i');
			isMatch(
				a,
				'abcd/abcdefg/abcdefghijk/abcdefghijklmnop.txt',
				'**/*a*b*g*n*t',
			);
			isMatch(a, 'abcXdefXghi', '*X*i');
			isMatch(a, 'foo', 'foo');
			isMatch(a, 'foo/bar', 'foo/*');
			isMatch(a, 'foo/bar', 'foo/bar');
			isMatch(a, 'foo/bar', 'foo[/]bar');
			isMatch(a, 'foo/bb/aa/rr', '**/**/**');
			isMatch(a, 'foo/bba/arr', '*/*/*');
			isMatch(a, 'foo/bba/arr', 'foo/**');
		});
	});

	s.test('should not match leading double-dots', a => {
		a.test('with single star', a => {
			isNotMatch(a, '../abc', '*/*');
			isNotMatch(a, '../abc', '*/abc');
			isNotMatch(a, '../abc', '*/abc/*');
		});

		a.test('with dot + single star', a => {
			isNotMatch(a, '../abc', '.*/*');
			isNotMatch(a, '../abc', '.*/abc');

			isNotMatch(a, '../abc', '*./*');
			isNotMatch(a, '../abc', '*./abc');
		});

		a.test('with globstar', a => {
			isNotMatch(a, '../abc', '**');
			isNotMatch(a, '../abc', '**/**');
			isNotMatch(a, '../abc', '**/**/**');

			isNotMatch(a, '../abc', '**/abc');
			isNotMatch(a, '../abc', '**/abc/**');

			isNotMatch(a, '../abc', 'abc/**');
			isNotMatch(a, '../abc', 'abc/**/**');
			isNotMatch(a, '../abc', 'abc/**/**/**');

			isNotMatch(a, '../abc', '**/abc');
			isNotMatch(a, '../abc', '**/abc/**');
			isNotMatch(a, '../abc', '**/abc/**/**');

			isNotMatch(a, '../abc', '**/**/abc/**');
			isNotMatch(a, '../abc', '**/**/abc/**/**');
		});

		a.test('with dot + globstar', a => {
			isNotMatch(a, '../abc', '.**');
			isNotMatch(a, '../abc', '.**/**');
			isNotMatch(a, '../abc', '.**/abc');
		});

		a.test('with globstar + dot + globstar', a => {
			isNotMatch(a, '../abc', '*.*/**');
			isNotMatch(a, '../abc', '*.*/abc');
		});

		a.test('with globstar + dot', a => {
			isNotMatch(a, '../abc', '**./**');
			isNotMatch(a, '../abc', '**./abc');
		});
	});

	s.test('should not match nested double-dots', a => {
		a.test('with star', a => {
			isNotMatch(a, '/../abc', '*/*');
			isNotMatch(a, '/../abc', '/*/*');
			isNotMatch(a, '/../abc', '*/*/*');

			isNotMatch(a, 'abc/../abc', '*/*/*');
			isNotMatch(a, 'abc/../abc/abc', '*/*/*/*');
		});

		a.test('with dot + star', a => {
			isNotMatch(a, '/../abc', '*/.*/*');
			isNotMatch(a, '/../abc', '/.*/*');

			isNotMatch(a, '/../abc', '*/*.*/*');
			isNotMatch(a, '/../abc', '/*.*/*');

			isNotMatch(a, '/../abc', '*/*./*');
			isNotMatch(a, '/../abc', '/*./*');

			isNotMatch(a, 'abc/../abc', '*/.*/*');
			isNotMatch(a, 'abc/../abc', '*/*.*/*');
			isNotMatch(a, 'abc/../abc', '*/*./*');
		});

		a.test('with globstar', a => {
			isNotMatch(a, '/../abc', '**');
			isNotMatch(a, '/../abc', '**/**');
			isNotMatch(a, '/../abc', '/**/**');
			isNotMatch(a, '/../abc', '**/**/**');

			isNotMatch(a, 'abc/../abc', '**/**/**');
			isNotMatch(a, 'abc/../abc/abc', '**/**/**/**');
		});

		a.test('with dot + globstar', a => {
			isNotMatch(a, '/../abc', '**/.**/**');
			isNotMatch(a, '/../abc', '/.**/**');

			isNotMatch(a, 'abc/../abc', '**/.**/**');
			isNotMatch(a, 'abc/../abc', '/.**/**');
		});

		a.test('with globstar + dot', a => {
			isNotMatch(a, '/../abc', '**/**./**');
			isNotMatch(a, '/../abc', '/**./**');

			isNotMatch(a, 'abc/../abc', '**/**./**');
			isNotMatch(a, 'abc/../abc', '/**./**');
		});

		a.test('with globstar + dot + globstar', a => {
			isNotMatch(a, '/../abc', '**/**.**/**');
			isNotMatch(a, '/../abc', '**/*.*/**');

			isNotMatch(a, '/../abc', '/**.**/**');
			isNotMatch(a, '/../abc', '/*.*/**');

			isNotMatch(a, 'abc/../abc', '**/**.**/**');
			isNotMatch(a, 'abc/../abc', '**/*.*/**');

			isNotMatch(a, 'abc/../abc', '/**.**/**');
			isNotMatch(a, 'abc/../abc', '/*.*/**');
		});
	});

	s.test('should not match trailing double-dots', a => {
		a.test('with single star', a => {
			isNotMatch(a, 'abc/..', '*/*');
			isNotMatch(a, 'abc/..', '*/*/');
			isNotMatch(a, 'abc/..', '*/*/*');

			isNotMatch(a, 'abc/../', '*/*');
			isNotMatch(a, 'abc/../', '*/*/');
			isNotMatch(a, 'abc/../', '*/*/*');

			isNotMatch(a, 'abc/../abc/../', '*/*/*/*');
			isNotMatch(a, 'abc/../abc/../', '*/*/*/*/');
			isNotMatch(a, 'abc/../abc/abc/../', '*/*/*/*/*');
		});

		a.test('with dot + star', a => {
			isNotMatch(a, 'abc/..', '*/.*');
			isNotMatch(a, 'abc/..', '*/.*/');
			isNotMatch(a, 'abc/..', '*/.*/*');

			isNotMatch(a, 'abc/../', '*/.*');
			isNotMatch(a, 'abc/../', '*/.*/');
			isNotMatch(a, 'abc/../', '*/.*/*');

			isNotMatch(a, 'abc/../abc/../', '*/.*/*/.*');
			isNotMatch(a, 'abc/../abc/../', '*/.*/*/.*/');
			isNotMatch(a, 'abc/../abc/abc/../', '*/.*/*/.*/*');
		});

		a.test('with star + dot', a => {
			isNotMatch(a, 'abc/..', '*/*.');
			isNotMatch(a, 'abc/..', '*/*./');
			isNotMatch(a, 'abc/..', '*/*./*');

			isNotMatch(a, 'abc/../', '*/*.');
			isNotMatch(a, 'abc/../', '*/*./');
			isNotMatch(a, 'abc/../', '*/*./*');

			isNotMatch(a, 'abc/../abc/../', '*/*./*/*.');
			isNotMatch(a, 'abc/../abc/../', '*/*./*/*./');
			isNotMatch(a, 'abc/../abc/abc/../', '*/*./*/*./*');
		});

		a.test('with globstar', a => {
			isNotMatch(a, 'abc/..', '**/**');
			isNotMatch(a, 'abc/..', '**/**/');
			isNotMatch(a, 'abc/..', '**/**/**');

			isNotMatch(a, 'abc/../', '**/**');
			isNotMatch(a, 'abc/../', '**/**/');
			isNotMatch(a, 'abc/../', '**/**/**');

			isNotMatch(a, 'abc/../abc/../', '**/**/**/**');
			isNotMatch(a, 'abc/../abc/../', '**/**/**/**/');
			isNotMatch(a, 'abc/../abc/abc/../', '**/**/**/**/**');
		});

		a.test('with dot + globstar', a => {
			isNotMatch(a, 'abc/..', '**/.**');
			isNotMatch(a, 'abc/..', '**/.**/');
			isNotMatch(a, 'abc/..', '**/.**/**');

			isNotMatch(a, 'abc/../', '**/.**');
			isNotMatch(a, 'abc/../', '**/.**/');
			isNotMatch(a, 'abc/../', '**/.**/**');

			isNotMatch(a, 'abc/../abc/../', '**/.**/**/.**');
			isNotMatch(a, 'abc/../abc/../', '**/.**/**/.**/');
			isNotMatch(a, 'abc/../abc/abc/../', '**/.**/**/.**/**');
		});

		a.test('with globstar + dot + globstar', a => {
			isNotMatch(a, 'abc/..', '**/**.**');
			isNotMatch(a, 'abc/..', '**/**.**/');
			isNotMatch(a, 'abc/..', '**/**.**/**');

			isNotMatch(a, 'abc/../', '**/**.**');
			isNotMatch(a, 'abc/../', '**/**.**/');
			isNotMatch(a, 'abc/../', '**/**.**/**');

			isNotMatch(a, 'abc/../abc/../', '**/**.**/**/**.**');
			isNotMatch(a, 'abc/../abc/../', '**/**.**/**/**.**/');
			isNotMatch(a, 'abc/../abc/abc/../', '**/**.**/**/.**/**');
		});

		a.test('with globstar + dot', a => {
			isNotMatch(a, 'abc/..', '**/**.');
			isNotMatch(a, 'abc/..', '**/**./');
			isNotMatch(a, 'abc/..', '**/**./**');

			isNotMatch(a, 'abc/../', '**/**.');
			isNotMatch(a, 'abc/../', '**/**./');
			isNotMatch(a, 'abc/../', '**/**./**');

			isNotMatch(a, 'abc/../abc/../', '**/**./**/**.');
			isNotMatch(a, 'abc/../abc/../', '**/**./**/**./');
			isNotMatch(a, 'abc/../abc/abc/../', '**/**./**/**./**');
		});
	});

	s.test('extglobs (minimatch)', a => {
		isNotMatch(a, '', '*(0|1|3|5|7|9)');

		isNotMatch(a, '*(a|b[)', '*(a|b\\[)');

		isMatch(a, '*(a|b[)', '\\*\\(a\\|b\\[\\)');

		isMatch(a, '***', '\\*\\*\\*');

		isNotMatch(
			a,
			'-adobe-courier-bold-o-normal--12-120-75-75-/-70-iso8859-1',
			'-*-*-*-*-*-*-12-*-*-*-m-*-*-*',
		);

		isMatch(
			a,
			'-adobe-courier-bold-o-normal--12-120-75-75-m-70-iso8859-1',
			'-*-*-*-*-*-*-12-*-*-*-m-*-*-*',
		);

		isNotMatch(
			a,
			'-adobe-courier-bold-o-normal--12-120-75-75-X-70-iso8859-1',
			'-*-*-*-*-*-*-12-*-*-*-m-*-*-*',
		);

		isMatch(a, '/dev/udp/129.22.8.102/45', '/dev\\/@(tcp|udp)\\/*\\/*');

		isMatch(a, '/x/y/z', '/x/y/z');

		isMatch(a, '0377', '+([0-7])');

		isMatch(a, '07', '+([0-7])');

		isNotMatch(a, '09', '+([0-7])');

		isMatch(a, '1', '0|[1-9]*([0-9])');

		isMatch(a, '12', '0|[1-9]*([0-9])');

		isNotMatch(a, '123abc', '(a+|b)*');

		isNotMatch(a, '123abc', '(a+|b)+');

		isMatch(a, '123abc', '*?(a)bc');

		isNotMatch(a, '123abc', 'a(b*(foo|bar))d');

		isNotMatch(a, '123abc', 'ab*(e|f)');

		isNotMatch(a, '123abc', 'ab**');

		isNotMatch(a, '123abc', 'ab**(e|f)');

		isNotMatch(a, '123abc', 'ab**(e|f)g');

		isNotMatch(a, '123abc', 'ab***ef');

		isNotMatch(a, '123abc', 'ab*+(e|f)');

		isNotMatch(a, '123abc', 'ab*d+(e|f)');

		isNotMatch(a, '123abc', 'ab?*(e|f)');

		isNotMatch(a, '12abc', '0|[1-9]*([0-9])');

		isMatch(a, '137577991', '*(0|1|3|5|7|9)');

		isNotMatch(a, '2468', '*(0|1|3|5|7|9)');

		isMatch(a, '?a?b', '\\??\\?b');

		isNotMatch(a, '\\a\\b\\c', 'abc');

		isMatch(a, 'a', '!(*.a|*.b|*.c)');

		isNotMatch(a, 'a', '!(a)');

		isNotMatch(a, 'a', '!(a)*');

		isMatch(a, 'a', '(a)');

		isNotMatch(a, 'a', '(b)');

		isMatch(a, 'a', '*(a)');

		isMatch(a, 'a', '+(a)');

		isMatch(a, 'a', '?');

		isMatch(a, 'a', '?(a|b)');

		isNotMatch(a, 'a', '??');

		isMatch(a, 'a', 'a!(b)*');

		isMatch(a, 'a', 'a?(a|b)');

		isMatch(a, 'a', 'a?(x)');

		isNotMatch(a, 'a', 'a??b');

		isNotMatch(a, 'a', 'b?(a|b)');

		isMatch(a, 'a((((b', 'a(*b');

		isNotMatch(a, 'a((((b', 'a(b');

		isNotMatch(a, 'a((((b', 'a\\(b');

		isMatch(a, 'a((b', 'a(*b');

		isNotMatch(a, 'a((b', 'a(b');

		isNotMatch(a, 'a((b', 'a\\(b');

		isMatch(a, 'a(b', 'a(*b');

		isMatch(a, 'a(b', 'a(b');

		isMatch(a, 'a(b', 'a\\(b');

		isMatch(a, 'a.', '!(*.a|*.b|*.c)');

		isMatch(a, 'a.', '*!(.a|.b|.c)');

		isMatch(a, 'a.', '*.!(a)');

		isMatch(a, 'a.', '*.!(a|b|c)');

		isNotMatch(a, 'a.', '*.(a|b|@(ab|a*@(b))*(c)d)');

		isNotMatch(a, 'a.', '*.+(b|d)');

		isNotMatch(a, 'a.a', '!(*.[a-b]*)');

		isNotMatch(a, 'a.a', '!(*.a|*.b|*.c)');

		isNotMatch(a, 'a.a', '!(*[a-b].[a-b]*)');

		isNotMatch(a, 'a.a', '!*.(a|b)');

		isNotMatch(a, 'a.a', '!*.(a|b)*');

		isMatch(a, 'a.a', '(a|d).(a|b)*');

		isMatch(a, 'a.a', '(b|a).(a)');

		isMatch(a, 'a.a', '*!(.a|.b|.c)');

		isNotMatch(a, 'a.a', '*.!(a)');

		isNotMatch(a, 'a.a', '*.!(a|b|c)');

		isMatch(a, 'a.a', '*.(a|b|@(ab|a*@(b))*(c)d)');

		isNotMatch(a, 'a.a', '*.+(b|d)');

		isMatch(a, 'a.a', '@(b|a).@(a)');

		isNotMatch(a, 'a.a.a', '!(*.[a-b]*)');

		isNotMatch(a, 'a.a.a', '!(*[a-b].[a-b]*)');

		isNotMatch(a, 'a.a.a', '!*.(a|b)');

		isNotMatch(a, 'a.a.a', '!*.(a|b)*');

		isMatch(a, 'a.a.a', '*.!(a)');

		isNotMatch(a, 'a.a.a', '*.+(b|d)');

		isNotMatch(a, 'a.aa.a', '(b|a).(a)');

		isNotMatch(a, 'a.aa.a', '@(b|a).@(a)');

		isMatch(a, 'a.abcd', '!(*.a|*.b|*.c)');

		isNotMatch(a, 'a.abcd', '!(*.a|*.b|*.c)*');

		isMatch(a, 'a.abcd', '*!(*.a|*.b|*.c)*');

		isMatch(a, 'a.abcd', '*!(.a|.b|.c)');

		isMatch(a, 'a.abcd', '*.!(a|b|c)');

		isNotMatch(a, 'a.abcd', '*.!(a|b|c)*');

		isMatch(a, 'a.abcd', '*.(a|b|@(ab|a*@(b))*(c)d)');

		isNotMatch(a, 'a.b', '!(*.*)');

		isNotMatch(a, 'a.b', '!(*.[a-b]*)');

		isNotMatch(a, 'a.b', '!(*.a|*.b|*.c)');

		isNotMatch(a, 'a.b', '!(*[a-b].[a-b]*)');

		isNotMatch(a, 'a.b', '!*.(a|b)');

		isNotMatch(a, 'a.b', '!*.(a|b)*');

		isMatch(a, 'a.b', '(a|d).(a|b)*');

		isMatch(a, 'a.b', '*!(.a|.b|.c)');

		isMatch(a, 'a.b', '*.!(a)');

		isNotMatch(a, 'a.b', '*.!(a|b|c)');

		isMatch(a, 'a.b', '*.(a|b|@(ab|a*@(b))*(c)d)');

		isMatch(a, 'a.b', '*.+(b|d)');

		isNotMatch(a, 'a.bb', '!(*.[a-b]*)');

		isNotMatch(a, 'a.bb', '!(*[a-b].[a-b]*)');

		isMatch(a, 'a.bb', '!*.(a|b)');

		isNotMatch(a, 'a.bb', '!*.(a|b)*');

		isNotMatch(a, 'a.bb', '!*.*(a|b)');

		isMatch(a, 'a.bb', '(a|d).(a|b)*');

		isNotMatch(a, 'a.bb', '(b|a).(a)');

		isMatch(a, 'a.bb', '*.+(b|d)');

		isNotMatch(a, 'a.bb', '@(b|a).@(a)');

		isNotMatch(a, 'a.c', '!(*.a|*.b|*.c)');

		isMatch(a, 'a.c', '*!(.a|.b|.c)');

		isNotMatch(a, 'a.c', '*.!(a|b|c)');

		isNotMatch(a, 'a.c', '*.(a|b|@(ab|a*@(b))*(c)d)');

		isMatch(a, 'a.c.d', '!(*.a|*.b|*.c)');

		isMatch(a, 'a.c.d', '*!(.a|.b|.c)');

		isMatch(a, 'a.c.d', '*.!(a|b|c)');

		isNotMatch(a, 'a.c.d', '*.(a|b|@(ab|a*@(b))*(c)d)');

		isMatch(a, 'a.ccc', '!(*.[a-b]*)');

		isMatch(a, 'a.ccc', '!(*[a-b].[a-b]*)');

		isMatch(a, 'a.ccc', '!*.(a|b)');

		isMatch(a, 'a.ccc', '!*.(a|b)*');

		isNotMatch(a, 'a.ccc', '*.+(b|d)');

		isNotMatch(a, 'a.js', '!(*.js)');

		isMatch(a, 'a.js', '*!(.js)');

		isNotMatch(a, 'a.js', '*.!(js)');

		isNotMatch(a, 'a.js', 'a.!(js)');

		isNotMatch(a, 'a.js', 'a.!(js)*');

		isNotMatch(a, 'a.js.js', '!(*.js)');

		isMatch(a, 'a.js.js', '*!(.js)');

		isMatch(a, 'a.js.js', '*.!(js)');

		isMatch(a, 'a.js.js', '*.*(js).js');

		isMatch(a, 'a.md', '!(*.js)');

		isMatch(a, 'a.md', '*!(.js)');

		isMatch(a, 'a.md', '*.!(js)');

		isMatch(a, 'a.md', 'a.!(js)');

		isMatch(a, 'a.md', 'a.!(js)*');

		isNotMatch(a, 'a.md.js', '*.*(js).js');

		isMatch(a, 'a.txt', 'a.!(js)');

		isMatch(a, 'a.txt', 'a.!(js)*');

		isMatch(a, 'a/!(z)', 'a/!(z)');

		isMatch(a, 'a/b', 'a/!(z)');

		isNotMatch(a, 'a/b/c.txt', '*/b/!(*).txt');

		isNotMatch(a, 'a/b/c.txt', '*/b/!(c).txt');

		isMatch(a, 'a/b/c.txt', '*/b/!(cc).txt');

		isNotMatch(a, 'a/b/cc.txt', '*/b/!(*).txt');

		isNotMatch(a, 'a/b/cc.txt', '*/b/!(c).txt');

		isNotMatch(a, 'a/b/cc.txt', '*/b/!(cc).txt');

		isMatch(a, 'a/dir/foo.txt', '*/dir/**/!(bar).txt');

		isNotMatch(a, 'a/z', 'a/!(z)');

		isNotMatch(a, 'a\\(b', 'a(*b');

		isNotMatch(a, 'a\\(b', 'a(b');

		//isMatch(a, 'a\\\\z', 'a\\\\z');

		//isMatch(a, 'a\\\\z', 'a\\\\z');

		isMatch(a, 'a\\z', 'a\\\\z');

		//isMatch(a, 'a\\z', 'a\\z');

		isNotMatch(a, 'aa', '!(a!(b))');

		isMatch(a, 'aa', '!(a)');

		isNotMatch(a, 'aa', '!(a)*');

		isNotMatch(a, 'aa', '?');

		isNotMatch(a, 'aa', '@(a)b');

		isMatch(a, 'aa', 'a!(b)*');

		isNotMatch(a, 'aa', 'a??b');

		isNotMatch(a, 'aa.aa', '(b|a).(a)');

		isNotMatch(a, 'aa.aa', '@(b|a).@(a)');

		isNotMatch(a, 'aaa', '!(a)*');

		isMatch(a, 'aaa', 'a!(b)*');

		isMatch(a, 'aaaaaaabababab', '*ab');

		isMatch(a, 'aaac', '*(@(a))a@(c)');

		isMatch(a, 'aaaz', '[a*(]*z');

		isNotMatch(a, 'aab', '!(a)*');

		isNotMatch(a, 'aab', '?');

		isNotMatch(a, 'aab', '??');

		isNotMatch(a, 'aab', '@(c)b');

		isMatch(a, 'aab', 'a!(b)*');

		isNotMatch(a, 'aab', 'a??b');

		isMatch(a, 'aac', '*(@(a))a@(c)');

		isNotMatch(a, 'aac', '*(@(a))b@(c)');

		isNotMatch(a, 'aax', 'a!(a*|b)');

		isMatch(a, 'aax', 'a!(x*|b)');

		isMatch(a, 'aax', 'a?(a*|b)');

		isMatch(a, 'aaz', '[a*(]*z');

		isMatch(a, 'ab', '!(*.*)');

		isMatch(a, 'ab', '!(a!(b))');

		isNotMatch(a, 'ab', '!(a)*');

		isMatch(a, 'ab', '(a+|b)*');

		isMatch(a, 'ab', '(a+|b)+');

		isNotMatch(a, 'ab', '*?(a)bc');

		isNotMatch(a, 'ab', 'a!(*(b|B))');

		isNotMatch(a, 'ab', 'a!(@(b|B))');

		isNotMatch(a, 'aB', 'a!(@(b|B))');

		isNotMatch(a, 'ab', 'a!(b)*');

		isNotMatch(a, 'ab', 'a(*b');

		isNotMatch(a, 'ab', 'a(b');

		isNotMatch(a, 'ab', 'a(b*(foo|bar))d');

		isNotMatch(a, 'ab', 'a\\(b');

		isMatch(a, 'ab', 'ab*(e|f)');

		isMatch(a, 'ab', 'ab**');

		isMatch(a, 'ab', 'ab**(e|f)');

		isNotMatch(a, 'ab', 'ab**(e|f)g');

		isNotMatch(a, 'ab', 'ab***ef');

		isNotMatch(a, 'ab', 'ab*+(e|f)');

		isNotMatch(a, 'ab', 'ab*d+(e|f)');

		isNotMatch(a, 'ab', 'ab?*(e|f)');

		isMatch(a, 'ab/cXd/efXg/hi', '**/*X*/**/*i');

		isMatch(a, 'ab/cXd/efXg/hi', '*/*X*/*/*i');

		isNotMatch(a, 'ab/cXd/efXg/hi', '*X*i');

		isNotMatch(a, 'ab/cXd/efXg/hi', '*Xg*i');

		isMatch(a, 'ab]', 'a!(@(b|B))');

		isMatch(a, 'abab', '(a+|b)*');

		isMatch(a, 'abab', '(a+|b)+');

		isNotMatch(a, 'abab', '*?(a)bc');

		isNotMatch(a, 'abab', 'a(b*(foo|bar))d');

		isNotMatch(a, 'abab', 'ab*(e|f)');

		isMatch(a, 'abab', 'ab**');

		isMatch(a, 'abab', 'ab**(e|f)');

		isNotMatch(a, 'abab', 'ab**(e|f)g');

		isNotMatch(a, 'abab', 'ab***ef');

		isNotMatch(a, 'abab', 'ab*+(e|f)');

		isNotMatch(a, 'abab', 'ab*d+(e|f)');

		isNotMatch(a, 'abab', 'ab?*(e|f)');

		isMatch(a, 'abb', '!(*.*)');

		isNotMatch(a, 'abb', '!(a)*');

		isNotMatch(a, 'abb', 'a!(b)*');

		isMatch(a, 'abbcd', '@(ab|a*(b))*(c)d');

		isNotMatch(a, 'abc', '\\a\\b\\c');

		isMatch(a, 'aBc', 'a!(@(b|B))');

		isMatch(a, 'abcd', '?@(a|b)*@(c)d');

		isMatch(a, 'abcd', '@(ab|a*@(b))*(c)d');

		isMatch(
			a,
			'abcd/abcdefg/abcdefghijk/abcdefghijklmnop.txt',
			'**/*a*b*g*n*t',
		);

		isNotMatch(
			a,
			'abcd/abcdefg/abcdefghijk/abcdefghijklmnop.txtz',
			'**/*a*b*g*n*t',
		);

		isMatch(a, 'abcdef', '(a+|b)*');

		isNotMatch(a, 'abcdef', '(a+|b)+');

		isNotMatch(a, 'abcdef', '*?(a)bc');

		isNotMatch(a, 'abcdef', 'a(b*(foo|bar))d');

		isNotMatch(a, 'abcdef', 'ab*(e|f)');

		isMatch(a, 'abcdef', 'ab**');

		isMatch(a, 'abcdef', 'ab**(e|f)');

		isNotMatch(a, 'abcdef', 'ab**(e|f)g');

		isMatch(a, 'abcdef', 'ab***ef');

		isMatch(a, 'abcdef', 'ab*+(e|f)');

		isMatch(a, 'abcdef', 'ab*d+(e|f)');

		isNotMatch(a, 'abcdef', 'ab?*(e|f)');

		isMatch(a, 'abcfef', '(a+|b)*');

		isNotMatch(a, 'abcfef', '(a+|b)+');

		isNotMatch(a, 'abcfef', '*?(a)bc');

		isNotMatch(a, 'abcfef', 'a(b*(foo|bar))d');

		isNotMatch(a, 'abcfef', 'ab*(e|f)');

		isMatch(a, 'abcfef', 'ab**');

		isMatch(a, 'abcfef', 'ab**(e|f)');

		isNotMatch(a, 'abcfef', 'ab**(e|f)g');

		isMatch(a, 'abcfef', 'ab***ef');

		isMatch(a, 'abcfef', 'ab*+(e|f)');

		isNotMatch(a, 'abcfef', 'ab*d+(e|f)');

		isMatch(a, 'abcfef', 'ab?*(e|f)');

		isMatch(a, 'abcfefg', '(a+|b)*');

		isNotMatch(a, 'abcfefg', '(a+|b)+');

		isNotMatch(a, 'abcfefg', '*?(a)bc');

		isNotMatch(a, 'abcfefg', 'a(b*(foo|bar))d');

		isNotMatch(a, 'abcfefg', 'ab*(e|f)');

		isMatch(a, 'abcfefg', 'ab**');

		isMatch(a, 'abcfefg', 'ab**(e|f)');

		isMatch(a, 'abcfefg', 'ab**(e|f)g');

		isNotMatch(a, 'abcfefg', 'ab***ef');

		isNotMatch(a, 'abcfefg', 'ab*+(e|f)');

		isNotMatch(a, 'abcfefg', 'ab*d+(e|f)');

		isNotMatch(a, 'abcfefg', 'ab?*(e|f)');

		isMatch(a, 'abcx', '!([[*])*');

		isMatch(a, 'abcx', '+(a|b\\[)*');

		isNotMatch(a, 'abcx', '[a*(]*z');

		isMatch(a, 'abcXdefXghi', '*X*i');

		isMatch(a, 'abcz', '!([[*])*');

		isMatch(a, 'abcz', '+(a|b\\[)*');

		isMatch(a, 'abcz', '[a*(]*z');

		isMatch(a, 'abd', '(a+|b)*');

		isNotMatch(a, 'abd', '(a+|b)+');

		isNotMatch(a, 'abd', '*?(a)bc');

		isMatch(a, 'abd', 'a!(*(b|B))');

		isMatch(a, 'abd', 'a!(@(b|B))');

		isNotMatch(a, 'abd', 'a!(@(b|B))d');

		isMatch(a, 'abd', 'a(b*(foo|bar))d');

		isMatch(a, 'abd', 'a+(b|c)d');

		isMatch(a, 'abd', 'a[b*(foo|bar)]d');

		isNotMatch(a, 'abd', 'ab*(e|f)');

		isMatch(a, 'abd', 'ab**');

		isMatch(a, 'abd', 'ab**(e|f)');

		isNotMatch(a, 'abd', 'ab**(e|f)g');

		isNotMatch(a, 'abd', 'ab***ef');

		isNotMatch(a, 'abd', 'ab*+(e|f)');

		isNotMatch(a, 'abd', 'ab*d+(e|f)');

		isMatch(a, 'abd', 'ab?*(e|f)');

		isMatch(a, 'abef', '(a+|b)*');

		isNotMatch(a, 'abef', '(a+|b)+');

		isNotMatch(a, 'abef', '*(a+|b)');

		isNotMatch(a, 'abef', '*?(a)bc');

		isNotMatch(a, 'abef', 'a(b*(foo|bar))d');

		isMatch(a, 'abef', 'ab*(e|f)');

		isMatch(a, 'abef', 'ab**');

		isMatch(a, 'abef', 'ab**(e|f)');

		isNotMatch(a, 'abef', 'ab**(e|f)g');

		isMatch(a, 'abef', 'ab***ef');

		isMatch(a, 'abef', 'ab*+(e|f)');

		isNotMatch(a, 'abef', 'ab*d+(e|f)');

		isMatch(a, 'abef', 'ab?*(e|f)');

		isNotMatch(a, 'abz', 'a!(*)');

		isMatch(a, 'abz', 'a!(z)');

		isMatch(a, 'abz', 'a*!(z)');

		isNotMatch(a, 'abz', 'a*(z)');

		isMatch(a, 'abz', 'a**(z)');

		isMatch(a, 'abz', 'a*@(z)');

		isNotMatch(a, 'abz', 'a+(z)');

		isNotMatch(a, 'abz', 'a?(z)');

		isNotMatch(a, 'abz', 'a@(z)');

		isNotMatch(a, 'ac', '!(a)*');

		isMatch(a, 'ac', '*(@(a))a@(c)');

		isMatch(a, 'ac', 'a!(*(b|B))');

		isMatch(a, 'ac', 'a!(@(b|B))');

		isMatch(a, 'ac', 'a!(b)*');

		isMatch(a, 'accdef', '(a+|b)*');

		isNotMatch(a, 'accdef', '(a+|b)+');

		isNotMatch(a, 'accdef', '*?(a)bc');

		isNotMatch(a, 'accdef', 'a(b*(foo|bar))d');

		isNotMatch(a, 'accdef', 'ab*(e|f)');

		isNotMatch(a, 'accdef', 'ab**');

		isNotMatch(a, 'accdef', 'ab**(e|f)');

		isNotMatch(a, 'accdef', 'ab**(e|f)g');

		isNotMatch(a, 'accdef', 'ab***ef');

		isNotMatch(a, 'accdef', 'ab*+(e|f)');

		isNotMatch(a, 'accdef', 'ab*d+(e|f)');

		isNotMatch(a, 'accdef', 'ab?*(e|f)');

		isMatch(a, 'acd', '(a+|b)*');

		isNotMatch(a, 'acd', '(a+|b)+');

		isNotMatch(a, 'acd', '*?(a)bc');

		isMatch(a, 'acd', '@(ab|a*(b))*(c)d');

		isMatch(a, 'acd', 'a!(*(b|B))');

		isMatch(a, 'acd', 'a!(@(b|B))');

		isMatch(a, 'acd', 'a!(@(b|B))d');

		isNotMatch(a, 'acd', 'a(b*(foo|bar))d');

		isMatch(a, 'acd', 'a+(b|c)d');

		isNotMatch(a, 'acd', 'a[b*(foo|bar)]d');

		isNotMatch(a, 'acd', 'ab*(e|f)');

		isNotMatch(a, 'acd', 'ab**');

		isNotMatch(a, 'acd', 'ab**(e|f)');

		isNotMatch(a, 'acd', 'ab**(e|f)g');

		isNotMatch(a, 'acd', 'ab***ef');

		isNotMatch(a, 'acd', 'ab*+(e|f)');

		isNotMatch(a, 'acd', 'ab*d+(e|f)');

		isNotMatch(a, 'acd', 'ab?*(e|f)');

		isNotMatch(a, 'axz', 'a+(z)');

		isNotMatch(a, 'az', 'a!(*)');

		isNotMatch(a, 'az', 'a!(z)');

		isMatch(a, 'az', 'a*!(z)');

		isMatch(a, 'az', 'a*(z)');

		isMatch(a, 'az', 'a**(z)');

		isMatch(a, 'az', 'a*@(z)');

		isMatch(a, 'az', 'a+(z)');

		isMatch(a, 'az', 'a?(z)');

		isMatch(a, 'az', 'a@(z)');

		isNotMatch(a, 'az', 'a\\\\z');

		isMatch(a, 'b', '!(a)*');

		isMatch(a, 'b', '(a+|b)*');

		isNotMatch(a, 'b', 'a!(b)*');

		isMatch(a, 'b.a', '(b|a).(a)');

		isMatch(a, 'b.a', '@(b|a).@(a)');

		isNotMatch(a, 'b/a', '!(b/a)');

		isMatch(a, 'b/b', '!(b/a)');

		isMatch(a, 'b/c', '!(b/a)');

		isNotMatch(a, 'b/c', 'b/!(c)');

		isMatch(a, 'b/c', 'b/!(cc)');

		isNotMatch(a, 'b/c.txt', 'b/!(c).txt');

		isMatch(a, 'b/c.txt', 'b/!(cc).txt');

		isMatch(a, 'b/cc', 'b/!(c)');

		isNotMatch(a, 'b/cc', 'b/!(cc)');

		isNotMatch(a, 'b/cc.txt', 'b/!(c).txt');

		isNotMatch(a, 'b/cc.txt', 'b/!(cc).txt');

		isMatch(a, 'b/ccc', 'b/!(c)');

		isMatch(a, 'ba', '!(a!(b))');

		isMatch(a, 'ba', 'b?(a|b)');

		isNotMatch(a, 'baaac', '*(@(a))a@(c)');

		isMatch(a, 'bar', '!(foo)');

		isMatch(a, 'bar', '!(foo)*');

		isMatch(a, 'bar', '!(foo)b*');

		isMatch(a, 'bar', '*(!(foo))');

		isMatch(a, 'baz', '!(foo)*');

		isMatch(a, 'baz', '!(foo)b*');

		isMatch(a, 'baz', '*(!(foo))');

		isMatch(a, 'bb', '!(a!(b))');

		isMatch(a, 'bb', '!(a)*');

		isNotMatch(a, 'bb', 'a!(b)*');

		isNotMatch(a, 'bb', 'a?(a|b)');

		isMatch(a, 'bbc', '!([[*])*');

		isNotMatch(a, 'bbc', '+(a|b\\[)*');

		isNotMatch(a, 'bbc', '[a*(]*z');

		isNotMatch(a, 'bz', 'a+(z)');

		isNotMatch(a, 'c', '*(@(a))a@(c)');

		isNotMatch(a, 'c.a', '!(*.[a-b]*)');

		isMatch(a, 'c.a', '!(*[a-b].[a-b]*)');

		isNotMatch(a, 'c.a', '!*.(a|b)');

		isNotMatch(a, 'c.a', '!*.(a|b)*');

		isNotMatch(a, 'c.a', '(b|a).(a)');

		isNotMatch(a, 'c.a', '*.!(a)');

		isNotMatch(a, 'c.a', '*.+(b|d)');

		isNotMatch(a, 'c.a', '@(b|a).@(a)');

		isNotMatch(a, 'c.c', '!(*.a|*.b|*.c)');

		isMatch(a, 'c.c', '*!(.a|.b|.c)');

		isNotMatch(a, 'c.c', '*.!(a|b|c)');

		isNotMatch(a, 'c.c', '*.(a|b|@(ab|a*@(b))*(c)d)');

		isMatch(a, 'c.ccc', '!(*.[a-b]*)');

		isMatch(a, 'c.ccc', '!(*[a-b].[a-b]*)');

		isNotMatch(a, 'c.js', '!(*.js)');

		isMatch(a, 'c.js', '*!(.js)');

		isNotMatch(a, 'c.js', '*.!(js)');

		isMatch(a, 'c/a/v', 'c/!(z)/v');

		isNotMatch(a, 'c/a/v', 'c/*(z)/v');

		isNotMatch(a, 'c/a/v', 'c/+(z)/v');

		isNotMatch(a, 'c/a/v', 'c/@(z)/v');

		isNotMatch(a, 'c/z/v', '*(z)');

		isNotMatch(a, 'c/z/v', '+(z)');

		isNotMatch(a, 'c/z/v', '?(z)');

		isNotMatch(a, 'c/z/v', 'c/!(z)/v');

		isMatch(a, 'c/z/v', 'c/*(z)/v');

		isMatch(a, 'c/z/v', 'c/+(z)/v');

		isMatch(a, 'c/z/v', 'c/@(z)/v');

		isMatch(a, 'c/z/v', 'c/z/v');

		isNotMatch(a, 'cc.a', '(b|a).(a)');

		isNotMatch(a, 'cc.a', '@(b|a).@(a)');

		isMatch(a, 'ccc', '!(a)*');

		isNotMatch(a, 'ccc', 'a!(b)*');

		isMatch(a, 'cow', '!(*.*)');

		isNotMatch(a, 'cow', '!(*.*).');

		isNotMatch(a, 'cow', '.!(*.*)');

		isNotMatch(a, 'cz', 'a!(*)');

		isNotMatch(a, 'cz', 'a!(z)');

		isNotMatch(a, 'cz', 'a*!(z)');

		isNotMatch(a, 'cz', 'a*(z)');

		isNotMatch(a, 'cz', 'a**(z)');

		isNotMatch(a, 'cz', 'a*@(z)');

		isNotMatch(a, 'cz', 'a+(z)');

		isNotMatch(a, 'cz', 'a?(z)');

		isNotMatch(a, 'cz', 'a@(z)');

		isNotMatch(a, 'd.a.d', '!(*.[a-b]*)');

		isMatch(a, 'd.a.d', '!(*[a-b].[a-b]*)');

		isNotMatch(a, 'd.a.d', '!*.(a|b)*');

		isMatch(a, 'd.a.d', '!*.*(a|b)');

		isNotMatch(a, 'd.a.d', '!*.{a,b}*');

		isMatch(a, 'd.a.d', '*.!(a)');

		isMatch(a, 'd.a.d', '*.+(b|d)');

		isMatch(a, 'd.d', '!(*.a|*.b|*.c)');

		isMatch(a, 'd.d', '*!(.a|.b|.c)');

		isMatch(a, 'd.d', '*.!(a|b|c)');

		isNotMatch(a, 'd.d', '*.(a|b|@(ab|a*@(b))*(c)d)');

		isMatch(a, 'd.js.d', '!(*.js)');

		isMatch(a, 'd.js.d', '*!(.js)');

		isMatch(a, 'd.js.d', '*.!(js)');

		isNotMatch(a, 'dd.aa.d', '(b|a).(a)');

		isNotMatch(a, 'dd.aa.d', '@(b|a).@(a)');

		isNotMatch(a, 'def', '()ef');

		isMatch(a, 'e.e', '!(*.a|*.b|*.c)');

		isMatch(a, 'e.e', '*!(.a|.b|.c)');

		isMatch(a, 'e.e', '*.!(a|b|c)');

		isNotMatch(a, 'e.e', '*.(a|b|@(ab|a*@(b))*(c)d)');

		isMatch(a, 'ef', '()ef');

		isMatch(a, 'effgz', '@(b+(c)d|e*(f)g?|?(h)i@(j|k))');

		isMatch(a, 'efgz', '@(b+(c)d|e*(f)g?|?(h)i@(j|k))');

		isMatch(a, 'egz', '@(b+(c)d|e*(f)g?|?(h)i@(j|k))');

		isNotMatch(a, 'egz', '@(b+(c)d|e+(f)g?|?(h)i@(j|k))');

		isMatch(a, 'egzefffgzbcdij', '*(b+(c)d|e*(f)g?|?(h)i@(j|k))');

		isNotMatch(a, 'f', '!(f!(o))');

		isMatch(a, 'f', '!(f(o))');

		isNotMatch(a, 'f', '!(f)');

		isNotMatch(a, 'f', '*(!(f))');

		isNotMatch(a, 'f', '+(!(f))');

		isNotMatch(a, 'f.a', '!(*.a|*.b|*.c)');

		isMatch(a, 'f.a', '*!(.a|.b|.c)');

		isNotMatch(a, 'f.a', '*.!(a|b|c)');

		isMatch(a, 'f.f', '!(*.a|*.b|*.c)');

		isMatch(a, 'f.f', '*!(.a|.b|.c)');

		isMatch(a, 'f.f', '*.!(a|b|c)');

		isNotMatch(a, 'f.f', '*.(a|b|@(ab|a*@(b))*(c)d)');

		isNotMatch(a, 'fa', '!(f!(o))');

		isMatch(a, 'fa', '!(f(o))');

		isNotMatch(a, 'fb', '!(f!(o))');

		isMatch(a, 'fb', '!(f(o))');

		isMatch(a, 'fff', '!(f)');

		isMatch(a, 'fff', '*(!(f))');

		isMatch(a, 'fff', '+(!(f))');

		isMatch(a, 'fffooofoooooffoofffooofff', '*(*(f)*(o))');

		isMatch(a, 'ffo', '*(f*(o))');

		isNotMatch(a, 'file.C', '*.c?(c)');

		isMatch(a, 'file.c', '*.c?(c)');

		isMatch(a, 'file.cc', '*.c?(c)');

		isNotMatch(a, 'file.ccc', '*.c?(c)');

		isMatch(a, 'fo', '!(f!(o))');

		isNotMatch(a, 'fo', '!(f(o))');

		isMatch(a, 'fofo', '*(f*(o))');

		isMatch(a, 'fofoofoofofoo', '*(fo|foo)');

		isMatch(a, 'fofoofoofofoo', '*(fo|foo)');

		isMatch(a, 'foo', '!(!(foo))');

		isMatch(a, 'foo', '!(f)');

		isNotMatch(a, 'foo', '!(foo)');

		isNotMatch(a, 'foo', '!(foo)*');

		isNotMatch(a, 'foo', '!(foo)*');

		isNotMatch(a, 'foo', '!(foo)+');

		isNotMatch(a, 'foo', '!(foo)b*');

		isMatch(a, 'foo', '!(x)');

		isMatch(a, 'foo', '!(x)*');

		isMatch(a, 'foo', '*');

		isMatch(a, 'foo', '*(!(f))');

		isNotMatch(a, 'foo', '*(!(foo))');

		isNotMatch(a, 'foo', '*(@(a))a@(c)');

		isMatch(a, 'foo', '*(@(foo))');

		isNotMatch(a, 'foo', '*(a|b\\[)');

		isMatch(a, 'foo', '*(a|b\\[)|f*');

		isMatch(a, 'foo', '@(*(a|b\\[)|f*)');

		isNotMatch(a, 'foo', '*/*/*');

		isNotMatch(a, 'foo', '*f');

		isMatch(a, 'foo', '*foo*');

		isMatch(a, 'foo', '+(!(f))');

		isNotMatch(a, 'foo', '??');

		isMatch(a, 'foo', '???');

		isNotMatch(a, 'foo', 'bar');

		isMatch(a, 'foo', 'f*');

		isNotMatch(a, 'foo', 'fo');

		isMatch(a, 'foo', 'foo');

		isMatch(a, 'foo', '{*(a|b\\[),f*}');

		isMatch(a, 'foo*', 'foo\\*');

		isMatch(a, 'foo*bar', 'foo\\*bar');

		isNotMatch(a, 'foo.js', '!(foo).js');

		isMatch(a, 'foo.js.js', '*.!(js)');

		isNotMatch(a, 'foo.js.js', '*.!(js)*');

		isNotMatch(a, 'foo.js.js', '*.!(js)*.!(js)');

		isNotMatch(a, 'foo.js.js', '*.!(js)+');

		isMatch(a, 'foo.txt', '**/!(bar).txt');

		isNotMatch(a, 'foo/bar', '*/*/*');

		isMatch(a, 'foo/bar', 'foo/!(foo)');

		isMatch(a, 'foo/bar', 'foo/*');

		isMatch(a, 'foo/bar', 'foo/bar');

		isNotMatch(a, 'foo/bar', 'foo?bar');

		isMatch(a, 'foo/bar', 'foo[/]bar');

		isMatch(a, 'foo/bar/baz.jsx', 'foo/bar/**/*.+(js|jsx)');

		isMatch(a, 'foo/bar/baz.jsx', 'foo/bar/*.+(js|jsx)');

		isMatch(a, 'foo/bb/aa/rr', '**/**/**');

		isNotMatch(a, 'foo/bb/aa/rr', '*/*/*');

		isMatch(a, 'foo/bba/arr', '*/*/*');

		isNotMatch(a, 'foo/bba/arr', 'foo*');

		isNotMatch(a, 'foo/bba/arr', 'foo**');

		isNotMatch(a, 'foo/bba/arr', 'foo/*');

		isMatch(a, 'foo/bba/arr', 'foo/**');

		isNotMatch(a, 'foo/bba/arr', 'foo/**arr');

		isNotMatch(a, 'foo/bba/arr', 'foo/**z');

		isNotMatch(a, 'foo/bba/arr', 'foo/*arr');

		isNotMatch(a, 'foo/bba/arr', 'foo/*z');

		isNotMatch(a, 'foob', '!(foo)b*');

		isNotMatch(a, 'foob', '(foo)bb');

		isMatch(a, 'foobar', '!(foo)');

		isNotMatch(a, 'foobar', '!(foo)*');

		isNotMatch(a, 'foobar', '!(foo)b*');

		isMatch(a, 'foobar', '*(!(foo))');

		isMatch(a, 'foobar', '*ob*a*r*');

		isNotMatch(a, 'foobar', 'foo\\*bar');

		isNotMatch(a, 'foobb', '!(foo)b*');

		isMatch(a, 'foobb', '(foo)bb');

		isMatch(a, '(foo)bb', '\\(foo\\)bb');

		isMatch(a, 'foofoofo', '@(foo|f|fo)*(f|of+(o))');

		isMatch(a, 'foofoofo', '@(foo|f|fo)*(f|of+(o))');

		isMatch(a, 'fooofoofofooo', '*(f*(o))');

		isMatch(a, 'foooofo', '*(f*(o))');

		isMatch(a, 'foooofof', '*(f*(o))');

		isNotMatch(a, 'foooofof', '*(f+(o))');

		isNotMatch(a, 'foooofofx', '*(f*(o))');

		isMatch(a, 'foooxfooxfoxfooox', '*(f*(o)x)');

		isMatch(a, 'foooxfooxfxfooox', '*(f*(o)x)');

		isNotMatch(a, 'foooxfooxofoxfooox', '*(f*(o)x)');

		isMatch(a, 'foot', '@(!(z*)|*x)');

		isMatch(a, 'foox', '@(!(z*)|*x)');

		isNotMatch(a, 'fz', '*(z)');

		isNotMatch(a, 'fz', '+(z)');

		isNotMatch(a, 'fz', '?(z)');

		isNotMatch(a, 'moo.cow', '!(moo).!(cow)');

		isNotMatch(a, 'moo.cow', '!(*).!(*)');

		isNotMatch(a, 'mad.moo.cow', '!(*.*).!(*.*)');

		isNotMatch(a, 'mad.moo.cow', '.!(*.*)');

		isMatch(a, 'Makefile', '!(*.c|*.h|Makefile.in|config*|README)');

		isNotMatch(a, 'Makefile.in', '!(*.c|*.h|Makefile.in|config*|README)');

		isMatch(a, 'moo', '!(*.*)');

		isNotMatch(a, 'moo', '!(*.*).');

		isNotMatch(a, 'moo', '.!(*.*)');

		isNotMatch(a, 'moo.cow', '!(*.*)');

		isNotMatch(a, 'moo.cow', '!(*.*).');

		isNotMatch(a, 'moo.cow', '.!(*.*)');

		isNotMatch(a, 'mucca.pazza', 'mu!(*(c))?.pa!(*(z))?');

		isMatch(a, 'ofoofo', '*(of+(o))');

		isMatch(a, 'ofoofo', '*(of+(o)|f)');

		isNotMatch(a, 'ofooofoofofooo', '*(f*(o))');

		isMatch(a, 'ofoooxoofxo', '*(*(of*(o)x)o)');

		isMatch(a, 'ofoooxoofxoofoooxoofxo', '*(*(of*(o)x)o)');

		isNotMatch(a, 'ofoooxoofxoofoooxoofxofo', '*(*(of*(o)x)o)');

		isMatch(a, 'ofoooxoofxoofoooxoofxoo', '*(*(of*(o)x)o)');

		isMatch(a, 'ofoooxoofxoofoooxoofxooofxofxo', '*(*(of*(o)x)o)');

		isMatch(a, 'ofxoofxo', '*(*(of*(o)x)o)');

		isMatch(a, 'oofooofo', '*(of|oof+(o))');

		isMatch(a, 'ooo', '!(f)');

		isMatch(a, 'ooo', '*(!(f))');

		isMatch(a, 'ooo', '+(!(f))');

		isNotMatch(a, 'oxfoxfox', '*(oxf+(ox))');

		isMatch(a, 'oxfoxoxfox', '*(oxf+(ox))');

		isMatch(a, 'para', 'para*([0-9])');

		isNotMatch(a, 'para', 'para+([0-9])');

		isMatch(a, 'para.38', 'para!(*.[00-09])');

		isMatch(a, 'para.graph', 'para!(*.[0-9])');

		isMatch(a, 'para13829383746592', 'para*([0-9])');

		isNotMatch(a, 'para381', 'para?([345]|99)1');

		isMatch(a, 'para39', 'para!(*.[0-9])');

		isMatch(a, 'para987346523', 'para+([0-9])');

		isMatch(a, 'para991', 'para?([345]|99)1');

		isMatch(a, 'paragraph', 'para!(*.[0-9])');

		isNotMatch(a, 'paragraph', 'para*([0-9])');

		isMatch(a, 'paragraph', 'para@(chute|graph)');

		isNotMatch(a, 'paramour', 'para@(chute|graph)');

		isMatch(a, 'parse.y', '!(*.c|*.h|Makefile.in|config*|README)');

		isNotMatch(a, 'shell.c', '!(*.c|*.h|Makefile.in|config*|README)');

		isNotMatch(a, 'VMS.FILE;', '*\\;[1-9]*([0-9])');

		isNotMatch(a, 'VMS.FILE;0', '*\\;[1-9]*([0-9])');

		isMatch(a, 'VMS.FILE;1', '*\\;[1-9]*([0-9])');

		isMatch(a, 'VMS.FILE;1', '*;[1-9]*([0-9])');

		isMatch(a, 'VMS.FILE;139', '*\\;[1-9]*([0-9])');

		isNotMatch(a, 'VMS.FILE;1N', '*\\;[1-9]*([0-9])');

		isNotMatch(a, 'xfoooofof', '*(f*(o))');

		isNotMatch(
			a,
			'XXX/adobe/courier/bold/o/normal//12/120/75/75/X/70/iso8859/1',
			'XXX/*/*/*/*/*/*/12/*/*/*/m/*/*/*',
		);

		isMatch(a, 'z', '*(z)');

		isMatch(a, 'z', '+(z)');

		isMatch(a, 'z', '?(z)');

		isNotMatch(a, 'zf', '*(z)');

		isNotMatch(a, 'zf', '+(z)');

		isNotMatch(a, 'zf', '?(z)');

		isNotMatch(a, 'zoot', '@(!(z*)|*x)');

		isMatch(a, 'zoox', '@(!(z*)|*x)');

		isNotMatch(a, 'zz', '(a+|b)*');
	});
});
