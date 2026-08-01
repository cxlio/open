import { createHash } from 'crypto';
import { mkdir, writeFile } from 'fs/promises';
import { join } from 'path';
import { readJson } from '../program/index.js';

import type {
	BenchmarkData,
	JsonResult,
	Result,
} from '../spec/index.js';

export interface BenchmarkEnvironment {
	browser: string;
	platform: string;
	architecture: string;
	cpu: string;
	gpu: string;
	profile: string;
}

export interface BenchmarkComparison {
	change?: number;
	status:
		| 'improved'
		| 'inconclusive'
		| 'incompatible'
		| 'new'
		| 'regressed'
		| 'slower'
		| 'unchanged';
}

export interface BenchmarkResult extends BenchmarkData {
	comparison: BenchmarkComparison;
}

export interface BenchmarkEnvironmentResult {
	fingerprint: BenchmarkEnvironment;
	benchmarks: Record<string, BenchmarkData>;
}

export interface BenchmarkBaseline {
	version: 1;
	environments: Record<string, BenchmarkEnvironmentResult>;
}

export interface BenchmarkReport {
	environment: string;
	fingerprint: BenchmarkEnvironment;
	benchmarks: Record<string, BenchmarkResult>;
}

interface CollectedBenchmark {
	data: BenchmarkData;
	result: Result;
}

function environmentId(environment: BenchmarkEnvironment) {
	return createHash('sha256')
		.update(JSON.stringify(environment))
		.digest('hex');
}

function collectBenchmarks(
	test: JsonResult,
	parent: string,
	out: Record<string, CollectedBenchmark>,
) {
	const path = parent ? `${parent} > ${test.name}` : test.name;
	for (const result of test.results)
		if (result.data?.type === 'benchmark')
			out[path] = { data: result.data, result };
	for (const child of test.tests) collectBenchmarks(child, path, out);
	for (const child of test.only) collectBenchmarks(child, path, out);
}

export function hasBenchmarks(suite: JsonResult) {
	const benchmarks: Record<string, CollectedBenchmark> = {};
	collectBenchmarks(suite, '', benchmarks);
	return Object.keys(benchmarks).length > 0;
}

function compatible(a: BenchmarkData, b: BenchmarkData) {
	return (
		a.options.warmup === b.options.warmup &&
		a.options.sampleTime === b.options.sampleTime &&
		a.options.samples === b.options.samples
	);
}

function compareBenchmark(
	current: BenchmarkData,
	baseline: BenchmarkData | undefined,
): BenchmarkComparison {
	if (!baseline) return { status: 'new' };
	if (!compatible(current, baseline)) return { status: 'incompatible' };
	if (!baseline.median) return { status: 'incompatible' };

	const change = (current.median / baseline.median - 1) * 100;
	const delta = current.median - baseline.median;
	const noise =
		3 * Math.sqrt(current.mad ** 2 + baseline.mad ** 2);
	if (Math.abs(delta) <= noise) return { change, status: 'inconclusive' };
	if (change < 0) return { change, status: 'improved' };
	const threshold = current.options.maxRegression;
	if (threshold !== undefined && change > threshold)
		return { change, status: 'regressed' };
	return { change, status: change === 0 ? 'unchanged' : 'slower' };
}

function emptyBaseline(): BenchmarkBaseline {
	return { version: 1, environments: {} };
}

async function readBaseline(path: string) {
	try {
		return await readJson<BenchmarkBaseline>(path);
	} catch (e) {
		if (e instanceof Error && 'code' in e && e.code === 'ENOENT')
			return emptyBaseline();
		throw e;
	}
}

export async function processBenchmarks(
	suite: JsonResult,
	environment: BenchmarkEnvironment,
	baselinePath?: string,
	updateBaselines?: boolean,
): Promise<BenchmarkReport | undefined> {
	const collected: Record<string, CollectedBenchmark> = {};
	collectBenchmarks(suite, '', collected);
	if (!Object.keys(collected).length) return;

	const id = environmentId(environment);
	const path = baselinePath && join(baselinePath, 'benchmark.json');
	const baseline = path ? await readBaseline(path) : emptyBaseline();
	const environmentBaseline = baseline.environments[id];
	const benchmarks: Record<string, BenchmarkResult> = {};
	const current = Object.fromEntries(
		Object.entries(collected).map(([name, value]) => [name, value.data]),
	);

	for (const [name, value] of Object.entries(collected)) {
		const comparison = environmentBaseline
			? compareBenchmark(
					value.data,
					environmentBaseline.benchmarks[name],
				)
			: { status: 'new' as const };
		benchmarks[name] = { ...value.data, comparison };
		if (comparison.status === 'regressed' && !updateBaselines) {
			value.result.success = false;
			value.result.failureMessage = `Benchmark regressed ${comparison.change?.toFixed(2)}%`;
		}
	}

	if (path && (updateBaselines || !environmentBaseline)) {
		baseline.environments[id] = { fingerprint: environment, benchmarks: current };
		await mkdir(baselinePath, { recursive: true });
		await writeFile(path, JSON.stringify(baseline, null, 2));
	} else if (path && environmentBaseline) {
		const additions = Object.entries(current).filter(
			([name]) => !environmentBaseline.benchmarks[name],
		);
		if (additions.length) {
			Object.assign(environmentBaseline.benchmarks, Object.fromEntries(additions));
			await writeFile(path, JSON.stringify(baseline, null, 2));
		}
	}

	return {
		environment: id,
		fingerprint: environment,
		benchmarks,
	};
}
