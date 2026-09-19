import { spec } from '@cxl/spec';
import { debounceFunction } from '../index.js';

export default spec('debounceFunction', it => {
	it.should('debounce calls by the specified delay', a => {
		const time = a.mockSetTimeout();
		let callCount = 0;
		const debouncedFunc = debounceFunction(() => {
			callCount++;
		}, 50);

		debouncedFunc();
		debouncedFunc();
		debouncedFunc();

		a.equal(callCount, 0);

		time.advance(60);
		a.equal(callCount, 1);
	});

	it.should('pass arguments and preserve context', a => {
		const time = a.mockSetTimeout();
		let capturedArgs: number[] = [];
		let capturedContext: unknown = null;

		const debouncedFunc = debounceFunction(function (
			this: unknown,
			...args: number[]
		) {
			capturedArgs = args;
			capturedContext = this;
		}, 30);

		const context = {};
		debouncedFunc.apply(context, [1, 2, 3]);

		time.advance(40);
		a.equalValues(capturedArgs, [1, 2, 3]);
		a.equal(capturedContext, context);
	});

	it.should('cancel the pending call when cancel is invoked', a => {
		const time = a.mockSetTimeout();
		let callCount = 0;
		const debouncedFunc = debounceFunction(() => {
			callCount++;
		}, 50);
		debouncedFunc();
		debouncedFunc.cancel();

		time.advance(60);
		a.equal(callCount, 0);
	});

	it.should('handle multiple debounce invocations correctly', a => {
		const time = a.mockSetTimeout();
		let callCount = 0;
		const debouncedFunc = debounceFunction(() => {
			callCount++;
		}, 50);

		debouncedFunc();
		time.advance(10);
		debouncedFunc();
		time.advance(10);
		debouncedFunc();
		time.advance(50);
		a.equal(callCount, 1);
	});

	it.should(
		'invoke multiple times with sufficient delay between calls',
		a => {
			const time = a.mockSetTimeout();
			let callCount = 0;
			const debouncedFunc = debounceFunction(() => {
				callCount++;
			}, 30);
			debouncedFunc();
			time.advance(50);
			debouncedFunc();
			time.advance(30);
			a.equal(callCount, 2);
		},
	);
});
