// Minimal stroke icons (24px grid, currentColor).
type P = { size?: number; className?: string };
const make = (d: React.ReactNode) =>
  function Icon({ size = 16, className }: P) {
    return (
      <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden>
        {d}
      </svg>
    );
  };

export const ArrowUp = make(<path d="M12 19V5M5 12l7-7 7 7" />);
export const ArrowDown = make(<path d="M12 5v14M19 12l-7 7-7-7" />);
export const Close = make(<path d="M18 6 6 18M6 6l12 12" />);
export const Wand = make(<><path d="m15 4 1 2 2 1-2 1-1 2-1-2-2-1 2-1z" /><path d="M4 20 14 10" /></>);
export const Target = make(<><circle cx="12" cy="12" r="8" /><path d="M12 2v4M12 18v4M2 12h4M18 12h4" /></>);
export const Copy = make(<><rect x="9" y="9" width="11" height="11" rx="2" /><path d="M5 15V5a2 2 0 0 1 2-2h8" /></>);
export const Eye = make(<><path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12z" /><circle cx="12" cy="12" r="3" /></>);
export const Upload = make(<path d="M12 15V3M7 8l5-5 5 5M4 15v4a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-4" />);
export const Download = make(<path d="M12 3v12M7 10l5 5 5-5M4 15v4a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-4" />);
export const Trash = make(<path d="M3 6h18M8 6V4h8v2M6 6l1 14h10l1-14" />);
export const Check = make(<path d="M20 6 9 17l-5-5" />);
export const Shield = make(<path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />);
export const Plus = make(<path d="M12 5v14M5 12h14" />);
export const Link = make(<><path d="M10 13a5 5 0 0 0 7 0l3-3a5 5 0 0 0-7-7l-1 1" /><path d="M14 11a5 5 0 0 0-7 0l-3 3a5 5 0 0 0 7 7l1-1" /></>);
export const Grid = make(<><rect x="3" y="3" width="7" height="7" rx="1.5" /><rect x="14" y="3" width="7" height="7" rx="1.5" /><rect x="3" y="14" width="7" height="7" rx="1.5" /><rect x="14" y="14" width="7" height="7" rx="1.5" /></>);
export const Zap = make(<path d="M13 2 3 14h9l-1 8 10-12h-9z" />);
