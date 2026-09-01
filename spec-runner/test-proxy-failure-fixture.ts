import { spec } from '../spec/index.js';

export default spec('managed proxy failure fixture', async s => {
	await s.proxy('/managed', {
		target: 'http://127.0.0.1:43124',
		command: 'node',
		args: [
			'--eval',
			'process.stdout.write("service stdout\\n"); process.stderr.write("service stderr\\n")',
		],
	});
	await new Promise(resolve => setTimeout(resolve, 100));
});
