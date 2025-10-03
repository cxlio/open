import { EMPTY, Observable, tap, combineLatest } from './rx.js';

import { Component, getAttribute } from './component.js';

export type AriaProperties = {
	activedescendant: string;
	atomic: string;
	autocomplete: string;
	busy: string;
	checked: string;
	controls: string;
	current: string;
	describedby: string;
	details: string;
	disabled: string;
	dropeffect: string;
	errormessage: string;
	expanded: string;
	flowto: string;
	grabbed: string;
	haspopup: string;
	hidden: string;
	invalid: string;
	keyshortcuts: string;
	label: string;
	labelledby: string;
	level: string;
	live: string;
	orientation: string;
	owns: string;
	placeholder: string;
	pressed: string;
	readonly: string;
	required: string;
	selected: string;
	sort: string;
	valuemax: string;
	valuemin: string;
	valuenow: string;
	valuetext: string;
	modal: string;
	multiline: string;
	multiselectable: string;
	relevant: string;
	roledescription: string;
};

export type AriaProperty = keyof AriaProperties;
export type AriaAttributeName = `aria-${AriaProperty}`;

/**
 * Helper function to create an Observable that sets an initial attribute on a component.
 * @param name The attribute name.
 * @param value The initial value to set.
 * @returns An Observable that sets the attribute on the component.
 */
function attrInitial<T extends Component>(name: string, value: string) {
	return (ctx: T) =>
		new Observable(() => {
			if (!ctx.hasAttribute(name)) ctx.setAttribute(name, value);
		});
}

/**
 * Sets an ARIA property on a component.
 * @param prop The ARIA property name (e.g., "checked", "modal").
 * @param value The value to set for the property.
 * @returns An Observable that sets the attribute on the component.
 */
export function aria<T extends Component>(prop: AriaProperty, value: string) {
	return attrInitial<T>(`aria-${prop}`, value);
}

/**
 * Sets the value of an ARIA property on an HTML element.
 * Handles boolean and undefined values for specific properties.
 * @param host The target element.
 * @param prop The ARIA property name.
 * @returns An Observable that sets the attribute on the element.
 */
export function ariaValue(host: Element, prop: AriaProperty) {
	return tap<string | number | boolean>(val =>
		host.setAttribute(
			'aria-' + prop,
			val === true ? 'true' : val === false ? 'false' : val.toString(),
		),
	);
}

/**
 * Specialized function to set the "aria-checked" state of an element
 * Handles boolean and undefined values appropriately for mixed states
 */
export function ariaChecked(host: Element) {
	return tap<boolean | undefined>(val =>
		host.setAttribute(
			'aria-checked',
			val === undefined ? 'mixed' : val ? 'true' : 'false',
		),
	);
}

/**
 * Function to set the ARIA role of a component
 */
export function role<T extends Component>(roleName: string) {
	return attrInitial<T>('role', roleName);
}

export function ariaDescribed(target: Element, by: Element) {
	return getAriaId(by)
		.tap(id => {
			target.setAttribute('aria-describedby', id);
		})
		.finalize(() => target.removeAttribute('aria-describedby'));
}

/**
 * Sets the aria-label on a target element based on changes to a source element's attributes.
 * Considers inline content ("title" or "aria-label") and referenced elements ("aria-labelledby").
 * @param source The source element to monitor for attribute changes.
 * @param target The target element to set the aria-label on.
 * @param text An optional Observable that provides additional text for the aria-label.
 * @returns An Observable that manages the aria-label updates.
 */
export function ariaLabel(source: HTMLElement, text: Observable<string>) {
	return source.ariaLabel || source.getAttribute('aria-labelledby')
		? EMPTY
		: text.tap(v => (source.ariaLabel = v));
}

let _ariaId = 0;

export function ariaId(el: Element) {
	return (el.id ||= `cxl__${_ariaId++}`);
}

export function getAriaId(el: Element) {
	return getAttribute(el, 'id').map(id => {
		if (!id) el.id = `cxl__${_ariaId++}`;
		return el.id;
	});
}

export function ariaControls(host: Element, targets: Element[]) {
	return combineLatest(...targets.map(el => getAriaId(el))).tap(ids => {
		host.setAttribute('aria-controls', ids.join(' '));
	});
}
