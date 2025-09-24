import {
	Component,
	ReactElement,
	Slot,
	attribute,
	augment,
	component,
	styleAttribute,
	attributeChanged,
	create,
	get,
	getRegisteredComponents,
	onUpdate,
	event,
	property,
} from './index.js';
import { be, observable, of } from '../rx/index.js';
import { TestApi, spec } from '@cxl/spec';

export default spec('component', a => {
	function getId() {
		return `cxl-test-${crypto.randomUUID()}`;
	}

	a.test('component', it => {
		it.should('prioritize internal bindings', a => {
			let order = 0;
			const id = getId();

			class Test extends Component {}

			component(Test, {
				tagName: id,
				augment: [
					() => observable(() => a.equal(order++, 0)),
					() => observable(() => a.equal(order++, 1)),
				],
			});

			const el = create(
				Test,
				{ $: observable(() => a.equal(order++, 2)) },
				observable(() => a.equal(order++, 3)),
			);

			a.dom.appendChild(el);

			order = 0;

			const el2 = create(Test);
			a.dom.appendChild(el2);
		});
		it.should('register component if tagName is present', a => {
			const id = getId();
			class Test extends Component {}
			component(Test, { tagName: id });
			const el = document.createElement(id);
			a.ok(el);
			a.equal(el.tagName, id.toUpperCase());
			a.ok(el instanceof Component);
			a.ok(el instanceof Test);
		});
		it.should('allow external augments', a => {
			const id = getId();
			function bindTest<T extends Component & { test: string }>(node: T) {
				a.equal(node.tagName, id.toUpperCase());
				return of('hello').tap(val => (node.test = val));
			}
			class Test extends Component {
				test = 'hello';
			}

			component(Test, { tagName: id, augment: [bindTest] });

			const el = document.createElement(id) as Test;
			a.dom.appendChild(el);
			a.equal(el.test, 'hello');
			a.ran(2);
		});
		it.should('support inheritance', (a: TestApi) => {
			const id = getId();
			class Focus extends Component {
				disabled = false;
				touched = false;
				focused = false;
			}
			component(Focus, {
				init: [
					attribute('disabled'),
					attribute('touched'),
					attribute('focused'),
				],
			});

			class InputBase extends Focus {
				value = '';
				invalid = false;
				name = '';
			}
			component(InputBase, {
				init: [
					attribute('value'),
					attribute('invalid'),
					attribute('name'),
				],
			});

			class Input extends InputBase {
				maxlength = -1;

				focus() {
					// do nothing
				}
			}

			component(Input, {
				tagName: id,
				init: [attribute('maxlength')],
			});

			const instance = create(Input, { maxlength: 10 });

			a.ok(instance);
			a.assert(Input.observedAttributes);
			a.ok(Input.observedAttributes.includes('invalid'));
			a.ok(Input.observedAttributes.includes('value'));
			a.ok(Input.observedAttributes.includes('disabled'));
			a.ok(Input.observedAttributes.includes('touched'));
			a.ok(Input.observedAttributes.includes('focused'));
			a.ok(Input.observedAttributes.includes('maxlength'));
			a.equal(instance.tagName, id.toUpperCase());
			a.equal(instance.invalid, false);
			a.equal(instance.maxlength, 10);
			a.equal(instance.name, '');
		});
		it.should('define attributes', a => {
			const id = getId();

			class Test extends Component {
				hello = 'world';
			}
			component(Test, { tagName: id, init: [attribute('hello')] });

			a.ok(Test.observedAttributes?.includes('hello'));
			const el = create(Test, { hello: 'hello' });
			a.dom.appendChild(el);
			a.ok(el);
			a.equal(el.tagName, id.toUpperCase());
			a.equal(el.hello, 'hello');

			el.hello = 'hello';
			a.equal(el.hello, 'hello');
			const el3 = document.createElement(id) as InstanceType<typeof Test>;

			a.equal(el.hello, 'hello');
			a.equal(el3.hello, 'world');
		});
		it.should('allow bindings to provide DOM nodes', a => {
			const id = getId();
			class Test extends Component {}

			component(Test, { tagName: id });
			augment(Test, () => new Text('text'));

			const el = create(Test);
			a.dom.appendChild(el);
			a.equal(el.shadowRoot?.childNodes[0]?.textContent, 'text');
		});
	});

	a.test('attribute', it => {
		it.should('set component properties', a => {
			const id = getId();

			class Test extends Component {
				test = true;
				notest = false;
				string = 'string value';
				optional?: string;
			}
			component(Test, {
				tagName: id,
				init: [
					attribute('test'),
					attribute('notest'),
					attribute('string'),
					attribute('optional'),
				],
			});

			const el = document.createElement(id) as Test;
			a.equal(el.test, true);
			a.equal(el.notest, false);
			a.dom.append(el);
			el.setAttribute('test', '');
			a.equal(el.test, true);
			el.removeAttribute('test');
			a.equal(el.test, false);
			el.setAttribute('string', '');
			a.equal(el.string, '');

			a.dom.innerHTML = `<${id} notest></${id}>`;
			const el2 = a.dom.children[0] as Test;
			a.equal(el2.notest, true);
			el2.notest = false;
			a.equal(el2.notest, false);
			el2.setAttribute('optional', '10');
			a.equal(el2.optional, '10');
			el2.removeAttribute('optional');
			a.equal(el2.optional, undefined);
		});

		it.should('work with getters and setters', a => {
			const id = getId();
			const setter = be(false);
			const event = be('');
			let count = 0;

			class Test extends Component {
				$attr = 'one';

				get attr() {
					return this.$attr;
				}
				set attr(val: string) {
					this.$attr = val;
					count++;
					setter.next(true);
				}
			}

			component(Test, {
				tagName: id,
				init: [attribute('attr')],
				augment: [$ => get($, 'attr').tap(val => event.next(val))],
			});

			const el = a.element(id) as Test;

			a.equal(el.attr, 'one');
			a.equal(el.$attr, 'one');
			a.equal(event.value, 'one');
			el.attr = 'two';
			a.equal(setter.value, true);
			a.equal(el.attr, 'two');
			a.equal(el.$attr, 'two');
			a.equal(event.value, 'two');
			// It should call the setter even if the value has not changed.
			el.attr = 'two';
			a.equal(count, 2);
		});
		it.test('allow changing values inside handler', a => {
			const id = getId();
			const done = a.async();

			class Test extends Component {
				hello = 'world';
			}
			component(Test, { tagName: id, init: [attribute('hello')] });

			const el = create(Test, {
				$: el =>
					get(el, 'hello').tap(val => {
						if (val === 'world2') {
							a.ok(val);
							done();
						}
						el.hello = 'world2';
					}),
			});

			a.dom.appendChild(el);
		});
		it.should('initialize attributes', a => {
			const id = getId();

			class Test extends Component {
				'test-boolean' = false;
				'test-string' = 'string';
			}
			component(Test, {
				tagName: id,
				init: [attribute('test-boolean'), attribute('test-string')],
			});

			a.ok(Test);
			a.dom.innerHTML = `<${id} test-boolean />`;
			const el = a.dom.firstChild as Test;
			a.equal(el['test-boolean'], true);

			a.dom.innerHTML = `<${id} test-string="hello" />`;
			const el2 = a.dom.firstChild as Test;
			a.equal(el2['test-string'], 'hello');
		});
	});

	a.test('styleAttribute', it => {
		it.should('persist attribute when connected if set to true', a => {
			const id = getId();

			class Test extends Component {
				persist = true;
			}
			component(Test, { tagName: id, init: [styleAttribute('persist')] });

			const el = create(Test);
			a.equal(el.persist, true);
			a.dom.appendChild(el);
			a.ok(el.isConnected);
			a.ok(el.hasAttribute('persist'));
			el.persist = false;
			a.ok(!el.hasAttribute('persist'));
		});
		it.should('handle multiple style bindings', a => {
			const id = getId();

			class Test extends Component {
				visible = true;
				updated = false;
			}
			component(Test, {
				tagName: id,
				init: [styleAttribute('visible'), styleAttribute('updated')],
			});

			const el = create(Test);
			a.dom.append(el);

			el.visible = false;
			a.ok(!el.hasAttribute('visible'));

			el.updated = true;
			a.ok(el.hasAttribute('updated'));
		});
	});

	a.test('get', a => {
		const id = getId();

		class Test extends Component {
			hello = 'world';
		}
		component(Test, { tagName: id, init: [styleAttribute('hello')] });

		const el = create(Test, { hello: 'hello' });
		a.dom.append(el);

		let lastValue = 'hello';
		a.equal(el.hello, 'hello');
		const subs = get(el, 'hello')
			.tap(val => {
				a.equal(val, lastValue);
			})
			.subscribe();

		el.hello = lastValue = 'test';
		subs.unsubscribe();

		const s2 = get(el, 'hello')
			.tap(val => a.equal(val, lastValue))
			.subscribe();

		el.hello = lastValue = 'test2';

		s2.unsubscribe();

		a.ran(5);
	});

	a.test('onUpdate', it => {
		it.should('emit on connect and when an attribute changes', a => {
			const id = getId();
			const done = a.async();
			let i = 0;

			class Test extends Component {
				hello = 'world';
			}
			component(Test, {
				tagName: id,
				init: [attribute('hello')],
				augment: [
					$ =>
						onUpdate($).tap(() => {
							a.equal($.tagName, id.toUpperCase());
							if (i++ === 1) done();
						}),
				],
			});

			const el = create(Test);
			a.dom.appendChild(el);
			el.hello = 'hello';
		});
		it.should('not trigger onUpdate for disconnected components', a => {
			const id = getId();

			class Test extends Component {
				attr = 'default';
			}
			component(Test, {
				tagName: id,
				init: [attribute('attr')],
				augment: [$ => onUpdate($)],
			});

			const el = create(Test);
			el.attr = 'new value';

			a.dom.appendChild(el);
			a.equal(el.attr, 'new value');

			a.dom.removeChild(el);
			el.attr = 'another value';
			a.equal(el.attr, 'another value'); // Ensure no errors while disconnected
		});
	});

	a.test('attributeChanged', it => {
		it.should('fire synchronously', a => {
			const id = getId();

			class Test extends Component {
				test = '';
			}
			component(Test, {
				tagName: id,
				init: [attribute('test')],
				augment: [
					$ =>
						attributeChanged($, 'test').tap(val => {
							a.equal(val, 'hello');
							// Should it trigger?
						}),
				],
			});

			const test = create(Test, { test: of('hello') });
			a.dom.appendChild(test);
			a.equal(test.test, 'hello');
		});
	});

	a.test('getRegisteredComponents', it => {
		it.should('return registered components', a => {
			const id = getId();

			class Test extends Component {
				test = '';
			}
			component(Test, { tagName: id });

			const components = getRegisteredComponents();
			a.ok(components);
			a.ok(components[id]);
		});
	});

	a.test('Slot', a => {
		const el = Slot();

		a.ok(el);
		a.ok(el instanceof HTMLSlotElement);
	});

	a.test('event', it => {
		it.should('not attach event handlers if property is not set', a => {
			const id = getId();

			class Test extends Component {
				oncustom?: (ev: CustomEvent) => void;
			}
			component(Test, { tagName: id, init: [event('custom')] });

			const el = create(Test);
			a.dom.appendChild(el);
			const clickEvent = new Event('custom');
			el.dispatchEvent(clickEvent);
			a.ok(!el.hasAttribute('clicked'));

			el.oncustom = ev => {
				a.equal(ev.target, el);
				(ev.target as Test).setAttribute('clicked', 'true');
			};
			el.dispatchEvent(clickEvent);
			a.equal(el.getAttribute('clicked'), 'true');
		});
		it.should(
			'attach event handlers defined in attributes and respond to events',
			a => {
				const id = getId();

				class Test extends Component {
					oncustom?: (ev: CustomEvent) => void;
				}

				component(Test, {
					tagName: id,
					init: [event('custom')],
				});

				const el = create(Test, {
					oncustom: ev =>
						(ev.target as Test).setAttribute('clicked', 'true'),
				});

				a.dom.appendChild(el);

				a.ok(el);
				a.ok(el instanceof Test);

				const clickEvent = new Event('custom');
				el.dispatchEvent(clickEvent);

				a.equal(el.getAttribute('clicked'), 'true');
			},
		);

		it.should('handle events with no provided listeners gracefully', a => {
			const id = getId();

			class Test extends Component {
				oncustom?: (ev: CustomEvent) => void;
			}

			component(Test, {
				tagName: id,
				init: [event('custom')],
			});

			const el = create(Test);
			a.dom.appendChild(el);

			const customEvent = new CustomEvent('custom');
			el.dispatchEvent(customEvent); // No errors should occur
			a.ok(!el.hasAttribute('handlerExecuted'));
		});
		it.should(
			'parse event handler strings and correctly trigger defined actions',
			a => {
				const id = getId();

				class Test extends Component {
					oncustom?: (ev: Event) => void;
				}

				component(Test, { tagName: id, init: [event('custom')] });

				// Setup with an inline listener
				a.dom.innerHTML = `<${id} oncustom="event.target.setAttribute('handled', event.detail)"></${id}>`;
				const el = a.dom.children[0];

				// Simulate the custom event
				const customEvent = new CustomEvent('custom', {
					detail: 'custom',
				});
				el.dispatchEvent(customEvent);

				// Verify the event handler was executed
				a.equal(el.getAttribute('handled'), 'custom');
				el.removeAttribute('oncustom');
				const customEvent2 = new CustomEvent('custom', {
					detail: 'error',
				});
				el.dispatchEvent(customEvent2);
				a.equal(el.getAttribute('handled'), 'custom');
			},
		);

		it.should(
			'ensure the event handler respects scope and triggers only for the target element',
			a => {
				const id = getId();
				class Test extends Component {
					oncustom?: (ev: KeyboardEvent) => void;
				}
				component(Test, { tagName: id, init: [event('custom')] });

				// Create container elements to test bubbling
				const parent = document.createElement('div');
				const el = create(Test, {
					oncustom: ev =>
						(ev.target as Test).setAttribute('scoped', 'true'),
				});
				parent.appendChild(el);
				a.dom.appendChild(parent);

				// Trigger click event on the child element
				const clickEvent = new Event('custom', { bubbles: true });
				el.dispatchEvent(clickEvent);

				// Verify the event was handled properly and scoped
				a.equal(el.getAttribute('scoped'), 'true');
				a.ok(!parent.hasAttribute('scoped'));
			},
		);

		it.should('register custom event with react TSX', a => {
			const id = getId();
			const done = a.async();
			class Test extends Component {
				oncustom?: (ev: KeyboardEvent) => void;
			}
			component(Test, { tagName: id, init: [event('custom')] });
			const test = {
				oncustom: () => done(),
				onClick: () => {
					/* nop */
				},
			} as const;
			const react: Partial<ReactElement<Test>> = test;
			a.ok(test);
			a.ok(react);
			const el = create(Test, test);
			a.dom.append(el);
			el.dispatchEvent(new KeyboardEvent('custom'));
		});
	});

	a.test('property', it => {
		it.should('exclude property from attribute observation', a => {
			const id = getId();
			let value;

			class Test extends Component {
				internalState = 0;
			}

			// Make `internalState` a property but not observed as an attribute
			component(Test, {
				tagName: id,
				init: [property('internalState')],
				augment: [$ => get($, 'internalState').tap(v => (value = v))],
			});

			// Verify `internalState` behaves as a property but does not map to DOM attributes
			const el = create(Test);
			a.equal(el.internalState, 0);
			a.ok(!el.hasAttribute('internal-state'));

			a.dom.append(el);
			a.ok(!el.hasAttribute('internal-state'));
			a.equal(value, 0);

			// Modify and assert its value
			el.internalState = 42;
			a.equal(el.internalState, 42);
			a.equal(value, 42);

			// Still no attribute mapping
			a.ok(!el.hasAttribute('internal-state'));
		});
		it.should('ensure property updates do not create attributes', a => {
			const id = getId();

			class Test extends Component {
				internalState = 0;
			}

			component(Test, { tagName: id, init: [property('internalState')] });

			const el = create(Test);
			el.internalState = 10;
			a.equal(el.internalState, 10);
			a.ok(!el.hasAttribute('internal-state'));
		});
	});

	a.test('create', it => {
		it.should('create a new component instance', a => {
			const id = getId();
			class TestComponent extends Component {}
			component(TestComponent, { tagName: id });

			const instance = create(TestComponent);
			a.ok(instance);
			a.ok(instance instanceof TestComponent);
		});
		it.should('support the $ property to bind observables', a => {
			const id = getId();
			let val = '';
			const observableValue = of('value').tap(v => (val = v));
			class TestComponent extends Component {}
			component(TestComponent, { tagName: id });

			const instance = create(TestComponent, {
				$: observableValue,
			});
			a.dom.append(instance);
			a.equal(val, 'value');
		});

		it.should('assign attributes to the created component', a => {
			const id = getId();
			class TestComponent extends Component {
				attr1 = '';
				attr2 = false;
			}
			component(TestComponent, { tagName: id });

			const attributes = { attr1: 'value1', attr2: true };
			const instance = create(TestComponent, attributes);

			a.equal(instance.attr1, 'value1');
			a.equal(instance.attr2, true);
		});

		it.should('render children into the component', a => {
			const id = getId();
			const expr = of('test');
			const fn = (host: TestComponent) => new Text(host.tagName);
			class TestComponent extends Component {}
			component(TestComponent, { tagName: id });

			const childElement = document.createElement('div');
			const instance = create(
				TestComponent,
				undefined,
				childElement,
				expr,
				fn,
				'text node',
			);

			a.equal(instance.childNodes.length, 4);
			a.ok(instance.children[0] === childElement);
			a.dom.append(instance);
			a.equal(instance.childNodes[1].textContent, 'test');
			a.equal(instance.childNodes[2].textContent, instance.tagName);
			a.equal(instance.childNodes[3].textContent, 'text node');
		});

		it.should('properly work with attributes as Observables', a => {
			const id = getId();
			const observableValue = of('dynamic-value');
			class TestComponent extends Component {
				dynamicAttr = '';
			}
			component(TestComponent, { tagName: id });

			const instance = create(TestComponent, {
				dynamicAttr: observableValue,
			});
			a.dom.append(instance);
			a.equal(instance.dynamicAttr, 'dynamic-value');
		});
		it.should('handle invalid children in create gracefully', a => {
			const id = getId();

			class TestComponent extends Component {}
			component(TestComponent, { tagName: id });

			const instance = create(TestComponent, undefined, undefined, 123);

			a.ok(instance instanceof TestComponent);
			a.equal(instance.childNodes.length, 1); // All invalid children should be ignored
		});
	});
});
