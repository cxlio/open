import { spec } from '../spec/index.js';
import { exec } from './index.js';

export default spec('build', s => {
	s.test('exec', it => {
		it.should('throw error if exec fails', a => {
			const done = a.async();
			exec('exit 1')
				.catchError(e => {
					a.ok(e !== undefined);
					done();
				})
				.subscribe();
		});
	});
});
