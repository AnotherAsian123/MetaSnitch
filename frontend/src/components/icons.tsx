interface IconProps {
  className?: string;
}

const base = (className?: string) => className ?? "h-5 w-5";

export const FolderIcon = ({ className }: IconProps) => (
  <svg className={base(className)} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
    <path d="M3 7a2 2 0 0 1 2-2h4l2 2h6a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
  </svg>
);

export const UploadIcon = ({ className }: IconProps) => (
  <svg className={base(className)} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
    <path d="M12 16V4m0 0 4 4m-4-4-4 4" />
    <path d="M4 16v2a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-2" />
  </svg>
);

export const SearchIcon = ({ className }: IconProps) => (
  <svg className={base(className)} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="11" cy="11" r="7" />
    <path d="m21 21-4.3-4.3" />
  </svg>
);

export const CloseIcon = ({ className }: IconProps) => (
  <svg className={base(className)} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
    <path d="M18 6 6 18M6 6l12 12" />
  </svg>
);

export const ChevronLeft = ({ className }: IconProps) => (
  <svg className={base(className)} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
    <path d="m15 18-6-6 6-6" />
  </svg>
);

export const ChevronRight = ({ className }: IconProps) => (
  <svg className={base(className)} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
    <path d="m9 18 6-6-6-6" />
  </svg>
);

export const CopyIcon = ({ className }: IconProps) => (
  <svg className={base(className)} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
    <rect x="9" y="9" width="11" height="11" rx="2" />
    <path d="M5 15V5a2 2 0 0 1 2-2h10" />
  </svg>
);

export const DownloadIcon = ({ className }: IconProps) => (
  <svg className={base(className)} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
    <path d="M12 4v12m0 0 4-4m-4 4-4-4" />
    <path d="M4 20h16" />
  </svg>
);

export const StarIcon = ({ className, filled }: IconProps & { filled?: boolean }) => (
  <svg className={base(className)} viewBox="0 0 24 24" fill={filled ? "currentColor" : "none"} stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
    <path d="m12 3 2.7 5.5 6 .9-4.3 4.2 1 6L12 17l-5.4 2.6 1-6L3.3 9.4l6-.9z" />
  </svg>
);

export const CompareIcon = ({ className }: IconProps) => (
  <svg className={base(className)} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
    <rect x="3" y="4" width="7" height="16" rx="1.5" />
    <rect x="14" y="4" width="7" height="16" rx="1.5" />
  </svg>
);

export const SeedIcon = ({ className }: IconProps) => (
  <svg className={base(className)} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="6" cy="6" r="2.5" />
    <circle cx="18" cy="6" r="2.5" />
    <circle cx="6" cy="18" r="2.5" />
    <circle cx="18" cy="18" r="2.5" />
    <path d="M8.5 6h7M6 8.5v7M18 8.5v7M8.5 18h7" />
  </svg>
);
