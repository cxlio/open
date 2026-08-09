import { sh } from '../program/index.js';

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
			sh(`git rev-parse ${branch}`, { cwd }),
			sh(`git ls-remote --exit-code origin refs/heads/${branch}`, { cwd }),
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
