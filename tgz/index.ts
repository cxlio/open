///<amd-module name="@cxl/tgz"/>

interface Header {
	path: string;
	lastModified: Date;
}

export interface Output extends Header {
	content: Uint8Array;
}

function pad512(n: number) {
	const r = n % 512;
	return n + (r && 512 - r);
}

function concat(a: Uint8Array, b: Uint8Array) {
	const result = new Uint8Array(a.length + b.length);
	result.set(a);
	result.set(b, a.length);
	return result;
}

function string(
	buffer: Uint8Array,
	start: number,
	size: number,
	type = 'utf-8',
) {
	const len = start + size;
	let i = start;
	while (i < len && buffer[i] !== 0) i++;
	return new TextDecoder(type).decode(buffer.slice(start, i));
}

/* 
   The `untar` function takes a buffer (Uint8Array) and processes it as a tar archive.
   It creates a new `ReadableStream` that wraps the buffer and immediately enqueues 
   and closes it. This stream is then passed into the `untarStream` function for 
   extracting the tar file contents.
*/
export function untar(buffer: Uint8Array) {
	return untarStream(
		new ReadableStream({
			pull(controller) {
				controller.enqueue(buffer);
				controller.close();
			},
		}),
	);
}

/* 
   The `untarStream` function processes a `ReadableStream` containing a tar archive, 
   parsing its headers and extracting files. 
   This function maintains minimal memory usage by iterating over the stream and avoids loading the full archive into memory. 
   It's robust enough to handle edge cases like fragmented tar data and flexible filenames.
*/
export async function untarStream(stream: ReadableStream<Uint8Array>) {
	const result: Output[] = [];
	let header: Header | undefined;
	let expected = 512;
	let size = 0;
	let leftover = new Uint8Array(0);
	let longName: string | undefined;

	function next(buffer: Uint8Array) {
		if (header) {
			if (buffer.length <= expected) {
				leftover = buffer;
				return;
			}
			const content = buffer.slice(0, size);
			result.push({ ...header, content });
			header = undefined;
			return next(buffer.slice(expected));
		}
		// Required header size
		if (buffer.length < 512) {
			leftover = buffer;
			return;
		}
		let path = string(buffer, 0, 100);
		if (path) {
			size = parseInt(string(buffer, 124, 12), 8);
			if (isNaN(size)) throw new Error('Invalid entry content size');
			if (longName) {
				path = longName;
				longName = undefined;
			}
			if (path.includes('..')) throw new Error(`Invalid path: ${path}`);

			const lastModified = new Date(parseInt(string(buffer, 136, 12), 8));
			const type = string(buffer, 156, 1);

			// Normal File
			if (type === '0' || type === '\x00' || type === '') {
				header = { path, lastModified };
				expected = pad512(size);
				return next(buffer.slice(512));
			} else if (type === 'L') {
				// Long File Name
				longName = string(buffer, 512, size);
				return next(buffer.slice(512 + pad512(size)));
			}
		}

		if (buffer.length > 512) next(buffer.slice(512));
	}

	const reader = stream.getReader();
	while (true) {
		const { done, value } = await reader.read();
		if (done) break;
		const buffer = leftover.length ? concat(leftover, value) : value;
		next(buffer);
	}
	return result;
}

/* 
   The `tgz` function takes a `ReadableStream` of gzipped tar data as input,
   decompresses it,
   and then passes the resulting uncompressed stream into the `untarStream` function 
   for parsing and extracting its contents. 
*/
export default async function tgz(stream: ReadableStream<Uint8Array>) {
	const ds = new DecompressionStream('gzip');
	const decompressedStream = stream.pipeThrough(ds);
	return untarStream(decompressedStream);
}
