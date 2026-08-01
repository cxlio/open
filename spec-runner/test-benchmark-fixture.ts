import { spec } from '../spec/index.js';

let active = false;

async function run() {
	if (active) throw new Error('Benchmark measurements overlapped');
	active = true;
	await Promise.resolve();
	active = false;
}

const options = { warmup: 0, sampleTime: 1, samples: 2 };

export default spec('benchmark fixture', s => {
	s.test('first', a => a.benchmark(run, options));
	s.test('second', a => a.benchmark(run, options));
});
