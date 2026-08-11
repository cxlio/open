import { spec } from '../spec/index.js';

export default spec('drag fixture', s => {
	s.test('drag', async a => {
		const source = document.createElement('div');
		const target = document.createElement('div');
		source.draggable = true;
		source.textContent = 'source';
		target.textContent = 'target';
		source.style.width = target.style.width = '100px';
		source.style.height = target.style.height = '100px';
		target.addEventListener('dragover', event => event.preventDefault());
		target.addEventListener('drop', () => {
			target.dataset.dropped = 'true';
		});
		a.dom.append(source, target);

		await a.drag(source, target);

		a.equal(target.dataset.dropped, 'true');
	});
});
