import { styleAttribute, Component, Slot, component } from './component.js';
import { css } from './theme.js';
import { on } from './dom.js';

/**
 * A backdrop appears behind all other surfaces in an app, displaying contextual and actionable content.
 * @beta
 * @demo
 * <c-backdrop></c-backdrop>
 */
export class Backdrop extends Component {
	center = false;
}
component(Backdrop, {
	tagName: 'c-backdrop',
	init: [styleAttribute('center')],
	augment: [
		css(`
:host {
  position: absolute;
  top: 0;
  left: 0;
  bottom: 0;
  right: 0;
  background-color: var(--cxl-color-scrim);
  overflow: hidden;
}
:host([center]) {
  display: flex;
  justify-content: center;
  align-items: center;
}

	`),
		$ => on($, 'keydown').tap(ev => ev.stopPropagation()),
		Slot,
	],
});
