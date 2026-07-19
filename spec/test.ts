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

	s.test('assertions provide default messages', async a => {
		const assertions = spec('assertions', s => {
			s.test('ok', a => a.ok(true));
			s.test('assert', a => a.assert(true));
			s.test('failed ok', a => a.ok(false));
			s.test('explicit', a => a.ok(true, 'Explicit message'));
		});
		await assertions.run();
		const results = assertions.toJSON().tests.map(test => test.results[0]);
		a.equal(results[0]?.message, 'Expected value to be truthy');
		a.equal(results[1]?.message, 'Expected value to be truthy');
		a.equal(
			results[2]?.failureMessage,
			'Assertion failed: Expected value to be truthy',
		);
		a.equal(results[3]?.message, 'Explicit message');
		a.throws(() => a.assert(false), {
			message: 'Expected value to be truthy',
		});
	});

	s.test('spyFn preserves method parameters', a => {
		const subject = ref<Record<string, unknown>>();
		const spy = a.spyFn(subject, 'next');
		const settings = { source: { theme: 'dark' } };

		subject.next(settings);

		a.equal(spy.lastEvent?.arguments[0], settings);
	});
});
