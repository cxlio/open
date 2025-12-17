import { readFile, stat, mkdir } from 'fs/promises';
import { join, resolve } from 'path';
import { SpawnOptions, spawn } from 'child_process';

const codes = {
	reset: [0, 0],

	bold: [1, 22],
	dim: [2, 22],
	italic: [3, 23],
	underline: [4, 24],
	inverse: [7, 27],
	hidden: [8, 28],
	strikethrough: [9, 29],

	black: [30, 39],
	red: [31, 39],
	green: [32, 39],
	yellow: [33, 39],
	blue: [34, 39],
	magenta: [35, 39],
	cyan: [36, 39],
	white: [37, 39],
	gray: [90, 39],
	grey: [90, 39],

	brightRed: [91, 39],
	brightGreen: [92, 39],
	brightYellow: [93, 39],
	brightBlue: [94, 39],
	brightMagenta: [95, 39],
	brightCyan: [96, 39],
	brightWhite: [97, 39],

	bgBlack: [40, 49],
	bgRed: [41, 49],
	bgGreen: [42, 49],
	bgYellow: [43, 49],
	bgBlue: [44, 49],
	bgMagenta: [45, 49],
	bgCyan: [46, 49],
	bgWhite: [47, 49],
	bgGray: [100, 49],
	bgGrey: [100, 49],

	bgBrightRed: [101, 49],
	bgBrightGreen: [102, 49],
	bgBrightYellow: [103, 49],
	bgBrightBlue: [104, 49],
	bgBrightMagenta: [105, 49],
	bgBrightCyan: [106, 49],
	bgBrightWhite: [107, 49],

	// legacy styles for colors pre v1.0.0
	blackBG: [40, 49],
	redBG: [41, 49],
	greenBG: [42, 49],
	yellowBG: [43, 49],
	blueBG: [44, 49],
	magentaBG: [45, 49],
	cyanBG: [46, 49],
	whiteBG: [47, 49],
};

type Colors<T> = { [P in keyof T]: (str: string) => string };

export const colors: Colors<typeof codes> = Object.keys(codes).reduce(
	(styles, key) => {
		const val = codes[key as keyof typeof codes];
		const open = '\u001b[' + val[0] + 'm';
		const close = '\u001b[' + val[1] + 'm';

		styles[key as keyof typeof codes] = (str: string) => open + str + close;
		return styles;
	},
	{} as Colors<typeof codes>,
);

export type ProgramParameters = Parameters<typeof parseParameters>[0];

type ParameterType<T extends Parameter> = T['type'] extends 'string'
	? string
	: T['type'] extends 'number'
	? number
	: boolean;

export type ParametersResult<T extends Record<string, Parameter>> = {
	[K in keyof T]?: T[K]['many'] extends true
		? ParameterType<T[K]>[]
		: ParameterType<T[K]>;
} & { $: string[] };

export interface Parameter {
	short?: string;
	type?: 'string' | 'boolean' | 'number';
	help: string;
	many?: boolean;
}

export interface ProgramConfiguration {
	name?: string;
	logColor?: keyof typeof colors;
}

export interface Package {
	name: string;
	version: string;
	repository?: string | { url: string; directory?: string };
}

export interface Logger {
	(...msg: unknown[]): void;
}

export interface Program {
	name: string;
	pkg: Package;
	log: Logger;
}

const StringValue = `"(?:[^"\\\\]|\\\\.)*"`;
const MultipleShort = `-(\\w\\w+)`;
const ArgValue = `\\s*=?\\s*(${StringValue}|[^-][^\\s]*)?`;
const SingleShortValue = `-(\\w)${ArgValue}`;
const Long = `--(\\w+)${ArgValue}`;

const ArgRegex = new RegExp(
	`\\s*(?:${MultipleShort}|${SingleShortValue}|${Long}|(${StringValue}|[^\\s]+))`,
	'g',
);

export type ParameterDefinition = {
	short?: string;
	type?: 'string' | 'boolean' | 'number';
	help?: string;
};

export const DefaultParameters = {
	help: {
		short: 'h',
	},
	config: {
		help: 'Use JSON config file',
		short: 'c',
	},
} as const;

function unquote(value: string) {
	return value.startsWith('"') && value.endsWith('"')
		? value.slice(1, value.length - 1)
		: value;
}

function findParameter<T extends Record<string, Parameter>>(
	parameters: T,
	shortcut: string,
): [keyof T, Parameter] {
	for (const key in parameters) {
		if (parameters[key]?.short === shortcut) return [key, parameters[key]];
	}

	throw new Error(`Invalid parameter "${shortcut}"`);
}

function parseValue<T extends Parameter>(
	param: T,
	value: string | undefined,
): ParameterType<T> {
	if (param.type === 'number')
		return (value === undefined ? 0 : parseInt(value)) as ParameterType<T>;
	if (param.type === 'string')
		return (value === undefined ? '' : unquote(value)) as ParameterType<T>;

	return true as ParameterType<T>; //(value !== undefined) as ParameterType<T>;
}

function setParam<T extends Record<string, Parameter>, K extends keyof T>(
	result: ParametersResult<T>,
	[key, param]: [K, Parameter | undefined],
	value: string | undefined,
) {
	if (!param) throw new Error(`Parameter "${String(key)}" not supported`);

	const newValue = parseValue(param, value);
	const lastValue = result[key];

	if (lastValue !== undefined && !param.many)
		throw new Error(
			`Parameter ${String(key)} does not support multiple values`,
		);

	// handle rest parameter after boolean
	if (value && (param.type === 'boolean' || param.type === undefined))
		result.$.push(unquote(value));

	if (lastValue === undefined)
		result[key] = (
			param.many ? [newValue] : newValue
		) as (typeof result)[K];
	else if (Array.isArray(lastValue)) (lastValue as boolean[]).push(newValue);
	else if (param.many)
		result[key] = [lastValue, newValue] as (typeof result)[K];
	else throw new Error('Invalid parameter');
}

export function parseParameters<T extends Record<string, Parameter>>(
	parameters: T,
	input: string,
): ParametersResult<T> {
	const result = { $: [] as string[] } as ParametersResult<T>;

	let m: RegExpExecArray | null;

	ArgRegex.lastIndex = 0;
	while ((m = ArgRegex.exec(input))) {
		const [, multipleShort, short, shortValue, long, longValue, restValue] =
			m;
		if (multipleShort)
			multipleShort
				.split('')
				.forEach(p =>
					setParam(result, findParameter(parameters, p), ''),
				);
		else if (short)
			setParam(result, findParameter(parameters, short), shortValue);
		else if (long) setParam(result, [long, parameters[long]], longValue);
		else if (restValue) result.$.push(unquote(restValue));
		else throw new Error('Invalid parameter');
	}

	return result;
}

export function parametersParser<T extends Record<string, Parameter>, R>(
	parameters: T,
	cb: (parsed: ParametersResult<T>) => R,
) {
	return (input: string) => cb(parseParameters(parameters, input));
}

type OperationFunction<T> = (() => Promise<T>) | Promise<T>;

interface OperationResult<T> {
	start: bigint;
	time: bigint;
	tasks: number;
	result: T;
}

function hrtime(): bigint {
	return process.hrtime.bigint();
}

export async function operation<T>(
	fn: OperationFunction<T>,
): Promise<OperationResult<T>> {
	let start = hrtime();
	const item = await (typeof fn === 'function' ? fn() : fn);
	let tasks = 0;

	const end = hrtime();
	const result = {
		start,
		tasks: ++tasks,
		time: end - start,
		result: item,
	};
	start = end;
	return result;
}

export function parseArgv<T extends Record<string, Parameter>>(parameters: T) {
	return parseParameters(parameters, process.argv.slice(2).join(' '));
}

/**
 * Creates a directory recursively
 */
export async function mkdirp(dir: string) {
	await stat(dir).catch(() =>
		mkdirp(resolve(dir, '..')).then(() => mkdir(dir)),
	);
}

/**
 * Read and parse a JSON file, ignores errors.
 * @param fileName Path of file to parse
 */
export async function readJson<T>(
	fileName: string,
	defaultValue?: T,
): Promise<T> {
	try {
		return JSON.parse(await readFile(fileName, 'utf8')) as T;
	} catch (e) {
		if (defaultValue !== undefined) return defaultValue;
		throw e;
	}
}

export function log(prefix: string | (() => string), ...msg: unknown[]) {
	console.log(typeof prefix === 'string' ? prefix : prefix(), ...msg);
}

export function sh(cmd: string, options: SpawnOptions = {}) {
	return new Promise<string>((resolve, reject) => {
		const proc = spawn(cmd, [], { shell: true, ...options });
		let output = '';
		proc.stdout?.on(
			'data',
			(data: Buffer) => (output += data.toString() || ''),
		);
		proc.stderr?.on(
			'data',
			(data: Buffer) => (output += data.toString() || ''),
		);
		proc.on('exit', code => {
			if (code !== 0) reject(output);
			else resolve(output);
		});
	});
}

export function program(
	name: string | ProgramConfiguration,
	startFn: (p: Program) => void | Promise<void>,
) {
	const config = typeof name === 'string' ? { name } : name;

	return async () => {
		const basePath = import.meta.dirname;
		const pkg = await readJson<Package>(join(basePath, 'package.json'), {
			name: config.name || '',
			version: '',
		});
		const name = config.name || pkg.name;
		const color = config.logColor || 'green';
		const logPrefix = colors[color](name);

		try {
			return await startFn({
				pkg,
				name,
				log: log.bind(log, () => logPrefix),
			});
		} catch (e) {
			console.error(e);
			process.exitCode = 1;
		}
	};
}
