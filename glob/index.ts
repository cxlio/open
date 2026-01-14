export interface Options {
	/**
	 * Perform a basename-only match.
	 */
	matchBase?: boolean;

	/**
	 * Enable gitignore-like pattern semantics:
	 * - Leading `/` anchors to path root
	 * - Trailing `/` matches directories (prefix match)
	 * - Patterns without `/` match basenames (like matchBase)
	 * - `#` starts a comment (unless escaped)
	 * - Trailing spaces are trimmed (unless escaped)
	 */
	gitignore?: boolean;
}

/*
 * The `globToRegexString` function converts a single glob pattern into its equivalent
 * regular expression string. It supports advanced glob features like groups, ranges,
 * and special characters, while ensuring path-specific behaviors.
 *
 * It processes each character of the glob pattern to build the regex incrementally,
 * handling edge cases such as unclosed groups, escaped characters, and match modifiers.
 * This low-level utility is used internally by the `globToRegex` function for pattern matching.
 */
function globToRegexString(
	glob: string,
	{ matchBase, gitignore }: Options = {},
): string {
	// --- gitignore preprocessing ---
	if (gitignore) {
		// Trim trailing spaces unless escaped with a backslash (gitignore behavior).
		// e.g. "foo " == "foo", but "foo\ " keeps the space.
		let g = glob;

		// Comments: a leading unescaped # means "ignore this pattern"
		// (return a regex that matches nothing).
		if (g[0] === '#' && g[1] !== '\\') return '(?!)';

		// Remove unescaped trailing spaces
		while (g.length > 0 && g.endsWith(' ') && !g.endsWith('\\ ')) {
			g = g.slice(0, -1);
		}
		// Unescape "\ " -> " "
		g = g.replace(/\\ $/, ' ');

		glob = g;
	}

	let anchoredToRoot = false;
	let dirOnly = false;

	if (gitignore) {
		// Leading slash anchors to root
		if (glob.startsWith('/')) {
			anchoredToRoot = true;
			glob = glob.slice(1);
		}

		// Trailing slash means directory-only match
		if (glob.endsWith('/')) {
			dirOnly = true;
			glob = glob.slice(0, -1);
		}
	}

	const len = glob.length;
	let reStr = '';
	let inGroup = 0;
	let inParens = 0;
	let inQuotes = false;
	let isStartOfPath = true;
	const parensMod: string[] = [];

	if (!len) return '[\\s\\S]*';

	function matchBrackets(start: number) {
		let result = '';
		let hasSlash = false;
		let a = start;

		for (a = start; a < len; a++) {
			const ch = glob[a];
			if (ch === ']' && glob[a - 1] !== '\\') {
				if (a === start) result += '\\]';
				else {
					result += ']';
					if (glob[a + 1] === '+') {
						result += '+';
						a++;
					}
					break;
				}
			} else {
				if (ch === '/') hasSlash = true;
				result += ch;
			}
		}

		return [a, `${reStr}${hasSlash ? '' : '(?!/)'}[${result}`] as const;
	}

	function matchParens(start: number) {
		const mod = glob[start - 1];
		if (mod === '*' && isStartOfPath) parensMod.push('^*');
		else if (mod === '*' || mod === '+' || mod === '?') parensMod.push(mod);
		else if (mod !== '!') parensMod.push('');
		if (!inParens) {
			let foundClosing = false;
			for (let a = start + 1; a < len; a++) {
				if (glob[a] === ')' && glob[a - 1] !== '\\') {
					foundClosing = true;
					inParens++;
					break;
				}
			}
			if (!foundClosing) {
				reStr += '\\(';
				isStartOfPath = false;
			} else reStr += '(';
		} else {
			inParens++;
			reStr += '(';
		}
	}

	function isEndOfPath(start: number) {
		for (let a = start + 1; a < len; a++) {
			if (glob[a] === '/') return true;
			if (glob[a] && glob[a] !== ')' && glob[a] !== '}') return false;
		}
		return true;
	}

	for (let i = 0; i < len; i++) {
		const c = glob[i];
		const la = glob[i + 1];

		switch (c) {
			case '.':
				if (inGroup && la === '.') {
					const prev = glob[i - 1];
					reStr =
						reStr.slice(0, reStr.length - 1) +
						`[${prev}-${glob[i + 2]}]`;
					i += 2;
				} else if (la !== '.') {
					if (la === '/' && (glob[i - 1] === '/' || !glob[i - 1])) {
						reStr += '(?:./)?';
						i++;
					} else reStr += '(?!\\.\\.)\\.';
				} else reStr += '\\.';
				isStartOfPath = false;
				break;
			case '\\':
				if (la === '\\') reStr += '\\\\';
				else reStr += `\\${la}`;
				i++;
				isStartOfPath = false;
				break;
			case '!':
				if (la === '(') {
					reStr += '(?:(?!';
					parensMod.push(').*)');
				} else if (glob[i - 1]) {
					reStr += '\\!';
					isStartOfPath = false;
				} else {
					let negate = true;

					while (glob[i + 1] === '!') {
						negate = !negate;
						i++;
					}

					if (negate)
						return `^(?:(?!${globToRegexString(glob.slice(i + 1), {
							matchBase,
							gitignore,
						})}).*)$`;
				}
				break;
			case '"':
				inQuotes = !inQuotes;
				reStr += '"?';
				isStartOfPath = false;
				break;
			case '^':
				reStr += '\\^';
				isStartOfPath = false;
				break;
			case '+':
				// One or more mod
				if (la === '(') break;
				if (inParens || (glob[i - 1] === ')' && glob[i - 2] !== '\\'))
					reStr += '+';
				else reStr += '\\+';
				isStartOfPath = false;
				break;
			case '@':
				if (la !== '(') {
					reStr += '@';
					isStartOfPath = false;
				}
				break;
			case '$':
			case '=':
				reStr += '\\' + c;
				isStartOfPath = false;
				break;
			case '?':
				// One or more mod
				if (la === '(') break;
				reStr += !glob[i - 1] || glob[i - 1] === '/' ? '[^/.]' : '[^/]';
				isStartOfPath = false;
				break;
			case '(':
				matchParens(i);
				break;
			case ')':
				if (inParens) {
					const mod = parensMod.pop() || '';
					const sep =
						mod === ').*)' && isEndOfPath(i) ? '(?:/|$)' : '';
					inParens--;
					if (mod === '^*') reStr += isEndOfPath(i) ? `)+` : ')*';
					else reStr += `)${sep}${mod}`;
				} else {
					reStr += '\\)';
					isStartOfPath = false;
				}
				break;
			case '[':
				[i, reStr] = matchBrackets(i + 1);
				break;
			case ']':
				reStr += '\\]';
				isStartOfPath = false;
				break;
			case '{': {
				// If no commas treat as literal
				let found = false;
				for (let a = i + 1; a < len && glob[a] !== '}'; a++)
					if (
						glob[a] === ',' ||
						(glob[a] === '.' && glob[a + 1] === '.')
					) {
						inGroup++;
						found = true;
						reStr += '(?:';
						break;
					}
				if (!found) {
					reStr += '\\{';
					isStartOfPath = false;
				}
				break;
			}
			case '}':
				if (inGroup) {
					inGroup--;
					reStr += ')';
					if (la === '+') {
						reStr += '+';
						i++;
					}
				} else reStr += '\\}';
				isStartOfPath = false;
				break;
			case '|':
				if (gitignore && glob[i - 1] === '/') reStr += '?|';
				else reStr += '|';
				break;
			case ',':
				if (inGroup) {
					reStr += '|';
					break;
				}
				reStr += '\\' + c;
				isStartOfPath = false;
				break;
			case '/':
				if (
					la === '*' &&
					glob[i - 1] &&
					glob[i + 2] === '*' &&
					glob[i + 3] !== '/'
				)
					reStr += '/?';
				else reStr += '/';
				isStartOfPath = true;
				break;
			case '*':
				if (inQuotes) {
					reStr += '\\' + c;
					isStartOfPath = false;
					break;
				}
				if (la === '(') break;

				if (la === '*') {
					if (!glob[i - 1]) reStr += '/?';
					if (
						(glob[i + 2] === '/' || !glob[i + 2]) &&
						(glob[i - 1] === '/' || !glob[i - 1])
					) {
						if (glob[i + 3]) reStr += '(?:[^/.][^/]*(?:/|$))*';
						else if (!glob[i + 2]) reStr += '(?:[^/.][^/]*/?)*';
						else reStr += '(?:[^/.][^/]*/)*';

						i += 2;
						break;
					} else {
						if (glob[i - 1] === '/' || !glob[i - 1])
							reStr += `(?:[^./][^/]*)${
								glob[i + 2] ? '?(?:/$)?' : '/?'
							}`;
						else reStr += `[^/]*${glob[i + 2] ? '(?:/$)?' : '/?'}`;
						i++;
						break;
					}
				} else if (la === '/') {
					reStr += '(?:[^./][^/]*)?/';
					i++;
					break;
				}
				if (glob[i - 1] === '/' || !glob[i - 1]) {
					if (la === '.') {
						reStr += `(?:[^./][^/]*)(?:/$)?`;
					} else reStr += `(?:[^./][^/]*)${la ? '?(?:/$)?' : '/?'}`;
				} else reStr += `[^/]*${la ? '(?:/$)?' : '/?'}`;
				isStartOfPath = false;
				break;

			default:
				reStr += c;
				isStartOfPath = false;
		}
	}

	// --- gitignore postprocessing / anchoring ---
	const effectiveMatchBase =
		!!matchBase || (gitignore && !anchoredToRoot && !glob.includes('/'));

	const prefix = effectiveMatchBase
		? ''
		: anchoredToRoot
			? '^'
			: gitignore
				? '^(?:.*/)?'
				: '^';

	// directory-only: match the directory itself or anything under it
	const suffix = dirOnly ? '(?:/.*)?$' : '/?$';

	return `${prefix}${reStr}${suffix}`;
}

/**
 * This function `globToRegex` serves as the main public API for converting glob patterns into regular expressions.
 * It handles both single and multiple glob patterns (passed as a string or an array).
 * Additional options can be provided to customize the behavior, such as `matchBase` for basename-only matching.
 * The resulting regular expression is constructed by calling `globToRegexString` for each pattern.
 * An error is thrown if the generated regular expression is invalid.
 */
export function globToRegex(
	glob: string | readonly string[],
	options?: Options,
) {
	const reStr =
		typeof glob === 'string'
			? globToRegexString(glob, options)
			: `(?:${glob.map(g => globToRegexString(g, options)).join('|')})`;

	try {
		return new RegExp(reStr);
	} catch (e) {
		throw new Error(`Invalid glob "${glob}" (${reStr})`);
	}
}
