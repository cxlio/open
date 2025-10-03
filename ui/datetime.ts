import { Component, attribute } from './component.js';

export type DateFormat = Intl.DateTimeFormatOptions | DatePresetFormat;
export type DatePresetFormat =
	| 'short'
	| 'long'
	| 'medium'
	| 'full'
	| 'relative';

export const DAY = 24 * 60 * 60 * 1000;
export const TimeRegex =
	/^\s*(\d{1,2})\s*:\s*(\d{1,2})\s*(?::(\d{1,2})\s*)?([pPaA][mM])?/;
const SimpleDateRegex =
	/^(\d{4}(?:-\d{2}(?:-\d{2})?)?)(T\d{2}:\d{2}(?:\d{2}(?:\.\d3)?)?)?(Z(?:[+-]\d{1,2})?)?$/;

export function parseTime(time: string) {
	const m = TimeRegex.exec(time);
	if (m) {
		const result = new Date();
		const hours = +m[1];
		const pm = m[4]?.toLowerCase() === 'pm';
		result.setHours(pm ? hours + 12 : hours);
		result.setMinutes(+m[2]);
		return result;
	}
	return new Date(NaN);
}

export function parseDate(date: string) {
	const match = SimpleDateRegex.exec(date);
	let result = new Date(
		match && !match[3] && !match[2] ? `${date}T00:00` : date,
	);
	if (isNaN(result.getTime())) {
		// Try time?
		result = parseTime(date);
	}
	return result;
}

export function presetDateFormat(
	date: Date,
	format: DatePresetFormat,
	locale?: string,
) {
	if (format === 'relative') {
		const today = new Date();
		if (date.getFullYear() === today.getFullYear()) {
			if (
				date.getDate() === today.getDate() &&
				date.getMonth() === today.getMonth()
			)
				return date.toLocaleTimeString(locale, {
					hour: '2-digit',
					minute: '2-digit',
					hourCycle: 'h24',
				});
			return date.toLocaleDateString(locale, {
				month: '2-digit',
				day: '2-digit',
			});
		}
		return date.toLocaleDateString(locale, {
			month: '2-digit',
			day: '2-digit',
			year: '2-digit',
		});
	}
	if (
		format === 'medium' ||
		format === 'long' ||
		format === 'short' ||
		format === 'full'
	)
		return date.toLocaleString(locale, {
			dateStyle: format,
			timeStyle: format,
		});

	return date.toLocaleString();
}

export function getMonthStartDate(date: Date) {
	return new Date(date.getFullYear(), date.getMonth(), 1);
}

export function getMonthEndDate(date: Date) {
	return new Date(date.getFullYear(), date.getMonth() + 1, 1);
}

export function getMonthRange(date: Date) {
	return {
		start: getMonthStartDate(date),
		end: getMonthEndDate(date),
	};
}

export function getRangeDates(start: Date, end: Date) {
	const result: Date[] = [];
	const i = new Date(start);
	const endTime = end.getTime();

	do {
		const val = new Date(i);
		result.push(val);
		i.setDate(i.getDate() + 1);
	} while (i.getTime() < endTime);

	return result;
}

export function dayDiff(start: Date, end: Date) {
	return (end.getTime() - start.getTime()) / DAY;
}

export function toIsoDate(d: Date) {
	const y = d.getFullYear();
	const m = d.getMonth() + 1;
	const day = d.getDate();
	return (
		y + '-' + (m < 10 ? '0' : '') + m + '-' + (day < 10 ? '0' : '') + day
	);
}

export function dateInRange(date: Date, start: Date, end: Date) {
	return date.getTime() >= start.getTime() && date.getTime() < end.getTime();
}

export function dateAttribute<
	T extends Component,
	K extends Extract<keyof T, string>,
>(name: K) {
	return attribute<T, K>(name, {
		parse: val => (val ? parseDate(val) : undefined) as T[K],
	});
}
