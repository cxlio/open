import { spec } from './index.js';
import { ref } from '../rx/index.js';

export default spec('spec', s => {
	s.test('should load', a => {
		a.ok(spec);
	});

	s.test('equal accepts unknown values', a => {
		const value: unknown = 'value';
		a.equal(value, 'value');
		a.equalValues(value, 'value');
	});

	s.test('spyFn preserves method parameters', a => {
		const subject = ref<Record<string, unknown>>();
		const spy = a.spyFn(subject, 'next');
		const settings = { source: { theme: 'dark' } };

		subject.next(settings);

		a.equal(spy.lastEvent?.arguments[0], settings);
	});
});
