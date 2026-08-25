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

function prepareGlob(glob: string, gitignore: boolean | undefined) {
	if (!gitignore)
		return { glob, anchoredToRoot: false, dirOnly: false, matchesNothing: false };
	if (glob[0] === '#' && glob[1] !== '\\')
		return { glob, anchoredToRoot: false, dirOnly: false, matchesNothing: true };
	while (glob.length > 0 && glob.endsWith(' ') && !glob.endsWith('\\ '))
		glob = glob.slice(0, -1);
	glob = glob.replace(/\\ $/, ' ');

	const anchoredToRoot = glob.startsWith('/');
	if (anchoredToRoot) glob = glob.slice(1);
	const dirOnly = glob.endsWith('/');
	if (dirOnly) glob = glob.slice(0, -1);

	return { glob, anchoredToRoot, dirOnly, matchesNothing: false };
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
	const prepared = prepareGlob(glob, gitignore);
	if (prepared.matchesNothing) return '(?!)';
	glob = prepared.glob;
	const { anchoredToRoot, dirOnly } = prepared;

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
		let a: number;

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

	let i = 0;

	function parsePunctuation(c: string, la: string | undefined) {
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
				return true;
			case '\\':
				reStr += la === '\\' ? '\\\\' : `\\${la}`;
				i++;
				isStartOfPath = false;
				return true;
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
				return true;
			case '"':
				inQuotes = !inQuotes;
				reStr += '"?';
				isStartOfPath = false;
				return true;
			case '^':
				reStr += '\\^';
				isStartOfPath = false;
				return true;
			default:
				return false;
		}
	}

	function parseModifier(c: string, la: string | undefined) {
		switch (c) {
			case '+':
				if (la !== '(') {
					reStr +=
						inParens || (glob[i - 1] === ')' && glob[i - 2] !== '\\')
							? '+'
							: '\\+';
					isStartOfPath = false;
				}
				return true;
			case '@':
				if (la !== '(') {
					reStr += '@';
					isStartOfPath = false;
				}
				return true;
			case '$':
			case '=':
				reStr += '\\' + c;
				isStartOfPath = false;
				return true;
			case '?':
				if (la !== '(') {
					reStr += !glob[i - 1] || glob[i - 1] === '/' ? '[^/.]' : '[^/]';
					isStartOfPath = false;
				}
				return true;
			default:
				return false;
		}
	}

	function parseGroup(c: string, la: string | undefined) {
		switch (c) {
			case '(':
				matchParens(i);
				return true;
			case ')':
				if (inParens) {
					const mod = parensMod.pop() || '';
					const sep = mod === ').*)' && isEndOfPath(i) ? '(?:/|$)' : '';
					inParens--;
					reStr +=
						mod === '^*' ? (isEndOfPath(i) ? ')+' : ')*') : `)${sep}${mod}`;
				} else {
					reStr += '\\)';
					isStartOfPath = false;
				}
				return true;
			case '[':
				[i, reStr] = matchBrackets(i + 1);
				return true;
			case ']':
				reStr += '\\]';
				isStartOfPath = false;
				return true;
			case '{': {
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
				return true;
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
				return true;
			default:
				return false;
		}
	}

	function parseSeparator(c: string, la: string | undefined) {
		switch (c) {
			case '|':
				reStr += gitignore && glob[i - 1] === '/' ? '?|' : '|';
				return true;
			case ',':
				if (inGroup) reStr += '|';
				else {
					reStr += '\\' + c;
					isStartOfPath = false;
				}
				return true;
			case '/':
				reStr +=
					la === '*' &&
					glob[i - 1] &&
					glob[i + 2] === '*' &&
					glob[i + 3] !== '/'
						? '/?'
						: '/';
				isStartOfPath = true;
				return true;
			default:
				return false;
		}
	}

	function parseStar(la: string | undefined) {
		if (inQuotes) {
			reStr += '\\*';
			isStartOfPath = false;
			return;
		}
		if (la === '(') return;
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
				return;
			}
			reStr +=
				glob[i - 1] === '/' || !glob[i - 1]
					? `(?:[^./][^/]*)${glob[i + 2] ? '?(?:/$)?' : '/?'}`
					: `[^/]*${glob[i + 2] ? '(?:/$)?' : '/?'}`;
			i++;
			return;
		}
		if (la === '/') {
			reStr += '(?:[^./][^/]*)?/';
			i++;
			return;
		}
		if (glob[i - 1] === '/' || !glob[i - 1])
			reStr +=
				la === '.'
					? '(?:[^./][^/]*)(?:/$)?'
					: `(?:[^./][^/]*)${la ? '?(?:/$)?' : '/?'}`;
		else reStr += `[^/]*${la ? '(?:/$)?' : '/?'}`;
		isStartOfPath = false;
	}

	while (i < len) {
		const c = glob[i];
		if (c === undefined) break;
		const la = glob[i + 1];

		const punctuation = parsePunctuation(c, la);
		if (typeof punctuation === 'string') return punctuation;
		if (
			!punctuation &&
			!parseModifier(c, la) &&
			!parseGroup(c, la) &&
			!parseSeparator(c, la)
		) {
			if (c === '*') parseStar(la);
			else {
				reStr += c;
				isStartOfPath = false;
			}
		}
		i++;
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
		throw new Error(`Invalid glob "${glob}" (${reStr})`, { cause: e });
	}
}
