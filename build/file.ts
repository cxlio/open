import {
	Observable,
	defer,
	from,
	map,
	pipe,
	reduce,
	tap,
	filter,
	fromAsync,
} from '../rx/index.js';

import { promises as fs, readFileSync } from 'fs';
import { basename as pathBasename, dirname, resolve } from 'path';
import { Output, exec, shell } from './builder.js';

/**
 * Provides an Observable that emits the absolute paths of all entries in a given
 * directory. Useful for streaming file paths for further processing.
 */
export function ls(dir: string) {
	return new Observable<string>(subs => {
		fs.readdir(dir).then(
			files => {
				for (const path of files) subs.next(resolve(dir, path));
				subs.complete();
			},
			e => subs.error(e),
		);
	});
}

export async function read(source: string): Promise<Output> {
	const content = await fs.readFile(source);
	return {
		path: source,
		source: content,
	};
}

export function filterPath(matchPath: string) {
	matchPath = resolve(matchPath);
	return filter((out: Output) => resolve(out.path).startsWith(matchPath));
}

export function file(source: string, out?: string) {
	return defer(() =>
		from(
			read(source).then(res => ({
				path: out || resolve(source),
				source: res.source,
			})),
		),
	);
}

export function basename(replace?: string) {
	return tap<Output>(
		out => (out.path = (replace || '') + pathBasename(out.path)),
	);
}

export function concatFile(outName: string, separator = '\n') {
	return pipe(
		reduce<Output, string>(
			(out, src) => `${out}${separator}${src.source}`,
			'',
		),
		map(source => ({ path: outName, source: Buffer.from(source) })),
	);
}

/**
 * Reads multiple files asynchronously and emits them in order
 */
export function files(sources: string[]) {
	return new Observable<Output>(subs => {
		Promise.all(sources.map(read)).then(
			out => {
				out.forEach(o => subs.next(o));
				subs.complete();
			},
			e => subs.error(e),
		);
	});
}

export function older(fromPath: string, toPath: string) {
	return Promise.all([fs.stat(fromPath), fs.stat(toPath)]).then(
		([fromStat, toStat]) =>
			fromStat.mtime.getTime() > toStat.mtime.getTime(),
		() => true,
	);
}

export function ifOlder(fromPath: string, toPath: string) {
	return fromAsync(() => older(fromPath, toPath)).filter(v => v);
}

/**
 * Copy Directory
 */
export function copyDir(fromPath: string, toPath: string, glob = '') {
	return exec(
		`mkdir -p ${toPath} && rsync -au -i --delete ${fromPath}/${glob} ${toPath}`,
	);
}

export function getSourceMap(out: Output): Output | undefined {
	const source = out.source.toString();
	const match = /\/\/# sourceMappingURL=(.+)/.exec(source);
	const path = match?.[1] ? resolve(dirname(out.path), match[1]) : null;

	if (path) return { path: pathBasename(path), source: readFileSync(path) };
}

export function zip(
	src: string[],
	path: string,
	cwd?: string,
): Observable<Output> {
	return shell(`zip - ${src.join(' ')}`, { cwd }).map(source => ({
		path,
		source,
	}));
}
