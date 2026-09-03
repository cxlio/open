import { sh } from '../program/index.js';
import { spawn } from 'child_process';

function git(args: string[], cwd?: string) {
	return new Promise<string>((resolve, reject) => {
		const proc = spawn('/usr/bin/git', args, {
			cwd,
			shell: false,
			stdio: ['inherit', 'pipe', 'pipe'],
		});
		let output = '';
		proc.stdout.on('data', (data: Buffer) => (output += data.toString()));
		proc.stderr.on('data', (data: Buffer) => (output += data.toString()));
		proc.on('error', reject);
		proc.on('close', code => {
			if (code !== 0) reject(output);
			else resolve(output);
		});
	});
}

export async function getBranch(cwd: string): Promise<string> {
	return (await sh('git rev-parse --abbrev-ref HEAD', { cwd })).trim();
}

export async function getRefHash(cwd?: string) {
	return (
		await sh(
			'git rev-parse --short "$(git symbolic-ref HEAD | sed \'s@^refs/remotes/origin/@@\')"',
			{ cwd },
		)
	).trim();
}

export async function checkBranchClean(_branch: string, cwd?: string) {
	const status = await sh('git status --porcelain', { cwd });
	if (status.trim()) throw new Error('Not a clean repository');
}

export async function checkBranchUpToDate(branch: string, cwd?: string) {
	try {
		const [local, remote] = await Promise.all([
			git(['rev-parse', branch], cwd),
			git(['ls-remote', '--exit-code', 'origin', `refs/heads/${branch}`], cwd),
		]);
		if (local.trim() !== remote.trim().split(/\s+/)[0]) throw new Error();
	} catch (e) {
		throw new Error('Branch has not been merged with origin', { cause: e });
	}
}

export async function getMainBranch(cwd: string) {
	return (
		await sh(`git remote show origin`, {
			cwd,
		})
	).match(/HEAD branch:\s+(\S+)/)?.[1];
}
