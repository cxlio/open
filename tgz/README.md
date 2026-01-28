# @cxl/tgz 
	
[![npm version](https://badge.fury.io/js/%40cxl%2Ftgz.svg)](https://badge.fury.io/js/%40cxl%2Ftgz)

Lightweight, efficient tool for extracting files from gzip-compressed tarballs.

## Project Details

-   Branch Version: [0.1.0](https://npmjs.com/package/@cxl/tgz/v/0.1.0)
-   License: GPL-3.0
-   Documentation: [Link](https://cxlio.github.io/docs/@cxl/tgz)
-   Report Issues: [Github](https://github.com/cxlio/open/issues)

## Installation

	npm install @cxl/tgz

## Features

-   **Stream-based Processing**: Handle tar files without loading the entire archive into memory.
-   **Support for Gzip**: Decompress `.tar.gz` (tgz) files with built-in gzip support.
-   **File Extraction**: Extract content with their metadata (path, last modified time) from tar archives.

## Usage

### Extracting TAR Streams

```typescript
import { untarStream } from '@cxl/tgz';

const fileStream = new ReadableStream<Uint8Array>(); // Replace with your stream source.

const extractedFiles = await untarStream(fileStream);

for (const file of extractedFiles) {
	console.log(`File Path: ${file.path}`);
	console.log(`Last Modified: ${file.lastModified}`);
	console.log(`Content:`, new TextDecoder().decode(file.content));
}
```

### Extracting GZIP-TAR (TGZ) Streams

```typescript
import tgz from '@cxl/tgz';

const tgzStream = new ReadableStream<Uint8Array>(); // Replace with your stream source.

const extractedFiles = await tgz(tgzStream);

for (const file of extractedFiles) {
	console.log(`File Path: ${file.path}`);
	console.log(`Last Modified: ${file.lastModified}`);
	console.log(`Content:`, new TextDecoder().decode(file.content));
}
```

## API

### `untar(buffer: Uint8Array): Promise<Output[]>`

Extract files from a `Uint8Array` buffer representing a tar archive.

-   **Parameters**:
    -   `buffer`: The tar archive as a `Uint8Array`.
-   **Returns**: A promise that resolves to an array of `Output` objects.

### `untarStream(stream: ReadableStream<Uint8Array>): Promise<Output[]>`

Extract files from a stream containing tar archive data.

-   **Parameters**:
    -   `stream`: A `ReadableStream` of `Uint8Array` data.
-   **Returns**: A promise that resolves to an array of `Output` objects.

### `tgz(stream: ReadableStream<Uint8Array>): Promise<Output[]>`

Extract files from a gzipped tar archive (`.tar.gz`) provided as a stream.

-   **Parameters**:
    -   `stream`: A `ReadableStream` of gzipped tar data.
-   **Returns**: A promise that resolves to an array of `Output` objects.

### `Output`

An object representing a single extracted file.

-   **Properties**:
    -   `path: string`: The file path within the tar archive.
    -   `lastModified: Date`: The last modified time of the file.
    -   `content: Uint8Array`: The file content.

## Notes

-   Long file paths in tar files (`type='L'`) are automatically resolved.
-   The library enforces path validation to prevent directory traversal vulnerabilities.
