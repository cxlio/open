import { Span } from './component.js';
import type { ToggleTargetLike } from './toggle-target.js';

interface OpenPopupOptions {
	element: ToggleTargetLike;
	close(): void;
}

class PopupManager {
	currentPopupContainer?: HTMLElement;
	currentPopup?: OpenPopupOptions;
	currentModal?: {
		element: HTMLDialogElement & { popupContainer?: Span };
		close: () => void;
	};
	currentTooltip?: HTMLElement;
	popupContainer = document.body;

	toggle(options: OpenPopupOptions) {
		if (options.element.parentElement !== this.popupContainer)
			this.popupOpened(options);
		else options.close();
	}

	popupOpened(options: OpenPopupOptions) {
		if (this.currentPopup && options.element !== this.currentPopup.element)
			this.currentPopup.close();
		this.currentPopup = options;
	}

	openModal(options: { element: HTMLDialogElement; close: () => void }) {
		if (this.currentModal && options.element !== this.currentModal.element)
			this.currentModal.close();
		if (!options.element.parentNode)
			this.popupContainer?.append(options.element);

		if (!options.element.open) options.element.showModal();
		this.currentModal = options;
	}

	closeModal() {
		this.currentModal?.close();
		this.modalClosed();
	}

	modalClosed() {
		this.currentModal = undefined;
	}

	tooltipOpened(element: HTMLElement) {
		if (this.currentTooltip && this.currentTooltip !== element)
			this.currentTooltip.remove();
		this.currentTooltip = element;
	}

	close() {
		this.currentPopup?.close();
	}
}

export const popupManager = new PopupManager();
