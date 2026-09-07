import { createHash, Hash } from 'crypto';
import { dirname, isAbsolute, relative, resolve, sep } from 'path';
import { promises as fs } from 'fs';
import { getErrorCode, readJson } from '../program/index.js';

interface CacheManifest {
	fingerprint: string;
	inputs: string[];
	outputs: string[];
}

export interface BuildCacheOptions {
	manifest: string;
	inputs: readonly string[];
	key: string;
	outputDir: string;
}

export interface BuildCacheResult {
	inputs: readonly string[];
	outputs: readonly string[];
}

function isBuildCacheResult(
	result: readonly string[] | BuildCacheResult,
): result is BuildCacheResult {
	return !Array.isArray(result);
}

function updateHash(hash: Hash, value: string | Buffer) {
	const source = typeof value === 'string' ? Buffer.from(value) : value;
	hash.update(String(source.length));
	hash.update(':');
	hash.update(source);
}

async function fingerprint(inputs: readonly string[], key: string) {
	const hash = createHash('sha256');
	updateHash(hash, key);
	for (const input of [...new Set(inputs)].sort((a, b) => a.localeCompare(b))) {
		updateHash(hash, input);
		try {
			updateHash(hash, 'present');
			updateHash(hash, await fs.readFile(input));
		} catch (error) {
			if (!(error instanceof Error) || getErrorCode(error) !== 'ENOENT')
				throw error;
			updateHash(hash, 'missing');
		}
	}
	return hash.digest('hex');
}

async function readManifest(path: string) {
	try {
		const value = await readJson<CacheManifest | null>(path, null);
		if (
			value !== null &&
			typeof value.fingerprint === 'string' &&
			Array.isArray(value.inputs) &&
			value.inputs.every(input => typeof input === 'string') &&
			Array.isArray(value.outputs) &&
			value.outputs.every(output => typeof output === 'string')
		)
			return value;
	} catch (error) {
		if (!(error instanceof SyntaxError)) throw error;
	}
}

function outputPath(outputDir: string, output: string) {
	const root = resolve(outputDir);
	const path = resolve(root, output);
	const value = relative(root, path);
	if (
		isAbsolute(output) ||
		isAbsolute(value) ||
		value === '..' ||
		value.startsWith(`..${sep}`)
	)
		throw new Error(`Invalid cached output "${output}"`);
	return path;
}

async function outputsExist(outputDir: string, outputs: readonly string[]) {
	if (!outputs.length) return false;
	for (const output of outputs) {
		try {
			await fs.access(outputPath(outputDir, output));
		} catch {
			return false;
		}
	}
	return true;
}

async function removeOutputs(outputDir: string, outputs: readonly string[]) {
	await Promise.all(
		outputs.map(output =>
			fs.rm(outputPath(outputDir, output), { force: true }),
		),
	);
}

async function writeManifest(
	path: string,
	fingerprint: string,
	inputs: readonly string[],
	outputDir: string,
	outputs: readonly string[],
) {
	const normalized = outputs.map(output => {
		const value = relative(resolve(outputDir), resolve(output));
		outputPath(outputDir, value);
		return value;
	});
	await fs.mkdir(dirname(path), { recursive: true });
	const temp = `${path}.${process.pid}.tmp`;
	await fs.writeFile(
		temp,
		JSON.stringify({ fingerprint, inputs, outputs: normalized }, null, '\t'),
	);
	await fs.rename(temp, path);
}

export async function cachedBuild(
	options: BuildCacheOptions,
	build: () => Promise<readonly string[] | BuildCacheResult>,
) {
	const outputDir = resolve(options.outputDir);
	const previous = await readManifest(options.manifest);
	const currentFingerprint = await fingerprint(
		[...options.inputs, ...(previous?.inputs ?? [])],
		options.key,
	);
	if (
		previous?.fingerprint === currentFingerprint &&
		(await outputsExist(outputDir, previous.outputs))
	)
		return false;

	if (previous) await removeOutputs(outputDir, previous.outputs);
	const result = await build();
	const inputs = isBuildCacheResult(result) ? result.inputs : [];
	const outputs = isBuildCacheResult(result) ? result.outputs : result;
	const relativeOutputs = outputs.map(output =>
		relative(outputDir, resolve(output)),
	);
	if (
		!outputs.length ||
		!(await outputsExist(outputDir, relativeOutputs))
	)
		throw new Error(
			`Cached build did not produce its declared outputs: ${relativeOutputs.join(', ')}`,
		);
	await writeManifest(
		options.manifest,
		await fingerprint([...options.inputs, ...inputs], options.key),
		inputs,
		outputDir,
		outputs,
	);
	return true;
}
