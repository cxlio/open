# @cxl/tgz

[![npm version](https://badge.fury.io/js/%40cxl%2Ftgz.svg)](https://badge.fury.io/js/%40cxl%2Ftgz)

Lightweight, efficient tool for extracting files from gzip-compressed tarballs.

## Project Details

-   Branch Version: [0.0.1](https://npmjs.com/package/@cxl/tgz/v/0.0.1)
-   License: GPL-3.0

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
