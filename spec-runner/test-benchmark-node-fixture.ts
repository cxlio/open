import { readdir } from 'fs/promises';
import { spec } from '../spec/index.js';

const options = { warmup: 0, sampleTime: 1, samples: 2 };

export default spec('node benchmark fixture', s => {
	s.test('filesystem discovery', a =>
		a.benchmark(() => readdir(import.meta.dirname), options),
	);
});
