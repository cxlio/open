import { Observable, be, combineLatest, of, fromAsync } from './rx.js';
import { Component, get } from './component.js';
import { DateFormat, presetDateFormat } from './datetime.js';

import type { ValidationContent } from './validation';
import type { BreakpointKey } from './theme.js';

export type LocaleName = 'default' | 'en' | 'es' | 'fr';

export interface LocaleBase {
	/**
	 * Defines the content specific to a particular locale.
	 */
	readonly content: LocaleContent;

	/**
	 * Specifies the name of the locale (e.g., "en", "de").
	 */
	readonly name: LocaleName;

	currencyCode: string;

	/**
	 * This property allows overriding the default locale.
	 */
	localeName: string;

	/**
	 * Stores the character used to separate decimals
	 * for number formatting according to the locale.
	 */
	decimalSeparator: string;

	/**
	 * Indicates the day of week (0 = Sunday, 1 = Monday, etc.) the calendar should start on for this locale,
	 * allowing for region-specific week configurations.
	 */
	weekStart: number;

	formatDate: (date: Date, options?: DateFormat) => string;
}

export function defaultFormatDate(
	locale: string,
	date: Date,
	options?: DateFormat,
) {
	if (!date) return '';

	return typeof options === 'string'
		? presetDateFormat(date, options, locale)
		: date.toLocaleString(locale, options);
}

export type ContentKey =
	| keyof typeof defaultContent
	| 'calendar.month'
	| 'calendar.week'
	| 'calendar.day'
	| 'calendar.next'
	| 'calendar.previous'
	| 'carousel.previous'
	| 'carousel.next'
	| 'carousel.pagination'
	| 'carousel.paginationitem'
	| 'colorpicker.hue'
	| 'colorpicker.saturation'
	| 'colorpicker.brightness'
	| 'colorpicker.alpha'
	| 'colorpicker.hex'
	| 'colorpicker.red'
	| 'colorpicker.green'
	| 'colorpicker.blue'
	| 'datepicker.open'
	| 'datepicker.close'
	| 'datepicker.nextYearPage'
	| 'datepicker.nextYear'
	| 'datepicker.nextMonth'
	| 'datepicker.previousYearPage'
	| 'datepicker.previousYear'
	| 'datepicker.previousMonth'
	| 'datepicker.openYearPanel'
	| 'datepicker.closeYearPanel'
	| 'dataset.selectAll'
	| 'dataset.deselectAll'
	| 'datatable.selectRow'
	| 'datatable.rpp'
	| 'datatable.columnSort'
	| 'dialog.close'
	| 'dialog.cancel'
	| 'dialog.ok'
	| 'input.clear'
	| 'navigation.goPrevious'
	| 'navigation.goNext'
	| 'navigation.goFirst'
	| 'navigation.goLast'
	| 'password-reveal.on'
	| 'password-reveal.off'
	| keyof typeof ValidationContent;
//| keyof typeof TimepickerContent;

export type LocaleContent = Record<ContentKey, string>;

const defaultContent = {
	'core.enable': 'Enable',
	'core.disable': 'Disable',
	'core.cancel': 'Cancel',
	'core.ok': 'Ok',
	'core.open': 'Open',
	'core.close': 'Close',
	'core.of': 'of',
};

// Needed in case navigator.language is malformed.
function getDefaultLanguage() {
	try {
		new Intl.NumberFormat(navigator.language);
		return navigator.language;
	} catch (e) {
		return 'en-US';
	}
}

/**
 * The DefaultLocale class extends the abstract LocaleBase class and provides a concrete implementation
 * for the default locale (English).
 */
export const defaultLocale: LocaleBase = {
	content: defaultContent as LocaleContent,
	name: 'default',
	localeName: getDefaultLanguage(),
	currencyCode: 'USD',
	decimalSeparator: (1.1).toLocaleString().substring(1, 2),
	weekStart: 0,
	formatDate: (date, options) =>
		defaultFormatDate(defaultLocale.localeName, date, options),
};

export const englishLocale: LocaleBase = {
	content: defaultContent as LocaleContent,
	name: 'en',
	localeName: 'en-US',
	currencyCode: 'USD',
	decimalSeparator: '.',
	weekStart: 0,
	formatDate: (date, options) => defaultFormatDate('en-US', date, options),
};

export function ContentManager() {
	const locale = be<LocaleBase>(defaultLocale);
	const registeredLocales: Partial<Record<string, LocaleBase>> = {
		default: defaultLocale,
		en: englishLocale,
	};
	const availableLocales: Partial<Record<string, () => Promise<unknown>>> = {
		/*fr: () => import('./locale-fr.js'),
		es: () => import('./locale-es.js'),*/
	};
	const content = locale.map(locale => locale.content);

	async function getLocale(localeId: string) {
		const lang = localeId.split('-')[0];
		const registered =
			registeredLocales[localeId] ?? registeredLocales[lang];
		if (!registered) {
			const available =
				availableLocales[localeId] ?? availableLocales[lang];
			if (available) await available();
		}
		return registeredLocales[lang] || defaultLocale;
	}

	/** Sets the active locale by its identifier. */
	async function setLocale(localeId: LocaleName) {
		locale.next(await getLocale(localeId));
	}

	if (navigator?.language) setLocale(navigator.language as LocaleName);

	return {
		/** An observable stream that emits the current locale's content dictionary. */
		content,
		/** A registry containing instances of all registered locales */
		registeredLocales,
		locale,
		setLocale,
		getLocale(localeId?: string) {
			return localeId ? fromAsync(() => getLocale(localeId)) : locale;
		},
		/** Retrieves localized text for a given key from the current locale's content. */
		get(key: ContentKey, fallbackKey?: ContentKey) {
			return content.map(
				c => c[key] ?? (fallbackKey && c[fallbackKey]) ?? '',
			);
		},
		/** Registers a new locale with the manager. */
		register(locale: LocaleBase) {
			registeredLocales[locale.name] = locale;
		},
	};
}

export const content = ContentManager();

export function getLocale($: Component & { locale?: string }) {
	return combineLatest(content.locale, get($, 'locale')).switchMap(
		([active, user]) => (user ? content.getLocale(user) : of(active)),
	);
}

export function registerText(newContent: Partial<LocaleContent>) {
	Object.assign(defaultContent, newContent);
	return content.get;
}

export function getFormattedDate(date: Date, options?: DateFormat) {
	return content.locale.map(
		l =>
			l.formatDate?.(date, options) ??
			defaultFormatDate(l.localeName, date, options),
	);
}

export function formatDate(options?: DateFormat) {
	return (v: Date | undefined) =>
		v
			? content.locale.map(
					l =>
						l.formatDate?.(v, options) ??
						defaultFormatDate(l.localeName, v, options),
			  )
			: of('');
}

export function getDayText(
	day: number,
	size: BreakpointKey,
	locale: Observable<LocaleBase> = content.locale,
) {
	const date = new Date();
	const weekday =
		size === 'xsmall' ? 'narrow' : size === 'small' ? 'short' : 'long';
	date.setDate(date.getDate() - date.getDay() + day);
	return locale.map(l => l.formatDate(date, { weekday }));
}
