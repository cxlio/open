import { spec } from '../spec/index.js';

export default spec('keyboard fixture', s => {
	s.test('modifier chords', async a => {
		const input = document.createElement('input');
		const events: string[] = [];
		input.addEventListener('keydown', event => {
			events.push(
				`${event.type}:${event.key}:${event.ctrlKey}:${event.shiftKey}`,
			);
		});
		input.addEventListener('keyup', event => {
			events.push(
				`${event.type}:${event.key}:${event.ctrlKey}:${event.shiftKey}`,
			);
		});
		a.dom.append(input);

		await a.action({ type: 'keyDown', value: 'Control', element: input });
		await a.action({ type: 'press', value: 'A', element: input });
		await a.action({ type: 'keyUp', value: 'Control', element: input });
		await a.action({ type: 'keyDown', value: 'Shift', element: input });
		await a.action({ type: 'press', value: 'ArrowDown', element: input });
		await a.action({ type: 'keyUp', value: 'Shift', element: input });

		a.equal(
			events.join(','),
			[
				'keydown:Control:true:false',
				'keydown:A:true:false',
				'keyup:A:true:false',
				'keyup:Control:false:false',
				'keydown:Shift:false:true',
				'keydown:ArrowDown:false:true',
				'keyup:ArrowDown:false:true',
				'keyup:Shift:false:false',
			].join(','),
		);
	});
});
