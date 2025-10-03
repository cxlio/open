import { Observable, from, of } from './rx.js';
import { Component, get } from './component.js';

import { registerText } from './locale.js';
import { getTargetById } from './util.js';

/**
 * A function that takes a value and returns a boolean or an Observable indicating whether the value is valid.
 */
export type Rule = (val: unknown) => boolean | Observable<boolean>;
export type RuleWithParameter = (param: string, host: Element) => Rule;
export type Validator = (
	val: unknown,
	host?: Element,
) =>
	| Observable<ValidationResult>
	| Promise<ValidationResult>
	| ValidationResult;
export type RuleKey =
	| 'required'
	| 'nonZero'
	| 'nonEmpty'
	| 'email'
	| 'json'
	| 'zipcode'
	| 'pattern'
	| 'equalTo'
	| 'equalToElement'
	| 'greaterThan'
	| 'greaterThanElement'
	| 'lessThan'
	| 'lessThanElement'
	| 'min'
	| 'max'
	| 'maxlength'
	| 'minlength';

export interface ValidationResult {
	valid: boolean;
	key?: string;
	message?: string | Observable<string>;
}

type InputLike = Component & { value: unknown };

const EMAIL =
	/^(([^<>()[\].,;:\s@"]+(\.[^<>()[\].,;:\s@"]+)*)|(".+"))@(([^<>()[\].,;:\s@"]+\.)+[^<>()[\].,;:\s@"]{2,})$/i;
const ZIPCODE = /^\d{5}(?:[-\s]\d{4})?$/;

export const ValidationContent: { 'validation.invalid': string } & Record<
	`validation.${RuleKey}`,
	string
> = {
	'validation.invalid': 'Invalid value',
	'validation.json': 'Invalid JSON value',
	'validation.zipcode': 'Please enter a valid zip code',
	'validation.equalTo': 'Values do not match',
	'validation.equalToElement': 'Values do not match',
	'validation.greaterThanElement': 'Values do not match',
	'validation.lessThanElement': 'Values do not match',
	'validation.required': 'This field is required',
	'validation.nonZero': 'Value cannot be zero',
	'validation.email': 'Please enter a valid email address',
	'validation.pattern': 'Invalid pattern',
	'validation.min': 'Invalid value',
	'validation.max': 'Invalid value',
	'validation.minlength': 'Invalid value',
	'validation.maxlength': 'Invalid value',
	'validation.greaterThan': 'Invalid value',
	'validation.lessThan': 'Invalid value',
	'validation.nonEmpty': 'Value must not be empty',
};

const rulesOnly = {
	required,
	email,
	json,
	zipcode,
	nonZero,
	nonEmpty,
} as const;
const rulesWithParameters = {
	pattern,
	equalToElement: toElementValidator(equalTo),
	greaterThan,
	lessThan,
	greaterThanElement: toElementValidator(greaterThan),
	lessThanElement: toElementValidator(lessThan),
	min,
	max,
	equalTo,
	maxlength,
	minlength,
} as const;

const text = registerText(ValidationContent);

function toElementValidator<T extends Validator>(
	validator: (val: unknown) => T,
) {
	return (val: unknown, host: Element) => {
		const el = typeof val === 'string' ? getTargetById(host, val) : val;
		if (!el) throw 'Invalid element';
		return validator(el);
	};
}

function result(key: RuleKey, valid: boolean): ValidationResult {
	return {
		key,
		valid,
		message: text(`validation.${key}`, `validation.invalid`),
	};
}

/**
 * Checks if a value is empty (null, undefined, empty string, false, or an empty array).
 */
export function empty(val: unknown) {
	return (
		val === null ||
		val === undefined ||
		val === '' ||
		(Array.isArray(val) && val.length === 0)
	);
}

export function nonEmpty(val: unknown) {
	return result('nonEmpty', !empty(val));
}

export function nonZero(val: unknown) {
	return result('nonZero', val === '' || Number(val) !== 0);
}

/**
 * Creates a rule that checks if a string matches a regular expression.
 */
export function pattern(regex: RegExp | string) {
	const re = typeof regex === 'string' ? (regex = new RegExp(regex)) : regex;
	return (val: unknown) =>
		result(
			'pattern',
			typeof val === 'string' && (val === '' || re.test(val)),
		);
}

export function hasValue(val: unknown) {
	return val !== null && val !== undefined && val !== '';
}

/**
 * Checks if a value is not empty. A value is considered empty when the value is null,
 * undefined, or an empty string.
 */
export function required(val: unknown, host?: Element) {
	const isChecked = host && 'checked' in host ? !!host.checked : true;
	return result('required', isChecked && hasValue(val));
}

/**
 * Checks if a value is a valid email address.
 */
export function email(val: unknown) {
	return result(
		'email',
		typeof val === 'string' && (val === '' || EMAIL.test(val)),
	);
}

/**
 * Checks if a value is a valid US zip code.
 */
export function zipcode(val: unknown) {
	return result(
		'zipcode',
		typeof val === 'string' && (val === '' || ZIPCODE.test(val)),
	);
}

/**
 * Checks if a value is valid JSON.
 */
export function isValidJson(val: unknown) {
	try {
		JSON.parse(val as string);
		return true;
	} catch (e) {
		return false;
	}
}

export function json(val: unknown) {
	return result('json', isValidJson(val));
}

function isInputBase(el: unknown): el is InputLike {
	return el instanceof HTMLElement && 'value' in el;
}

/**
 * Creates a rule that compares a value to another value or observable.
 */
export function compare(
	key: RuleKey,
	b: InputLike | Observable<unknown> | unknown,
	fn: (a: unknown, b: unknown) => boolean,
) {
	const compareTo = isInputBase(b)
		? get(b, 'value')
		: b instanceof Observable
		? b
		: of(b);

	return (a: unknown) =>
		compareTo.map(b =>
			result(key, !hasValue(a) || !hasValue(b) || fn(a, b)),
		);
}

/**
 * Parses a string representation of a rule into a Validator function.
 */
function parseRule(rule: string, host: Element) {
	const RULEPARSER = /(\w+)(?:\(([^)]+?)\))?/g;
	const result = [];
	let m;
	while ((m = RULEPARSER.exec(rule))) {
		if (m[2]) {
			const ruleFn =
				rulesWithParameters[m[1] as keyof typeof rulesWithParameters];
			if (!ruleFn) throw `Invalid rule "${m[1]}"`;
			result.push(ruleFn(m[2], host));
		} else if (m[1] in rulesOnly) {
			result.push(rulesOnly[m[1] as keyof typeof rulesOnly]);
		} else throw `Invalid rule "${m[1]}"`;
	}

	return result;
}

/**
 * Parses a string or array of rules into a Validator function.
 */
export function parseRules(
	ruleList: string | Array<string | Validator>,
	host: Element,
) {
	const list = (
		typeof ruleList === 'string' ? parseRule(ruleList, host) : ruleList
	).flatMap(item =>
		typeof item === 'string' ? parseRule(item, host) : item,
	);
	return (val: unknown, host?: Element) =>
		list.map(fn => {
			const result = fn(val, host);
			if (result instanceof Observable) return result;
			if (result instanceof Promise) return from(result);

			return of(result);
		});
}

/**
 * Creates a rule that checks if a value is greater than or equal to another value or observable.
 */
export function min(val: InputLike | Observable<unknown> | unknown) {
	return compare('min', val, (a, b) => Number(a) >= Number(b));
}

/**
 * Creates a rule that checks if a value is greater than another value or observable.
 */
export function greaterThan(val: InputLike | Observable<unknown> | unknown) {
	return compare('greaterThan', val, (a, b) => Number(a) > Number(b));
}

/**
 * Creates a rule that checks if a value is less than or equal to another value or observable.
 */
export function max(val: InputLike | Observable<unknown> | unknown) {
	return compare('max', val, (a, b) => Number(a) <= Number(b));
}

/**
 * Creates a rule that checks if a value is less than another value or observable.
 */
export function lessThan(val: InputLike | Observable<unknown> | unknown) {
	return compare('lessThan', val, (a, b) => Number(a) < Number(b));
}

/**
 * Creates a rule that checks if a value is equal to another value or observable.
 * When comparing values, this function uses the '==' operator.
 * This means it considers values equal even when their types differ, as long as the value equivalence
 * satisfies JavaScript's type coercion rules.
 * For example, the string "5" and the number 5 would be treated as equal.
 */
export function equalTo(val: InputLike | Observable<unknown> | unknown) {
	return compare('equalTo', val, (a, b) => a == b);
}

/**
 * Creates a rule that checks if a string's length is less than or equal to a specified length.
 */
export function maxlength(len: number | string) {
	return (a: unknown) =>
		result('maxlength', !a || (a as string).length <= +len);
}

/**
 * Creates a rule that checks if a string's length is greater than or equal to a specified length.
 */
export function minlength(len: number | string) {
	return (a: unknown) =>
		result('minlength', !a || (a as string).length >= +len);
}
