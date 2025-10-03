import { TestApi } from '../spec/index.js';
import { Component, getRegisteredComponents } from './component.js';
//import { FocusableComponent } from './focusable.js';
import { Input } from './input.js';
//import { InputProxy } from './input-proxy.js';
//import { Option } from './option.js';
//import { trigger } from './dom.js';
//import type { Radio } from './radio.js';

export interface TestComponentOptions {
	a: TestApi;
	def: new () => Component;
	tagName: string;
	measure?: Record<string, (test: TestApi) => void>;
}

export interface TestAllComponentsOptions {
	a: TestApi;
	prefix: string;
	measure?: Record<string, (test: TestApi) => void>;
}

function testInvalid(ctor: new () => Component, test: TestApi) {
	test.test('[invalid]', a => {
		const el = test.element(ctor) as Input;
		a.equal(el.invalid, false, 'Should be valid by default');

		if (el.validity) {
			a.ok(el.validity.valid);
			el.setCustomValidity('Custom Validation');
			a.equal(el.invalid, true);
			a.ok(el.matches(':invalid'), 'matches :invalid selector');
			a.ok(el.validity.customError, 'customError validity is set');
			a.ok(!el.validity.valid);
			a.equal(el.validationMessage, 'Custom Validation');
			el.setCustomValidity('');
			a.equal(el.invalid, false, 'empty string should reset validity');
			a.ok(el.matches(':valid'), 'should match :valid selector');
			a.ok(el.validity.valid);
			a.ok(!el.validity.customError);
			a.equal(el.validationMessage, '');
		}
	});
}

/**
 * Tests the `<slot>` element within the component. The test creates a dummy element with
 * the same name as the slot and appends it to the component's shadow root. This simulates
 * a scenario where a child element is slotted into the component. The test asserts that
 * the shadow root exists, the slot is created, and the slotchange event is fired when
 * the child element is added to the component's shadow root. The slotchange event handler
 * also verifies that the child element's `slot` attribute is correctly set to the slot name.
 */
function testSlot(
	ctor: new () => Component,
	slot: HTMLSlotElement,
	test: TestApi,
) {
	const name = slot.name;
	test.test(`<slot name=${name}>`, (a: TestApi) => {
		const done = a.async();
		const el = test.element(ctor);
		const child = document.createElement(name);

		a.assert(el.shadowRoot, 'Element has a shadow root');
		const newSlot = el.shadowRoot.querySelector(`slot[name="${name}"]`);

		a.ok(el.isConnected);
		a.assert(newSlot, 'Slot was created');
		newSlot.addEventListener('slotchange', () => {
			a.equal(child.slot, name);
			done();
		});
		el.appendChild(child);
	});
}

function testStringValue(
	tagName: string,
	test: TestApi,
	value1: unknown = 'initial',
	value2: unknown = 'Hello World',
) {
	test.test('[value] string', (a: TestApi) => {
		a.dom.innerHTML = `<${tagName} value="${value1}" />`;
		const el = a.dom.firstChild as Input;
		a.assert(el);
		a.equal(el.value, value1);
		el.value = value2;
		a.equal(el.value, value2, 'value should be set immediately');
	});
}

function testBooleanValue(tagName: string, test: TestApi) {
	test.test('[value] boolean', (a: TestApi) => {
		a.dom.innerHTML = `<${tagName} value />`;
		const el = a.dom.firstChild as ChildNode & { value: boolean };
		a.assert(el);
		a.equal(el.value, true);
		el.value = false;
		a.equal(el.value, false, 'value should be set immediately');
		el.value = true;
		a.equal(el.value, true, 'value should be set immediately');
	});
}

/*function testSelectValue(tagName: string, test: TestApi) {
	test.test('[value] select', (a: TestApi) => {
		a.dom.innerHTML = `
<${tagName}>
	<option value="option-0">Option 0</option>
	<option value="option-1">Option 1</option>
	<option value="option-2">Option 2</option>
	<option value="option-3">Option 3</option>
</${tagName}>`;
		const el = a.dom.firstElementChild as HTMLSelectElement;
		a.assert(el);
		a.equal(el.value, 'option-0');
		el.value = 'option-1';
		a.equal(el.value, 'option-1');
	});
}*/

function getTestValues(
	el: Input,
): [
	'date' | 'string' | 'boolean' | 'array' | 'number' | 'select',
	unknown,
	unknown,
] {
	if (el.tagName === 'C-COLORPICKER')
		return ['string', '#0000ffff', '#ff0000ff'];
	if (el.tagName === 'C-COLORPICKER-SATURATION')
		return ['array', [0, 1, 1, 1], [0, 0.5, 1, 1]];

	if (
		[
			'C-CALENDAR',
			'C-CALENDAR-MONTH',
			'C-CALENDAR-MONTH-INPUT',
			'C-CALENDAR-YEAR',
			'C-DATEPICKER',
			'C-INPUT-DATE',
		].includes(el.tagName)
	)
		return ['date', new Date(), new Date()];

	if ('selected' in el) return ['select', 'option-1', 'option-2'];

	const type = typeof el.value;

	if (type === 'boolean') return [type, !el.value, el.value];
	if (
		type === 'number' ||
		['C-INPUT-CURRENCY', 'C-INPUT-NUMBER'].includes(el.tagName)
	)
		return ['number', 0.5, 1];

	return ['string', 'event 1', 'event 2'];
}

function testValue(ctor: new () => Component, a: TestApi) {
	const el1 = a.element(ctor) as Input;

	if (['C-OPTION', 'C-PROGRESS', 'C-PROGRESS-CIRCULAR'].includes(el1.tagName))
		return;

	const [type, value1, value2] = getTestValues(el1);

	if (type === 'string') testStringValue(el1.tagName, a, value1, value2);
	else if (type === 'boolean') testBooleanValue(el1.tagName, a);
	//else if (type === 'select') testSelectValue(el1.tagName, a);

	const el2 = a.element('div');
	el2.append(el1);

	/*a.testEvent({
		element: el1,
		eventName: 'update',
		trigger: el => (el.value = value1),
	});

	a.testEvent({
		element: el1,
		listener: el2,
		eventName: 'update',
		trigger: () => (el1.value = value2),
	});*/
}

function testChecked(ctor: new () => Component, test: TestApi) {
	test.test('[checked]', a => {
		const c = test.element(ctor) as unknown as HTMLInputElement;
		const resolve = a.async();
		a.equal(c.checked, false, 'Should be false by default');
		a.equal(
			c.getAttribute('aria-checked'),
			'false',
			'[aria-checked] must be set to "false" if [checked] is false.',
		);
		if (c.value !== undefined) {
			a.test('checked attribute set', a => {
				a.dom.innerHTML = `<${c.tagName} checked>`;
				const c2 = a.dom.children[0] as HTMLInputElement;
				a.equal(c2.checked, true);
			});

			a.test('value attribute set', a => {
				a.dom.innerHTML = `<${c.tagName} value="true">`;
				const c2 = a.dom.children[0] as HTMLInputElement;
				a.equal(c2.checked, false);
				a.equal(c2.value, 'true');
			});
		}

		function handler() {
			a.equal(c.checked, true, '"change" event fired');
			a.equal(
				c.getAttribute('aria-checked'),
				'true',
				'[aria-checked] must be set to "true" if [checked] is true.',
			);
			c.removeEventListener('change', handler);
			resolve();
		}
		c.addEventListener('change', handler);
		c.click();
	});
}

type FocusableElement = HTMLInputElement & { touched: boolean };

function testTouched(ctor: new () => Component, test: TestApi) {
	test.test('[touched]', a => {
		const c = test.element(ctor) as unknown as FocusableElement;
		let onFocus = false;
		a.equal(c.touched, false);

		if (c.tagName === 'C-INPUT-FILE') return;

		c.onfocus = () => (onFocus = true);
		c.focus();
		a.ok(c.matches(':focus-within'), 'Element should be focused');
		a.ok(onFocus, 'Element should trigger focus event');
		let onBlur = false;
		c.onblur = () => (onBlur = true);

		const unfocus = document.createElement('input');
		a.dom.appendChild(unfocus);
		unfocus.focus();
		a.equal(c.touched, true, 'Element should be marked as touched on blur');
		a.ok(onBlur, '"blur" event should trigger');
		a.ok(!c.matches(':focus-within'), 'Element was unfocused');
	});
}

function testDisabled(ctor: new () => Component, test: TestApi) {
	test.test('[disabled]', a => {
		const el = test.element(ctor) as Input;
		a.equal(
			el.disabled,
			false,
			'Component should not be disabled by default',
		);
		a.ok(
			!el.hasAttribute('aria-disabled'),
			'aria-disabled must not be set by default',
		);

		el.disabled = true;
		a.ok(el.tabIndex === -1, 'Disabled Element is not focusable');
		a.ok(
			el.hasAttribute('disabled'),
			'Disabled attribute must be reflected',
		);
		a.equal(
			el.getAttribute('aria-disabled'),
			'true',
			'aria-disabled must be set',
		);

		a.ok(!el.matches(':focus'), 'Element remains unfocused');
		el.focus();
		a.ok(!el.matches(':focus'), 'Disabled element does not receive focus');
		const styles = getComputedStyle(el);
		if (styles.display !== 'contents')
			a.equal(
				styles.pointerEvents,
				'none',
				'Pointer events should be disabled',
			);
	});
}

/*function testButtonKeyboard(element: HTMLElement, a: TestApi) {
	a.testEvent({
		element,
		eventName: 'click',
		trigger: () => triggerKeydown(element, 'Enter'),
		testName: 'trigger onclick when Enter key is pressed',
	});
	a.testEvent({
		element,
		eventName: 'click',
		trigger: () => triggerKeydown(element, ' '),
		testName: 'trigger onclick when Spacebar key is pressed',
	});
}*/

function testButtonLike(
	ctor: new () => Component,
	test: TestApi,
	role: string,
) {
	test.test('[tabindex] respect initial value', a => {
		const el = new ctor();
		el.tabIndex = 5;
		a.dom.append(el);
		a.equal(el.tabIndex, 5);
	});

	test.test(`[role=${role}]`, a => {
		const el = test.element(ctor);
		a.equal(el.tabIndex, role === 'menuitem' ? -1 : 0);
		//testButtonKeyboard(el, a);
	});
}

function testImage(ctor: typeof Component, test: TestApi) {
	test.test('[role=img]', a => {
		a.ok(
			ctor.observedAttributes?.includes('alt'),
			'Must have an alt attribute',
		);
		const el = test.element(
			ctor as new () => Component,
		) as unknown as HTMLImageElement;
		el.alt = 'alt';
		a.equal(
			el.getAttribute('alt'),
			'alt',
			'alt attribute must be reflected',
		);
	});
}

type Tester = (ctor: new () => Component, fn: TestApi) => void;

const attributeTest: Record<string, Tester> = {
	disabled: testDisabled,
	value: testValue,
	checked: testChecked,
	touched: testTouched,
	invalid: testInvalid,
};

function testAttributes(ctor: new () => Component, a: TestApi) {
	const attributes = (ctor as typeof Component).observedAttributes;
	const set = new Set(attributes);

	a.assert(attributes);
	a.equal(
		attributes.length,
		set.size,
		'Should not have duplicate attributes',
	);

	attributes.forEach(attr => {
		a.ok(attr.toLowerCase() === attr, `${attr} should be lowercase`);
		if (attr in attributeTest) attributeTest[attr](ctor, a);
	});
}

function testFormSupport(a: TestApi, el: Input) {
	const form = a.element('form');
	el.name = 'name';
	form.append(el);

	// Proxy Inputs do not require a role
	/*if (!(el instanceof InputProxy))
		a.ok(
			el.getAttribute('role'),
			'Input component must have an assigned aria role',
		);*/

	const [, , val2] = getTestValues(el);

	// If input is a SelectableHost, it needs to have an option.
	/*if ('selected' in el) {
		const option = new Option();
		const option2 = new Option();
		option2.value = val2;
		option.value = val;
		option.selected = true;
		el.append(option, option2);
	}*/
	const isCheckable = 'checked' in el;

	const initialVal = el.value !== undefined ? String(el.value) : null;
	a.equal(form.elements[0], el, 'form.elements includes component');
	a.equal(form.elements.length, 1, 'should only register one component');

	// checked must be true for value to be in FormData
	if (isCheckable) el.checked = true;
	else el.value = val2;

	const data = new FormData(form);
	a.equal(data.get('name'), String(el.value), 'value exists in form data');
	if (!isCheckable) a.equal(data.get('name'), String(val2));

	form.reset();
	const data2 = new FormData(form);
	a.equal(data2.get('name'), isCheckable ? null : initialVal);
	a.equal(
		el.value === undefined ? null : String(el.value),
		initialVal,
		'"reset" event',
	);
}

/*function testProxiedInput(
	def: new () => InputProxy,
	el: Component,
	a: TestApi,
) {
	a.test('Proxied Input', a => {
		const element = a.element(def);
		a.dom.append(element);
		a.testEvent({
			element,
			eventName: 'input',
			trigger: () => {
				trigger(element.children[0], 'input', { bubbles: true });
			},
		});
		a.testEvent({
			element,
			eventName: 'change',
			trigger: () => {
				trigger(element.children[0], 'change', { bubbles: true });
			},
		});
	});
	if (el.tagName !== 'C-INPUT-FILE')
		a.testElement('onchange', async a => {
			const element = a.element(def);
			const [, value] = getTestValues(element);

			const promise = new Promise<void>(
				resolve =>
					(element.onchange = ev => {
						a.equal(ev.target, element);
						a.equal(ev.type, 'change');
						resolve();
					}),
			);

			element.focus();

			for (const ch of String(value))
				await a.action({ type: 'press', value: ch, element });
			await a.action({ type: 'press', value: 'Tab', element });

			return promise;
		});
}*/

//const changeOnClick = (el: Input) => el.click();
/*const changeSelect = (el: Input) => {
	el.innerHTML = `
<c-option value="a">A</c-option>
<c-option value="b" selected>B</c-option>
`;
	(el.children[0] as HTMLElement).click();
};
const changeOnClickShadow =
	(...sel: string[]) =>
	(el: HTMLElement) => {
		const target = sel.reduce<HTMLElement | undefined>(
			(acc, selector) =>
				acc?.shadowRoot?.querySelector(selector) ?? undefined,
			el,
		);
		//(el.shadowRoot?.querySelector(sel) as HTMLElement).click();
		target?.click();
	};
	*/

/*const onChangeTest: Record<
	string,
	((a: Input) => void) | { count: number; trigger: (a: Input) => void }
> = {
	'C-BUTTON-SEGMENTED': changeSelect,
	'C-CALENDAR-MONTH': changeOnClickShadow('c-calendar-date'),
	'C-CALENDAR-MONTH-INPUT': changeOnClickShadow('c-calendar-date'),
	'C-CALENDAR-YEAR': changeOnClickShadow(
		'c-calendar-month-input',
		'c-calendar-date',
	),
	'C-CHECKBOX': changeOnClick,
	'C-COLORPICKER': {
		count: 2,
		trigger: el => {
			const sliders = el.shadowRoot?.querySelectorAll('c-slider-knob');
			sliders?.[0].dispatchEvent(
				new KeyboardEvent('keydown', { key: 'ArrowRight' }),
			);
			sliders?.[1].dispatchEvent(
				new KeyboardEvent('keydown', { key: 'Home' }),
			);
		},
	},
	'C-COLORPICKER-SATURATION': el => {
		const knob = el.shadowRoot?.querySelector('.knob') as HTMLElement;
		knob?.focus();
		knob?.dispatchEvent(
			new KeyboardEvent('keydown', { key: 'ArrowRight' }),
		);
	},
	'C-DATASET-SELECT': changeOnClick,
	'C-DATASET-SELECT-ALL': changeOnClick,
	'C-DATEPICKER': changeOnClickShadow(
		'c-calendar-month-input',
		'c-calendar-date',
	),
	'C-INPUT-RATING': {
		count: 2,
		trigger: el => {
			(el.shadowRoot?.children[1] as HTMLElement).click();
			el.shadowRoot?.dispatchEvent(
				new KeyboardEvent('keydown', { key: 'Escape' }),
			);
		},
	},
	'C-MULTISELECT': changeSelect,
	'C-RADIO': changeOnClick,
	'C-SELECT': changeSelect,
	'C-SLIDER': {
		count: 2,
		trigger: el => {
			el.dispatchEvent(
				new KeyboardEvent('keydown', { key: 'ArrowRight' }),
			);
			el.dispatchEvent(new KeyboardEvent('keydown', { key: 'Home' }));
		},
	},
	'C-SLIDER-KNOB': {
		count: 2,
		trigger: el => {
			el.dispatchEvent(
				new KeyboardEvent('keydown', { key: 'ArrowRight' }),
			);
			el.dispatchEvent(new KeyboardEvent('keydown', { key: 'End' }));
		},
	},
	'C-SLIDER-REVEAL': {
		count: 2,
		trigger: el => {
			el.dispatchEvent(
				new KeyboardEvent('keydown', { key: 'ArrowRight' }),
			);
			el.dispatchEvent(new KeyboardEvent('keydown', { key: 'End' }));
		},
	},
	'C-SWITCH': changeOnClick,
};*/

function testInput(def: new () => Input, a: TestApi, _instance: Input) {
	a.test('Native form support', a => {
		const el = a.element(def);
		testFormSupport(a, el);
	});
	/*a.test('associates with label', a => {
		const el = a.element(def);
		const label = document.createElement('label');
		label.textContent = 'Label';
		label.htmlFor = el.id = `input-${a.id}`;
		a.dom.append(label, el);
		label.click();
		a.ok(el.matches(':focus-within'), 'Input should focus on label click');
	});*/
	a.test('reportValidity', a => {
		const el = a.element(def) as Input;
		el.setCustomValidity('Invalid');
		el.reportValidity();
		a.equal(
			el.invalid,
			true,
			'reportValidity should indicate custom error',
		);
		el.setCustomValidity('');
		el.reportValidity();
		a.equal(el.invalid, false, 'reportValidity should reset custom error');
	});

	a.test('validationMessage', a => {
		const el = a.element(def) as Input;
		el.setCustomValidity('Validation Message');
		a.equal(
			el.validationMessage,
			'Validation Message',
			'Should return the set validation message',
		);
		el.setCustomValidity('');
		a.equal(
			el.validationMessage,
			'',
			'Should reset the validation message',
		);
	});

	a.test('validity', a => {
		const el = a.element(def) as Input;
		a.ok(el.validity, 'Element should have a validity property');
		a.ok(el.validity?.valid, 'Element should be valid initially');
		el.setCustomValidity('Custom error');
		a.ok(
			!el.validity?.valid,
			'Element should be invalid after setting custom error',
		);
		a.ok(
			el.validity?.customError,
			'customError should be true after setting',
		);
		el.setCustomValidity('');
		a.ok(
			el.validity?.valid,
			'Element should be valid again after clearing error',
		);
		a.ok(
			!el.validity?.customError,
			'customError should be false after clearing',
		);
	});

	/*if (!(instance instanceof InputProxy)) {
		a.test('onchange', async (a: TestApi) => {
			const el = a.element(def) as Input;
			const trigger = onChangeTest[el.tagName];
			a.assert(trigger, 'On change trigger not defined');
			await a.expectEvent({
				element: el,
				listener: a.dom,
				eventName: 'change',
				...(typeof trigger === 'function'
					? {
							trigger,
					  }
					: trigger),
			});
		});
	}*/

	a.test('should not trigger change event on connect', a => {
		const el = new def();
		el.onchange = () => {
			throw new Error(
				`${el.tagName} should not trigger change event on connect`,
			);
		};
		a.dom.append(el);
		a.ok(el);
	});

	a.test('oninvalid', async (a: TestApi) => {
		const el = a.element(def) as Input;
		await a.expectEvent({
			element: el,
			eventName: 'invalid',
			trigger: () => {
				el.setCustomValidity('Error');
			},
		});
	});

	/*a.test('should have at least one focusable element', a => {
		const el = a.element(def) as Input;

		if (el.tagName === 'C-INPUT-FILE')
			return a.ok(true, 'Element does not receive focus.');

		const hasTabIndex = (el: Element) => {
			if ((el as HTMLElement).tabIndex > -1) return true;
			for (const child of el.children) {
				if (hasTabIndex(child)) return true;
			}

			if (el.shadowRoot) {
				for (const child of el.shadowRoot.children) {
					if (hasTabIndex(child)) return true;
				}
			}
		};

		a.ok(hasTabIndex(el), 'Must have a focusable element');
	});*/
}

export function testComponent({
	def,
	tagName,
	a,
	measure,
}: TestComponentOptions) {
	const el = a.element(def);
	const attributes = (def as typeof Component).observedAttributes;
	const role = el.getAttribute('role');

	a.equal(el.isConnected, true, 'Component element is connected');
	a.equal(el.tagName, tagName.toUpperCase());

	if ('value' in el && el.tagName !== 'C-INPUT-FILE')
		a.ok(
			attributes?.includes('value'),
			'value property must be marked as attribute',
		);

	if (
		role === 'button' ||
		role === 'tab' ||
		role === 'checkbox' ||
		role === 'radio' ||
		role === 'menuitem' ||
		role === 'switch'
	)
		testButtonLike(def, a, role);
	if (role === 'img') testImage(def, a);
	if (attributes) testAttributes(def, a);
	if (measure && el.tagName in measure) measure[el.tagName](a);

	if (el instanceof Input) testInput(def as new () => Input, a, el);
	/*if (el instanceof InputProxy)
		testProxiedInput(def as new () => InputProxy, el, a);*/

	const slots = el.shadowRoot?.querySelectorAll('slot');
	if (slots) {
		let unnamedSlots = 0;
		for (const slot of slots) {
			if (!slot.name) unnamedSlots++;
			else if (slot.name.startsWith('c-'))
				testSlot(def, slot as HTMLSlotElement, a);
		}
		a.ok(unnamedSlots <= 1, 'should have at most one unnamed slot');
	}
}

export function testAllComponents({
	prefix,
	a,
	measure,
}: TestAllComponentsOptions) {
	const components = getRegisteredComponents();
	for (const tagName of Object.keys(components).sort()) {
		if (tagName.startsWith(prefix))
			a.test(tagName, test =>
				testComponent({
					a: test,
					def: components[tagName],
					tagName,
					measure,
				}),
			);
	}
}
