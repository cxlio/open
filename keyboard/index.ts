interface Key {
	ctrlKey: boolean;
	altKey: boolean;
	shiftKey: boolean;
	metaKey: boolean;
	key: string;
	code: string;
}

/**
 * The `KeyboardOptions` interface defines the configuration needed to handle keyboard interactions with
 * a specific HTML element.
 */
export interface KeyboardOptions {
	/**
	 * Specifies the HTML element on which keyboard events are captured.
	 * This element will receive focus and listen for key events.
	 */
	element: HTMLElement;

	/**
	 * A callback function that processes key events. It receives the current key being pressed
	 * and the sequence of keys accumulated so far. It returns `true` or `false` to indicate whether
	 * the sequence was consumed.
	 */
	onKey: (key: string, sequence: string[]) => boolean;

	/**
	 * The time in milliseconds to wait between key presses before resetting the sequence.
	 * Defaults to 250ms if not provided, ensuring thoughtful key sequences rather than accidental key presses.
	 */
	delay?: number;

	/**
	 * Optional parameter to specify a custom `KeyboardLayout`.
	 * Defaults to 'en-US' if not provided. This affects how key combinations and modifier keys are interpreted.
	 */
	layout?: KeyboardLayout;

	/**
	 * Boolean indicating whether to capture key events in the capture phase.
	 * This determines when the event listener reacts in the event propagation flow.
	 */
	capture?: boolean;
}

/**
 * The `KeyboardLayout` interface describes how a keyboard layout should be structured internally.
 */
export interface KeyboardLayout {
	/**
	 * A mapping of shifted keys to their non-shifted counterparts, used to accurately
	 * interpret which character a shifted key press represents.
	 */
	shiftMap: Record<string, string | undefined>;

	/**
	 * Indicates whether the 'meta' or 'ctrl' key is the primary modifier used for commands,
	 * differing based on the operating system (e.g., 'metaKey' for macOS).
	 */
	modKey?: 'metaKey' | 'ctrlKey';

	/**
	 * Describes a function that translates a `Key` object (representing a keyboard event) to a character string.
	 */
	translate(ev: Key): string;
}

interface InternalKeyboardLayout extends KeyboardLayout {
	modKey: 'metaKey' | 'ctrlKey';

	altName: 'option' | 'alt';
	modName: 'meta' | 'cmd';
}

const navigator =
	typeof window !== 'undefined'
		? window.navigator
		: { language: 'en-US', platform: 'nodejs' };

const IS_MAC = /Mac|iPod|iPhone|iPad/;
const PARSE_KEY =
	/(shift|ctrl|control|alt|option|meta|command|cmd|mod|[^\s+]+)(\s*\+|\s)?/g;

const SHIFT_MAP: Record<string, string | undefined> = {
	'?': '/',
	'>': '.',
	'<': ',',
	'"': "'",
	':': ';',
	'{': '[',
	'}': ']',
	'|': '\\',
	'~': '`',
	'+': '=',
	_: '-',
	'!': '1',
	'@': '2',
	'#': '3',
	$: '4',
	'%': '5',
	'^': '6',
	'&': '7',
	'*': '8',
	'(': '9',
	')': '0',
};

const TranslateKey: Record<string, string | undefined> = {
	ArrowUp: 'up',
	ArrowDown: 'down',
	ArrowLeft: 'left',
	ArrowRight: 'right',
	Escape: 'esc',
	Space: 'space',
	Backquote: '`',
	Minus: '-',
	Equal: '=',
	BracketLeft: '[',
	BracketRight: ']',
	Quote: "'",
	Backslash: '\\',
	Apostrophe: "'",
	Semicolon: ';',
	Comma: ',',
	Period: '.',
	Slash: '/',
};

export const enUsKeyboardLayout = {
	shiftMap: SHIFT_MAP,
	/**
	 * The `translate` method converts a `Key` event into a string representation.
	 * Firstly, it checks the `TranslateKey` map for special keys (like arrows or space),
	 * which have predefined string values. For keys corresponding to
	 * alphabet letters and numbers, the method derives the letter from
	 * the key `code`, ensuring it's lowercase for uniformity.
	 * If none of these match, it defaults to using the `key` property,
	 * which allows handling other miscellaneous keys gracefully.
	 */
	translate({ code, key }: Key) {
		const translated = TranslateKey[code];
		if (translated) return translated;
		if (code.startsWith('Key')) return code.slice(3).toLowerCase();
		if (code.startsWith('Digit')) return code.slice(5);
		return key.toLowerCase();
	},
};

export const KeyboardLayoutData: Record<string, KeyboardLayout> = {
	'en-US': enUsKeyboardLayout,
};

/**
 * The `keyboardEventToString` function converts a `Key` object to a string that represents the key combination pressed.
 * It checks individual modifier keys (`ctrlKey`, `altKey`, `shiftKey`, and `metaKey`) and constructs a concatenated
 * string reflecting these modifiers followed by the translated character key.
 *
 * Exceptions include when the `key` is 'Shift', 'Alt', 'Meta', 'Control', or 'Dead' without an `altKey`,
 * as these are discarded (represented by an empty string). If no modifiers are pressed, it directly returns
 * the translated character.
 *
 * This conversion provides a consistent way to describe key combinations as strings, essential for handling
 * and processing keyboard shortcuts or sequences in the application.
 */
function keyboardEventToString(
	ev: Key,
	{ translate, altName, modName }: InternalKeyboardLayout,
) {
	const key = ev.key;
	if (
		!key ||
		key === 'Shift' ||
		key === 'Alt' ||
		key === 'Meta' ||
		key === 'Control' ||
		(key === 'Dead' && !ev.altKey)
	)
		return '';

	const ch = translate(ev);
	let result;
	if (ev.ctrlKey) result = 'ctrl';
	if (ev.altKey) result = result ? result + '+' + altName : altName;
	if (ev.shiftKey) result = result ? result + '+shift' : 'shift';
	if (ev.metaKey) result = result ? result + '+' + modName : modName;

	return result ? result + '+' + ch : ch;
}

/**
 * The `handleKeyboard` function sets up event listeners to handle keyboard events on a given HTML element.
 * It accepts a  configuration object (`KeyboardOptions`) which includes the target HTML element, a callback
 * `onKey` to handle keyboard sequences, a `delay` for typing sequence recognition, an optional keyboard
 * layout, and an optional capture mode for events.
 *
 * - Defaults the delay to 250ms if not specified, using this delay to determine when to treat subsequent
 *   key presses as part of the same sequence or a new one.
 * - Determines the keyboard layout, either from the provided options or defaults, which affects how keys
 *   (especially with modifiers) are interpreted.
 * - Adds a `keydown` event listener to the provided element, allowing modification of event behavior such
 *   as propagation and default handling based on the `onKey` callback result.
 * - Builds a key sequence based on timing and calls the `onKey` handler with the assembled sequence,
 *   stopping event propagation based on handler response.
 * - The handler uses the sequence to manage shortcuts and performs preventative measures against default
 *   browser actions.
 * @return A cleanup function that removes the event listener.
 */
export function handleKeyboard({
	element,
	onKey,
	delay,
	layout,
	capture,
}: KeyboardOptions): () => void {
	const D = delay === undefined ? 250 : delay;
	let sequence: string[] = [];
	let lastT = 0;

	layout ??= getDefaultLayout();
	const newLayout = augmentLayout(layout);

	function handler(ev: KeyboardEvent) {
		const k = keyboardEventToString(ev, newLayout);
		let t = Date.now();
		if (!k) return;

		if (t - lastT < D) sequence.push(k);
		else sequence = [k];

		const seq = sequence.slice(0);

		do {
			if (onKey(seq.join(' '), sequence) !== false) {
				ev.stopPropagation();
				ev.preventDefault();
				t = 0;
				break;
			}
			seq.shift();
		} while (seq.length);

		lastT = t;
	}
	element.addEventListener('keydown', handler, { capture });
	return () => element.removeEventListener('keydown', handler, { capture });
}

/**
 * Retrieves the default `KeyboardLayout` based on the current user's language settings from `navigator.language`.
 * Falls back to the 'en-US' layout if the user's specific language is not available in `KeyboardLayoutData`.
 * This function ensures that the keyboard handling adapts to the most suitable layout for the user.
 * It facilitates accurate  interpretation of key sequences and modifiers according to locale preferences.
 */
function getDefaultLayout(): KeyboardLayout {
	return KeyboardLayoutData[navigator.language] ?? enUsKeyboardLayout;
}

function newKey(): Key {
	return {
		ctrlKey: false,
		shiftKey: false,
		metaKey: false,
		altKey: false,
		key: '',
		code: '',
	};
}

/**
 * This function, `parseKey`, takes a key combination string and splits it into a sequence of `Key` objects.
 * It uses regular  expressions to identify each part of the key combination, accounting for modifier keys
 * like 'shift', 'ctrl', 'alt', 'meta', and 'mod', the latter being dependent on the `modKey` from the
 * `KeyboardLayout` (either 'ctrlKey' or 'metaKey' depending on the platform). For non-modifier keys, it
 * checks if the `shiftKey` is active and if the key should be shifted using the `shiftMap`. This logic
 * ensures the function captures accurate key state details in preparation for further handling like matching
 * key sequences in the `handleKeyboard` function.
 */
function _parseKey(
	key: string,
	{ modKey, shiftMap }: InternalKeyboardLayout,
): Key[] {
	const sequence: Key[] = [];
	let match: RegExpExecArray | null;
	let event = newKey();

	while ((match = PARSE_KEY.exec(key.toLowerCase()))) {
		const ch = match[1] ?? '';
		if (ch === 'shift') event.shiftKey = true;
		else if (ch === 'ctrl' || ch === 'control') event.ctrlKey = true;
		else if (ch === 'alt' || ch === 'option') event.altKey = true;
		else if (ch === 'meta' || ch === 'cmd' || ch === 'command')
			event.metaKey = true;
		else if (ch === 'mod') event[modKey] = true;
		else {
			const shifted = shiftMap[ch];
			if (shifted) {
				event.key = shifted;
				event.shiftKey = true;
			} else event.key = ch;
		}

		if (match[2] !== '+') {
			sequence.push(event);
			event = newKey();
		}
	}
	return sequence;
}

function augmentLayout(layout: KeyboardLayout): InternalKeyboardLayout {
	const isMac = IS_MAC.test(navigator.platform);
	return {
		modKey: isMac ? 'metaKey' : 'ctrlKey',
		altName: isMac ? 'option' : 'alt',
		modName: isMac ? 'cmd' : 'meta',
		...layout,
	};
}

export function parseKey(
	key: string,
	layout: KeyboardLayout = getDefaultLayout(),
) {
	return _parseKey(key, augmentLayout(layout));
}

/**
 * Converts a string representing a key combination into a normalized string format.
 * This function takes a `key` string and an optional `layout` object (defaults to the user's layout).
 *
 * It uses `parseKey` to break the key combination into individual `Key` objects, each representing
 * a parsed key press. It then converts each `Key` object back to a string using `keyboardEventToString`,
 * considering the layout's details. This is useful
 * for ensuring consistent representation of key sequences across different keyboard layouts.
 */
export function normalize(key: string, layout = getDefaultLayout()): string {
	const newLayout = augmentLayout(layout);
	const sequence = _parseKey(key, newLayout);
	return sequence.map(key => keyboardEventToString(key, newLayout)).join(' ');
}
