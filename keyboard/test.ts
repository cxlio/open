import { TestApi, spec, mockFn } from '@cxl/spec';
import {
	KeyboardLayout,
	KeyboardLayoutData,
	normalize,
	parseKey,
	handleKeyboard,
} from './index.js';

export default spec('keyboard', s => {
	s.test('normalize', it => {
		it.should('handle empty and null inputs', a => {
			a.equal(normalize(''), '');
		});

		it.should('parse single keys', a => {
			a.equal(normalize('  x  '), 'x');
			a.equal(normalize('ctrl+x'), 'ctrl+x');
		});

		it.should('parse multiple keys', a => {
			a.equal(normalize('  x  y'), 'x y');
			a.equal(normalize('x    y'), 'x y');
			a.equal(normalize('ctrl+shift+x'), 'ctrl+shift+x');
		});

		it.should('parse mod key', a => {
			const layout: KeyboardLayout = {
				...KeyboardLayoutData['en-US'],
				modKey: 'ctrlKey',
			};
			a.equal(normalize('mod+x', layout), 'ctrl+x');
			a.equal(normalize('x+mod', layout), 'ctrl+x');
			a.equal(normalize('MOD+X', layout), 'ctrl+x');
			layout.modKey = 'metaKey';
			a.equal(normalize('mod+x', layout), 'meta+x');
			a.equal(normalize('x+mod', layout), 'meta+x');
			a.equal(normalize('MOD+X', layout), 'meta+x');
		});

		it.should('normalize shifted keys', a => {
			a.equal(normalize('%'), 'shift+5');
			a.equal(normalize('shift+A'), 'shift+a');
			a.equal(normalize('shift+y'), 'shift+y');
			a.equal(normalize('shift+ctrl+5'), 'ctrl+shift+5');
			a.equal(normalize('ctrl+%'), 'ctrl+shift+5');
		});

		it.should('handle non character keys', a => {
			a.equal(normalize(':'), 'shift+;');
			a.equal(normalize('/'), '/');
			a.equal(normalize('.'), '.');
			a.equal(normalize('?'), 'shift+/');
			a.equal(normalize('shift+/'), 'shift+/');
			//a.equal(normalize('shift++'), 'shift+=');
			a.equal(normalize('shift+?'), 'shift+/');
			a.equal(normalize('ctrl+:'), 'ctrl+shift+;');
			a.equal(normalize('ctrl+shift+?'), 'ctrl+shift+/');
			a.equal(normalize(';'), ';');
		});

		it.should('normalize special keys with modifiers', a => {
			a.equal(normalize('ctrl+alt+del'), 'ctrl+alt+del');
			a.equal(normalize('ctrl+shift+esc'), 'ctrl+shift+esc');
		});

		it.should('handle case sensitivity', a => {
			a.equal(normalize('CTRL+A'), 'ctrl+a');
			a.equal(normalize('Shift+Y'), 'shift+y');
		});

		/*it.should('handle complex sequences', a => {
			a.equal(
				normalize(' ctrl + shift + x   ctrl+y'),
				'ctrl+shift+x ctrl+y',
			);
		});*/
	});
	s.test('parseKey', it => {
		it.should('correctly parse simple keys without modifiers', a => {
			const result = parseKey('a');
			a.equal(result.length, 1);
			a.equal(result[0].key, 'a');
			a.equal(result[0].shiftKey, false);
			a.equal(result[0].ctrlKey, false);
			a.equal(result[0].altKey, false);
			a.equal(result[0].metaKey, false);
		});

		it.should('correctly parse modifier keys', a => {
			const result = parseKey('shift+b');
			a.equal(result.length, 1);
			a.equal(result[0].key, 'b');
			a.equal(result[0].shiftKey, true);
			a.equal(result[0].ctrlKey, false);
			a.equal(result[0].altKey, false);
			a.equal(result[0].metaKey, false);
		});

		it.should('correctly parse multiple keys with modifiers', a => {
			const result = parseKey('ctrl+alt+del');
			a.equal(result.length, 1);
			a.equal(result[0].key, 'del');
			a.equal(result[0].shiftKey, false);
			a.equal(result[0].ctrlKey, true);
			a.equal(result[0].altKey, true);
			a.equal(result[0].metaKey, false);
		});

		it.should('handle key sequences separated by spaces', a => {
			const result = parseKey('ctrl+a ctrl+b');
			a.equal(result.length, 2);
			a.equal(result[0].key, 'a');
			a.equal(result[0].ctrlKey, true);
			a.equal(result[1].key, 'b');
			a.equal(result[1].ctrlKey, true);
		});

		it.should('map mod key to the correct modifier', a => {
			const layout = KeyboardLayoutData['en-US'];
			const result = parseKey('mod+c', { ...layout, modKey: 'ctrlKey' });
			a.equal(result.length, 1);
			a.equal(result[0].key, 'c');
			a.equal(result[0].ctrlKey, true);
			const result2 = parseKey('mod+c', { ...layout, modKey: 'metaKey' });
			a.equal(result2.length, 1);
			a.equal(result2[0].key, 'c');
			a.equal(result2[0].metaKey, true);
		});

		it.should('handle shifted characters correctly', a => {
			const result = parseKey('shift+1');
			a.equal(result.length, 1);
			a.equal(result[0].key, '1'); // assuming shift+1 maps to '@' in shiftMap
			a.equal(result[0].shiftKey, true);
		});
		it.should('handle keys with special characters', a => {
			const result = parseKey('ctrl+shift+1');
			a.equal(result.length, 1);
			a.equal(result[0].key, '1');
			a.equal(result[0].ctrlKey, true);
			a.equal(result[0].shiftKey, true);
		});

		it.should('handle unsupported modifier combinations', a => {
			const result = parseKey('ctrl+alt+meta+z');
			a.equal(result.length, 1);
			a.equal(result[0].key, 'z');
			a.equal(result[0].ctrlKey, true);
			a.equal(result[0].altKey, true);
			a.equal(result[0].metaKey, true);
		});
		it.should('correctly parse special character keys', a => {
			const result = parseKey('ctrl+alt+!');
			a.equal(result.length, 1);
			a.equal(result[0].key, '1');
			a.equal(result[0].ctrlKey, true);
			a.equal(result[0].altKey, true);
			a.equal(result[0].shiftKey, true);
		});

		it.should('handle unsupported character sequences', a => {
			const result = parseKey('ctrl+alt+ctrl+z');
			a.equal(result.length, 1);
			a.equal(result[0].key, 'z');
			a.equal(result[0].ctrlKey, true);
			a.equal(result[0].altKey, true);
		});
	});

	s.test('handleKeyboard', it => {
		it.should('fallback to en-US layout', (a: TestApi) => {
			const event = new KeyboardEvent('keydown', { key: 'Dead' });
			const event2 = new KeyboardEvent('keydown', {
				key: 'Dead',
				altKey: true,
				code: 'Quote',
			});
			const elementMock = a.element('div');
			const onKeyMock = mockFn(key => key === 'dead');
			const on = a.spyFn(elementMock, 'addEventListener');
			const dispose = handleKeyboard({
				element: elementMock,
				onKey: onKeyMock,
				layout: undefined,
				capture: false,
			});

			a.assert(typeof on.lastEvent?.arguments[1] === 'function');
			on.lastEvent?.arguments[1](event);
			a.equal(onKeyMock.lastArguments, undefined);

			on.lastEvent?.arguments[1](event2);
			a.equal(onKeyMock.lastArguments?.[0], `alt+'`);

			dispose();
		});
		it.should('handle Dead key code', (a: TestApi) => {
			const event = new KeyboardEvent('keydown', { key: 'Dead' });
			const event2 = new KeyboardEvent('keydown', {
				key: 'Dead',
				altKey: true,
				code: 'Quote',
			});
			const elementMock = a.element('div');
			const onKeyMock = mockFn(key => key === 'dead');
			const on = a.spyFn(elementMock, 'addEventListener');
			const dispose = handleKeyboard({
				element: elementMock,
				onKey: onKeyMock,
				delay: 100,
				layout: undefined,
				capture: false,
			});

			a.assert(typeof on.lastEvent?.arguments[1] === 'function');
			on.lastEvent?.arguments[1](event);
			a.equal(onKeyMock.lastArguments, undefined);

			on.lastEvent?.arguments[1](event2);
			a.equal(onKeyMock.lastArguments?.[0], `alt+'`);

			dispose();
		});
		it.should('handle arrow keys', (a: TestApi) => {
			const eventArrowUp = new KeyboardEvent('keydown', {
				code: 'ArrowUp',
				key: 'ArrowUp',
			});
			const eventArrowDown = new KeyboardEvent('keydown', {
				code: 'KeyQ',
				key: 'KeyQ',
			});
			const eventArrowLeft = new KeyboardEvent('keydown', {
				code: 'Digit0',
				key: 'Digit0',
			});
			const eventArrowRight = new KeyboardEvent('keydown', {
				code: 'ArrowRight',
				key: 'ArrowRight',
				altKey: true,
				metaKey: true,
			});

			const elementMock = a.element('div');
			const on = a.spyFn(elementMock, 'addEventListener');
			const onKeyMock = mockFn(_k => true);
			const dispose = handleKeyboard({
				element: elementMock,
				onKey: onKeyMock,
				delay: 100,
				layout: undefined,
				capture: false,
			});

			a.assert(typeof on.lastEvent?.arguments[1] === 'function');
			on.lastEvent?.arguments[1](eventArrowUp);
			a.equal(onKeyMock.lastArguments?.[0], 'up');
			on.lastEvent?.arguments[1](eventArrowDown);
			a.equal(onKeyMock.lastArguments?.[0], 'q');
			on.lastEvent?.arguments[1](eventArrowLeft);
			a.equal(onKeyMock.lastArguments?.[0], '0');
			on.lastEvent?.arguments[1](eventArrowRight);
			a.equal(onKeyMock.lastArguments?.[0], 'alt+meta+right');

			dispose();
		});
		it.should('call onKey with the correct sequence', (a: TestApi) => {
			// Setup a mock element
			const elementMock = a.element('div');
			const on = a.spyFn(elementMock, 'addEventListener');
			const off = a.spyFn(elementMock, 'removeEventListener');

			// Setup a mock callback
			const onKeyMock = mockFn(key => (key === 'a b' ? true : false));
			// Register the handler
			const dispose = handleKeyboard({
				element: elementMock,
				onKey: onKeyMock,
				delay: 100,
				layout: undefined,
				capture: false,
			});

			// Simulate keydown events
			const eventA = new KeyboardEvent('keydown', { key: 'a' });
			const eventB = new KeyboardEvent('keydown', { key: 'b' });

			// This will call the handler linked to the event
			a.assert(typeof on.lastEvent?.arguments[1] === 'function');
			on.lastEvent?.arguments[1](eventA);
			a.equal(onKeyMock.lastArguments?.[0], 'a');
			on.lastEvent?.arguments[1](eventB);
			a.equal(onKeyMock.lastArguments?.[0], 'a b');

			// Cleanup
			dispose();
			a.equal(off.lastEvent?.called, 1);
		});

		it.should('reset sequence after delay', async (a: TestApi) => {
			const elementMock = a.element('div');
			const on = a.spyFn(elementMock, 'addEventListener');
			const off = a.spyFn(elementMock, 'removeEventListener');
			const onKeyMock = mockFn(key => (key === 'a b' ? true : false));
			const dispose = handleKeyboard({
				element: elementMock,
				onKey: onKeyMock,
				delay: 100,
				layout: undefined,
				capture: false,
			});

			// Simulate keydown event
			const eventA = new KeyboardEvent('keydown', { key: 'a' });
			a.assert(typeof on.lastEvent?.arguments[1] === 'function');
			on.lastEvent?.arguments[1](eventA);

			// Advance time beyond delay
			await new Promise(resolve => setTimeout(resolve, 200));
			a.equal(onKeyMock.lastArguments?.[0], 'a');

			// Simulate another keydown event
			const eventC = new KeyboardEvent('keydown', { key: 'c' });
			on.lastEvent?.arguments[1](eventC);
			a.equal(onKeyMock.lastArguments?.[0], 'c');

			// Cleanup
			dispose();
			a.equal(off.lastEvent?.called, 1);
		});

		it.should('handle rapid key presses correctly', (a: TestApi) => {
			const elementMock = a.element('div');
			const on = a.spyFn(elementMock, 'addEventListener');
			const onKeyMock = mockFn(key => key === 'x y');
			const dispose = handleKeyboard({
				element: elementMock,
				onKey: onKeyMock,
				delay: 100,
				layout: undefined,
				capture: false,
			});

			const eventX = new KeyboardEvent('keydown', { key: 'x' });
			const eventY = new KeyboardEvent('keydown', { key: 'y' });

			a.assert(typeof on.lastEvent?.arguments[1] === 'function');
			on.lastEvent?.arguments[1](eventX);
			on.lastEvent?.arguments[1](eventY);

			a.equal(onKeyMock.lastArguments?.[0], 'x y');

			dispose();
		});

		it.should(
			'verify event listener is removed on dispose',
			(a: TestApi) => {
				const elementMock = a.element('div');
				const off = a.spyFn(elementMock, 'removeEventListener');
				const dispose = handleKeyboard({
					element: elementMock,
					onKey: mockFn(() => true),
					delay: 100,
					layout: undefined,
					capture: false,
				});

				dispose();
				a.equal(off.lastEvent?.called, 1);
			},
		);
	});
});
