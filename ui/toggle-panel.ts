import { Slot, component } from './component.js';
import {
	ToggleTargetBase,
	toggleTargetStyles,
	toggleTargetBehavior,
} from './toggle-target.js';

declare module './component' {
	interface Components {
		'c-toggle-panel': TogglePanel;
	}
}

/**
 * The TogglePanel component works in tandem with Toggle components.
 * It hides or reveals itself using the specified motion whenever the toggle is activated.
 *
 * @tagName c-toggle-panel
 * @beta
 */
export class TogglePanel extends ToggleTargetBase {}

component(TogglePanel, {
	tagName: 'c-toggle-panel',
	augment: [Slot, toggleTargetStyles, toggleTargetBehavior],
});
