import { spec } from '../spec/index.js';
import { exec } from './builder.js';
import { EMPTY } from '@cxl/rx';

export default spec('build', s => {
	s.test('exec', it => {
		it.should('throw error if exec fails', a => {
			const done = a.async();
			exec('exit 1')
				.catchError(e => {
					a.ok(e !== undefined);
					done();
					return EMPTY;
				})
				.subscribe();
		});
	});
});
