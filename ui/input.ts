import {
	Component,
	component,
	attribute,
	styleAttribute,
	attributeChanged,
	property,
	event,
	get,
} from './component.js';
import { EMPTY, Observable, observable, of, merge } from './rx.js';
import { registable } from './registable.js';
import { trigger } from './dom.js';
import {
	RuleKey,
	Validator,
	ValidationResult,
	parseRules,
} from './validation.js';
import { content } from './locale.js';

import type { AriaProperties, AriaProperty } from './a11y.js';

export type InputWithValue = Input & { inputValue?: string };

export const internals = Symbol('internals');

export function updateEvent(
	$: Component & { value?: unknown; checked?: unknown },
) {
	return onValueUpdate($).tap(() =>
		$.dispatchEvent(new Event('update', { bubbles: true })),
	);
}

function onValueUpdate(
	$: Component & { value?: unknown; checked?: unknown },
): Observable<void> {
	return merge(get($, 'value'), get($, 'checked')).map(() => undefined);
}

/**
 * The base `Input` class provides core functionality
 * for form-associated custom elements. Its purpose is to simplify the creation of input-like
 * components by standardizing handling of common features like attributes, validation,
 * form integration, and accessibility.
 *
 * Key features:
 * - Form association support (e.g., validation, resetting, form state updating).
 * - Accessible label setup, either via `aria-label` or `aria-labelledby`.
 * - Custom validity state management, allowing detailed error messaging.
 * - Attribute handling like `autofocus`, `disabled`, and validation `rules`.
 *
 * Child components are expected to define the `value` property and may override other behaviors as needed.
 *
 */
export abstract class Input extends Component {
	/**
	 * Enables form-associated behavior for custom element inputs.
	 * This allows integration with forms, ensuring proper support for
	 * features like validation, submission, and resetting.
	 */
	static formAssociated = true;

	/**
	 * A boolean attribute specifying whether the input should receive focus automatically
	 * when the component is rendered (after a slight delay).
	 * @attribute
	 */
	autofocus = false;

	/**
	 * A boolean style attribute reflecting the current validity state of the input. Set to true when validation fails.
	 * @attribute
	 */
	invalid = false;

	/**
	 * A boolean style attribute indicating whether the input is disabled for user interaction.
	 * @attribute
	 */
	disabled = false;

	/**
	 * A boolean style attribute to track whether the user has interacted with the input.
	 * @attribute
	 */
	touched = false;

	/**
	 * A string or an array of rules (either rule keys or validator functions) used for input validation.
	 * Refer to the [Input Validation Guide](?input-validation) for details on setting up and customizing validation rules.
	 * @attribute
	 */
	rules?: string | (RuleKey | Validator)[];

	/**
	 * An object representing the current validation result of the input.
	 */
	validationResult?: ValidationResult;

	/**
	 * Represents the name of the input, used primarily for form association.
	 * When set, this attribute allows the input's value to be included in the form's submission data.
	 * @attribute
	 */
	name?: string;

	/**
	 * A map storing validation results keyed by rule or validator.
	 * Each entry represents the validity state for a specific rule.
	 */
	readonly validMap: Record<string, ValidationResult> = {};

	/**
	 * Handles the update event when the input's value or checked state changes.
	 * Unlike the change event, this also fires for programmatic updates, not just user actions.
	 */
	onupdate?: (event: Event) => void;

	/**
	 * The default value of the input. Used to reset the input
	 * to its initial state during form resets or when explicitly reset.
	 */
	readonly defaultValue: unknown;

	[internals] = this.attachInternals?.();

	/**
	 * Getter and setter for the input's value. The specific data type and behavior depend on the child component.
	 */
	abstract value: unknown;

	static {
		component(Input, {
			init: [
				styleAttribute('autofocus'),
				styleAttribute('invalid'),
				styleAttribute('disabled'),
				styleAttribute('touched'),
				attribute('rules'),
				styleAttribute('name'),
				property('validationResult'),
				event('update'),
			],
			augment: [
				host => {
					(host.defaultValue as unknown) = host.value;

					return merge(
						registable('form', host),
						attributeChanged(host, 'invalid').tap(() =>
							trigger(host, 'invalid'),
						),
						get(host, 'invalid').switchMap(v => {
							if (v) {
								host.setAria('invalid', 'true');
								if (!host.validationMessage)
									return content
										.get('validation.invalid')
										.tap(val =>
											host.setCustomValidity(val),
										);
							} else host.setAria('invalid', null);

							return EMPTY;
						}),
						observable(() => {
							if (host.autofocus)
								setTimeout(() => host.focus(), 250);
						}),
						get(host, 'rules').switchMap(rules => {
							if (!rules) return EMPTY;
							const parsed = parseRules(rules, host);
							return onValueUpdate(host)
								.switchMap(() =>
									merge(...parsed(host.value, host)).tap(
										result => host.setValidity(result),
									),
								)
								.finalize(() => host.resetValidity());
						}),
						get(host, 'value').tap(val => host.setFormValue(val)),
						get(host, 'validationResult')
							.switchMap(result => {
								if (!result || result.valid) return EMPTY;
								return result.message instanceof Observable
									? result.message
									: result.message === undefined
									? content.get('validation.invalid')
									: of(result.message);
							})
							.tap(message => {
								host.setCustomValidity(message);
							}),
					);
				},
				updateEvent,
			],
		});
	}

	get labels() {
		return this[internals].labels;
	}

	/** Getter for the input's validity state. */
	get validity(): ValidityState | null {
		return this[internals]?.validity || null;
	}

	/** Getter for the input's validation message */
	get validationMessage(): string {
		return this[internals]?.validationMessage || '';
	}

	/**
	 * Checks and displays the validity state of the input. Use this method to provide
	 * user feedback and highlight any validation errors in the UI.
	 * Returns true if the input is valid, false otherwise.
	 */
	reportValidity() {
		return this[internals]?.reportValidity() ?? true;
	}

	/**
	 * Validates the current state of the input and returns a boolean indicating its validity.
	 * This method integrates with the internal mechanism of the browser's form validation API.
	 * Returns true if the input satisfies all validation rules, or false otherwise.
	 */
	checkValidity() {
		return this[internals]?.checkValidity() ?? true;
	}

	/**
	 * Sets a custom validation message for the input. This updates the invalid and
	 * validationMessage properties and triggers an 'invalid' event if the message changes.
	 */
	setCustomValidity(msg: string) {
		const invalid = !!msg;
		const messageChanged = msg !== this.validationMessage;
		this.applyValidity(invalid, msg);
		if (this.invalid !== invalid) this.invalid = invalid;
		else if (messageChanged) trigger(this, 'invalid');
	}

	/** Resets the input value to its initial value when the form is reset. */
	formResetCallback() {
		this.value = this.defaultValue;
		this.touched = false;
	}

	/**
	 * Updates ARIA attributes on the component.
	 */
	setAria<T extends AriaProperty>(prop: T, value: AriaProperties[T] | null) {
		if (!value) this.removeAttribute(`aria-${prop}`);
		else this.setAttribute(`aria-${prop}`, value);
	}

	protected resetValidity() {
		for (const key in this.validMap) this.validMap[key] = { valid: true };
		this.resetInvalid();
	}

	protected resetInvalid() {
		this.validationResult = undefined;
		this.applyValidity(false);
		this.invalid = false;
	}

	/**
	 * Sets the overall validation result for the input based on the provided object.
	 * This method updates the validMap and validationResult properties.
	 */
	protected setValidity(result: ValidationResult) {
		this.validMap[result.key || 'invalid'] = result;
		for (const key in this.validMap) {
			const result = this.validMap[key];
			if (!result.valid) {
				return (this.validationResult = result);
			}
		}
		this.resetInvalid();
	}

	protected applyValidity(invalid: boolean, msg?: string) {
		this[internals]?.setValidity({ customError: invalid }, msg);
	}

	protected formDisabledCallback(disabled: boolean) {
		this.disabled = disabled;
	}

	protected setFormValue(val: unknown) {
		this[internals]?.setFormValue?.(val as string);
	}
}
