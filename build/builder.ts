import { dirname, relative, resolve } from 'path';
import { existsSync, utimesSync, writeFileSync } from 'fs';
import { SpawnOptions, spawn, execSync } from 'child_process';
import { createRequire } from 'module';

import { Logger, colors, sh, log, operation } from '@cxl/program';
import { Observable } from '@cxl/rx';
import { BASEDIR, readPackage } from './package.js';

export interface Output {
	path: string;
	source: Buffer;
	mtime?: number;
}

export interface BuildConfiguration {
	target?: string;
	outputDir: string;
	tasks: Task[];
}
export type Task = Observable<Output>;

const AppName = colors.green('build');
export const appLog = log.bind(null, AppName);
export const require = createRequire(import.meta.dirname);

function kb(bytes: number) {
	return (bytes / 1000).toFixed(2) + 'kb';
}

function formatTime(time: bigint) {
	const s = Number(time) / 1e9,
		str = s.toFixed(4) + 's';
	// Color code based on time,
	return s > 0.1 ? (s > 0.5 ? colors.red(str) : colors.yellow(str)) : str;
}

export function resolveRequire<T>(mod: string): T {
	return require(require.resolve(mod, {
		paths: [process.cwd(), import.meta.dirname],
	}));
}

export async function build(...targets: BuildConfiguration[]) {
	if (!targets) throw new Error('Invalid configuration');

	if (BASEDIR !== process.cwd()) {
		process.chdir(BASEDIR);
		appLog(`chdir "${BASEDIR}"`);
	}

	const pkg = readPackage();

	appLog(`${pkg.name} ${pkg.version}`);

	const runTargets = [undefined, ...process.argv];
	try {
		for (const targetId of runTargets) {
			for (const target of targets)
				if (target.target === targetId)
					await new Build(appLog, target).build();
		}
	} catch (e) {
		console.error(e);
		process.exit(1);
	}
}

export function exec(cmd: string, options?: SpawnOptions) {
	return new Observable<never>(subs => {
		appLog(`sh ${cmd}`);
		operation(sh(cmd, options)).then(
			result => {
				appLog(`sh ${cmd}`, formatTime(result.time));
				if (result.result) console.log(result.result);
				subs.complete();
			},
			e => {
				subs.error(e);
			},
		);
	});
}

export function shell(cmd: string, options: SpawnOptions = {}) {
	return new Observable<Buffer>(subs => {
		const proc = spawn(cmd, [], {
			shell: true,
			...options,
		});
		let output: Buffer;
		let error: Buffer;
		proc.stdout?.on(
			'data',
			data =>
				(output = output
					? Buffer.concat([output, Buffer.from(data)])
					: Buffer.from(data)),
		);
		proc.stderr?.on(
			'data',
			data =>
				(error = error
					? Buffer.concat([error, Buffer.from(data)])
					: Buffer.from(data)),
		);
		proc.on('close', code => {
			if (code) subs.error(error || output);
			else {
				subs.next(output);
				subs.complete();
			}
		});
	});
}

class Build {
	outputDir: string;

	constructor(
		private log: Logger,
		private config: BuildConfiguration,
	) {
		this.outputDir = config.outputDir || '.';
	}

	async build() {
		try {
			const target = this.config.target || '';
			if (target) this.log(`target ${target}`);

			execSync(`mkdir -p ${this.outputDir}`);

			await Promise.all(
				this.config.tasks.map(task => this.runTask(task)),
			);
		} catch (e) {
			console.log('BUILD: ', e);
			throw 'Build finished with errors';
		}
	}

	private async runTask(task: Task) {
		await task.tap(result => {
			const outFile = resolve(this.outputDir, result.path);
			const source = result.source;
			const outputDir = dirname(outFile);
			if (!existsSync(outputDir)) execSync(`mkdir -p ${outputDir}`);
			writeFileSync(outFile, source);
			if (result.mtime) utimesSync(outFile, result.mtime, result.mtime);

			const printPath = relative(process.cwd(), outFile);
			this.log(`${printPath} ${kb((result.source || '').length)}`);
		});
	}
}
