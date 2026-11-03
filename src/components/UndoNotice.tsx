import { useLayoutEffect, useRef } from 'react';
import { Icon } from './Icon';
export function UndoNotice({
  busy,
  onUndo,
  onDismiss,
  onRestoreFocus,
}: {
  busy: boolean;
  onUndo: () => Promise<boolean>;
  onDismiss: () => void;
  onRestoreFocus: () => void;
}) {
  const wrapper = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    const keepFocusVisible = () => {
      const focused = document.activeElement;
      const notice = wrapper.current;
      if (
        !(focused instanceof HTMLElement) ||
        focused === document.body ||
        !notice ||
        notice.contains(focused)
      )
        return;
      const target = focused.getBoundingClientRect();
      const toast = notice.getBoundingClientRect();
      if (
        target.right > toast.left &&
        target.left < toast.right &&
        target.bottom > toast.top &&
        target.top < toast.bottom
      )
        window.scrollBy(0, target.bottom - toast.top + 16);
    };
    keepFocusVisible();
    document.addEventListener('focusin', keepFocusVisible);
    window.addEventListener('resize', keepFocusVisible);
    return () => {
      document.removeEventListener('focusin', keepFocusVisible);
      window.removeEventListener('resize', keepFocusVisible);
    };
  }, []);
  return (
    <div ref={wrapper} className="undo-notice" aria-label="Отмена удаления">
      <span>Задача удалена</span>
      <button
        disabled={busy}
        type="button"
        onClick={async () => {
          if (await onUndo()) onRestoreFocus();
        }}
      >
        Отменить
      </button>
      <button
        className="icon-button"
        disabled={busy}
        type="button"
        aria-label="Закрыть уведомление"
        onClick={() => {
          const focused = wrapper.current?.contains(document.activeElement);
          onDismiss();
          if (focused) onRestoreFocus();
        }}
      >
        <Icon name="close" />
      </button>
    </div>
  );
}
