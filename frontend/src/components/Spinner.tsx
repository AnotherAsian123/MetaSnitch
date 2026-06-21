export function Spinner({ className = "h-6 w-6" }: { className?: string }) {
  return (
    <svg className={`animate-spin ${className}`} viewBox="0 0 24 24" fill="none">
      <circle className="opacity-20" cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="3" />
      <path
        className="opacity-90"
        d="M21 12a9 9 0 0 0-9-9"
        stroke="currentColor"
        strokeWidth="3"
        strokeLinecap="round"
      />
    </svg>
  );
}

export function LoadingOverlay({ label }: { label: string }) {
  return (
    <div className="flex animate-fade-in flex-col items-center justify-center gap-4 py-24 text-ash">
      <Spinner className="h-8 w-8 text-snow" />
      <p className="text-sm tracking-wide">{label}</p>
    </div>
  );
}
