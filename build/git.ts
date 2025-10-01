import { sh } from '../program/index.js';

export async function getBranch(cwd: string): Promise<string> {
	return (await sh('git rev-parse --abbrev-ref HEAD', { cwd })).trim();
}

export async function checkBranchClean(branch: string) {
	try {
		await sh(`git status > /dev/null; git diff-index --quiet ${branch}`);
	} catch (e) {
		throw new Error('Not a clean repository');
	}
}

export async function checkBranchUpToDate(branch: string) {
	try {
		await sh(`git diff origin/${branch} ${branch} --quiet`);
	} catch (e) {
		throw new Error('Branch has not been merged with origin');
	}
}

export async function getMainBranch(cwd: string) {
	return await sh(`git symbolic-ref --short refs/remotes/origin/HEAD`, {
		cwd,
	});
}
