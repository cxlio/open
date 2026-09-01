import { spec, type RunnerCommand, type TestApi } from './index.js';
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

	s.test('deep equality rejects inherited property matches', async a => {
		const assertions = spec('deep equality', s => {
			s.test('own property', a => {
				const actual: Record<string, string> = { toString: 'own' };
				const expected: Record<string, string> = {};
				a.equalValues(actual, expected);
			});
		});
		await assertions.run();
		a.equal(assertions.toJSON().tests[0]?.results[0]?.success, false);
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

	s.test('afterAll failures are reported', async a => {
		const assertions = spec('cleanup', s => {
			s.afterAll(() => {
				throw new Error('cleanup failed');
			});
		});
		await assertions.run();
		a.equal(assertions.toJSON().results[0]?.failureMessage, 'cleanup failed');
	});

	s.test('proxy registrations are released by their owner', async a => {
		const commands: RunnerCommand[] = [];
		Object.assign(globalThis, {
			__cxlRunner: async (command: RunnerCommand) => {
				commands.push(command);
				return { success: true, failureMessage: 'Proxy' };
			},
		});
		try {
			const assertions = spec('proxy', s => {
				s.test('owner', async a => {
					await a.proxy('/static', 'http://127.0.0.1:8122');
					await a.proxy('/api', {
						target: 'http://127.0.0.1:8123',
						command: 'node',
						args: ['server.js'],
					});
				});
			});
			await assertions.run();
		} finally {
			Reflect.deleteProperty(globalThis, '__cxlRunner');
		}

		a.equal(commands[0]?.type, 'proxy');
		a.equal(commands[1]?.type, 'proxyService');
		a.equal(commands[2]?.type, 'proxyRelease');
		a.equal(commands[3]?.type, 'proxyRelease');
		if (
			commands[0]?.type === 'proxy' &&
			commands[1]?.type === 'proxyService' &&
			commands[2]?.type === 'proxyRelease' &&
			commands[3]?.type === 'proxyRelease'
		)
			a.equalValues(
				[commands[0].registrationId, commands[1].registrationId],
				[commands[2].registrationId, commands[3].registrationId],
			);
	});

	s.test('spyFn preserves method parameters', a => {
		const subject = ref<Record<string, unknown>>();
		const spy = a.spyFn(subject, 'next');
		const settings = { source: { theme: 'dark' } };

		subject.next(settings);

		a.equal(spy.lastEvent?.arguments[0], settings);
	});

	s.test('benchmark', it => {
		it.should('measure the current test', async (a: TestApi) => {
			await a.benchmark(() => 1, {
				warmup: 0,
				sampleTime: 1,
				samples: 3,
			});
			const result = a.$test.results[0];
			a.assert(result?.data?.type === 'benchmark');
			a.equal(result.data.values.length, 3);
			a.ok(result.data.iterations > 0);
			a.ok(result.data.median >= 0);
		});

		it.should('reject multiple measurements', async a => {
			await a.benchmark(() => 1, {
				warmup: 0,
				sampleTime: 1,
				samples: 1,
			});
			a.throws(() => a.benchmark(() => 1), {
				message: 'benchmark() called multiple times',
			});
		});
	});
});
