import { useEffect, useRef } from "react";
import { X } from "lucide-react";

const TOAST_DURATION_MS = 5000;

export interface ToastItem {
  id: string;
  message: string;
  undoLabel?: string;
  onUndo?: () => void;
  /** Called when toast is dismissed by timeout or X (not by Undo) */
  onExpire?: () => void;
  duration?: number;
}

interface ToastProps {
  toast: ToastItem;
  onDismiss: (id: string) => void;
}

export function Toast({ toast, onDismiss }: ToastProps) {
  const timeoutRef = useRef<number | null>(null);

  useEffect(() => {
    const duration = toast.duration ?? TOAST_DURATION_MS;
    timeoutRef.current = window.setTimeout(() => {
      toast.onExpire?.();
      onDismiss(toast.id);
    }, duration);
    return () => {
      if (timeoutRef.current != null) {
        window.clearTimeout(timeoutRef.current);
      }
    };
  }, [toast.id, toast.duration, onDismiss]);

  const handleDismiss = () => {
    if (timeoutRef.current != null) {
      window.clearTimeout(timeoutRef.current);
      timeoutRef.current = null;
    }
    toast.onExpire?.();
    onDismiss(toast.id);
  };

  const handleUndo = () => {
    if (timeoutRef.current != null) {
      window.clearTimeout(timeoutRef.current);
      timeoutRef.current = null;
    }
    toast.onUndo?.();
    // Do not call onExpire when undoing
    onDismiss(toast.id);
  };

  return (
    <div
      className="w-fit max-w-[calc(100vw-32px)] rounded-[10px] border border-[#0B3F2E] bg-[#050505] px-[14px] py-[12px] shadow-[0_0_8px_rgba(11,63,46,0.25)] animate-fade-in flex items-center gap-2"
      role="status"
    >
      <p className="text-sm font-semibold text-emerald-100">
        {toast.message}
      </p>
      {toast.onUndo != null && (
        <button
          type="button"
          onClick={handleUndo}
          className="rounded px-2 py-1 text-xs font-medium text-emerald-300 hover:bg-emerald-500/20 hover:text-emerald-200 transition-colors shrink-0"
        >
          {toast.undoLabel ?? "Undo"}
        </button>
      )}
      <button
        type="button"
        onClick={handleDismiss}
        className="rounded p-1 text-emerald-300/80 hover:bg-emerald-500/20 hover:text-emerald-200 transition-colors shrink-0"
        aria-label="Dismiss"
      >
        <X className="h-4 w-4" />
      </button>
    </div>
  );
}

interface ToastContainerProps {
  toasts: ToastItem[];
  onDismiss: (id: string) => void;
}

export function ToastContainer({ toasts, onDismiss }: ToastContainerProps) {
  if (toasts.length === 0) return null;

  return (
    <div
      className="fixed bottom-4 left-4 z-[100] flex flex-col gap-2 pointer-events-none"
      aria-live="polite"
    >
      <div className="pointer-events-auto">
        {toasts.map((t) => (
          <Toast key={t.id} toast={t} onDismiss={onDismiss} />
        ))}
      </div>
    </div>
  );
}
