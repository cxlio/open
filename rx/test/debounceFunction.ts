import { spec } from '../../spec/index.js';
import { debounceFunction } from '../index.js';
import { mockSetTimeout } from './util.js';

declare const setTimeout: (fn: () => unknown, n?: number) => number;

export default spec('debounceFunction', it => {
	it.should('debounce calls by the specified delay', a => {
		let callCount = 0;
		const done = a.async();
		const debouncedFunc = debounceFunction(() => {
			callCount++;
		}, 50);

		debouncedFunc();
		debouncedFunc();
		debouncedFunc();

		a.equal(callCount, 0);

		setTimeout(() => {
			a.equal(callCount, 1);
			done();
		}, 60);
	});

	it.should('pass arguments and preserve context', a => {
		let capturedArgs: number[] = [];
		let capturedContext: unknown = null;
		const done = a.async();

		const debouncedFunc = debounceFunction(function (
			this: unknown,
			...args: number[]
		) {
			capturedArgs = args;
			capturedContext = this;
		}, 30);

		const context = {};
		debouncedFunc.apply(context, [1, 2, 3]);

		setTimeout(() => {
			a.equalValues(capturedArgs, [1, 2, 3]);
			a.equal(capturedContext, context);
			done();
		}, 40);
	});

	it.should('cancel the pending call when cancel is invoked', a => {
		let callCount = 0;
		const debouncedFunc = debounceFunction(() => {
			callCount++;
		}, 50);
		const done = a.async();

		debouncedFunc();
		debouncedFunc.cancel();

		setTimeout(() => {
			a.equal(callCount, 0);
			done();
		}, 60);
	});

	it.should('handle multiple debounce invocations correctly', a => {
		mockSetTimeout(advance => {
			let callCount = 0;
			const debouncedFunc = debounceFunction(() => {
				callCount++;
			}, 50);

			debouncedFunc();
			setTimeout(debouncedFunc, 10);
			setTimeout(debouncedFunc, 20);

			advance(100);
			a.equal(callCount, 1);
		});
	});

	it.should(
		'invoke multiple times with sufficient delay between calls',
		a => {
			let callCount = 0;
			const debouncedFunc = debounceFunction(() => {
				callCount++;
			}, 30);
			const done = a.async();

			debouncedFunc();

			setTimeout(debouncedFunc, 50);

			setTimeout(() => {
				a.equal(callCount, 2);
				done();
			}, 100);
		},
	);
});
