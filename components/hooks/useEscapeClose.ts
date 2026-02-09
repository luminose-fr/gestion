import { useEffect } from 'react';

export const useEscapeClose = (
  isOpen: boolean,
  onClose: () => void,
  disabled = false
) => {
  useEffect(() => {
    if (!isOpen || disabled) return;

    const handler = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        onClose();
      }
    };

    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [isOpen, onClose, disabled]);
};
