import { spec } from '../spec/index.js';
import {
	buildOutputOptions,
	buildTargets,
	exec,
	formatArtifactSummary,
} from './builder.js';

export default spec('build', s => {
	s.test('output', it => {
		it.should('parse verbose option', a => {
			a.equal(buildOutputOptions(['test']).verbose, false);
			a.equal(buildOutputOptions(['test', '--verbose']).verbose, true);
		});

		it.should('exclude verbose flag from targets', a => {
			a.equalValues(buildTargets(['test', '--verbose']), [
				undefined,
				'test',
			]);
		});

		it.should('format artifact summary', a => {
			a.equal(
				formatArtifactSummary([
					{ path: 'index.js', size: 1500 },
					{ path: 'index.d.ts', size: 500 },
				]),
				'2 files, 2.00kb',
			);
		});
	});

	s.test('exec', it => {
		it.should('throw error if exec fails', async a => {
			try {
				await exec('exit 1');
			} catch (e) {
				a.ok(e !== undefined);
			}
		});
	});
});
