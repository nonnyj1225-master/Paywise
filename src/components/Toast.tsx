import { useEffect } from "react";

export interface ToastData {
  id: number;
  message: string;
  actionLabel?: string;
  onAction?: () => void;
}

interface ToastContainerProps {
  toasts: ToastData[];
  onDismiss: (id: number) => void;
}

export default function ToastContainer({ toasts, onDismiss }: ToastContainerProps) {
  return (
    <div className="fixed bottom-20 left-1/2 -translate-x-1/2 z-50 flex flex-col gap-2 pointer-events-none">
      {toasts.map((toast) => (
        <div
          key={toast.id}
          className="pointer-events-auto flex items-center gap-3 rounded-lg bg-gray-900 px-4 py-3 text-sm text-white shadow-lg animate-slide-up"
        >
          <span className="flex-1">{toast.message}</span>
          {toast.actionLabel && toast.onAction && (
            <button
              onClick={() => {
                toast.onAction!();
                onDismiss(toast.id);
              }}
              className="rounded bg-white/20 px-2 py-1 text-xs font-medium text-white hover:bg-white/30 transition-colors whitespace-nowrap"
            >
              {toast.actionLabel}
            </button>
          )}
          <button
            onClick={() => onDismiss(toast.id)}
            className="text-white/60 hover:text-white ml-1"
          >
            ✕
          </button>
        </div>
      ))}
    </div>
  );
}

// Add the CSS animation to app.css via a style tag — we rely on tailwind's
// arbitrary values. If the animation doesn't work, add this to app.css:
// @keyframes slide-up { from { opacity: 0; transform: translateY(10px); } to { opacity: 1; transform: translateY(0); } }
// .animate-slide-up { animation: slide-up 0.25s ease-out; }
