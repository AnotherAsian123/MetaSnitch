import { createContext, useCallback, useContext, useMemo, useRef, useState } from "react";

type ToastKind = "error" | "info" | "success";
interface Toast {
  id: number;
  kind: ToastKind;
  message: string;
}

const ToastContext = createContext<(message: string, kind?: ToastKind) => void>(() => {});

export function useToast() {
  return useContext(ToastContext);
}

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const counter = useRef(0);

  const push = useCallback((message: string, kind: ToastKind = "error") => {
    const id = ++counter.current;
    setToasts((prev) => [...prev, { id, kind, message }]);
    window.setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, 6000);
  }, []);

  const value = useMemo(() => push, [push]);

  return (
    <ToastContext.Provider value={value}>
      {children}
      <div className="pointer-events-none fixed bottom-4 left-1/2 z-[100] flex w-full max-w-md -translate-x-1/2 flex-col gap-2 px-4">
        {toasts.map((t) => (
          <div
            key={t.id}
            className={`pointer-events-auto animate-slide-up rounded-xl border px-4 py-3 text-sm shadow-2xl backdrop-blur ${
              t.kind === "error"
                ? "border-red-500/40 bg-red-950/70 text-red-100"
                : t.kind === "success"
                  ? "border-emerald-500/30 bg-emerald-950/60 text-emerald-100"
                  : "border-charcoal/60 bg-carbon/90 text-snow"
            }`}
          >
            {t.message}
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}
