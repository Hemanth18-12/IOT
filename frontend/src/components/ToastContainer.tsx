import React from 'react';
import { AlertCircle, CheckCircle2, Info, X } from 'lucide-react';
import { useRealtime } from '../context/RealtimeContext';

export const ToastContainer: React.FC = () => {
  const { toasts, dismissToast } = useRealtime();

  if (toasts.length === 0) return null;

  return (
    <div
      className="fixed bottom-4 right-4 z-50 flex w-full max-w-sm flex-col gap-2.5 px-4 sm:px-0"
      aria-live="polite"
    >
      {toasts.map((toast) => {
        const accent =
          toast.variant === 'error'
            ? 'border-l-[#EF4444]'
            : toast.variant === 'warning'
              ? 'border-l-[#F59E0B]'
              : toast.variant === 'success'
                ? 'border-l-[#22C55E]'
                : 'border-l-[#FACC15]';

        const Icon =
          toast.variant === 'success'
            ? CheckCircle2
            : toast.variant === 'error' || toast.variant === 'warning'
              ? AlertCircle
              : Info;

        const iconColor =
          toast.variant === 'error'
            ? 'text-[#EF4444]'
            : toast.variant === 'warning'
              ? 'text-[#F59E0B]'
              : toast.variant === 'success'
                ? 'text-[#22C55E]'
                : 'text-[#FACC15]';

        return (
          <div
            key={toast.id}
            className={`flex items-start gap-3 rounded-[10px] border border-[#303030] border-l-4 ${accent} bg-[#1C1C1C] p-3.5 shadow-lg`}
          >
            <Icon className={`mt-0.5 h-4 w-4 shrink-0 ${iconColor}`} />
            <div className="min-w-0 flex-1">
              <div className="text-sm font-semibold text-[#F5F5F5]">{toast.title}</div>
              <div className="mt-0.5 text-xs text-[#A3A3A3]">{toast.message}</div>
            </div>
            <button
              type="button"
              onClick={() => dismissToast(toast.id)}
              aria-label="Dismiss notification"
              className="rounded p-1 text-[#A3A3A3] hover:bg-[#242424] hover:text-[#F5F5F5]"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
        );
      })}
    </div>
  );
};
