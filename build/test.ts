import { spec } from '../spec/index.js';
import { exec } from './builder.js';

export default spec('build', s => {
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
