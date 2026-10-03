// Small shared UI pieces: icons (Lucide-style strokes), avatars, tags, properties, callouts.

import type { ReactNode } from "react";

const PATHS: Record<string, ReactNode> = {
  home: <path d="M3 10.5 12 4l9 6.5V20a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z" />,
  store: (
    <>
      <path d="M3 9.5 4.5 4h15L21 9.5" />
      <path d="M4.5 9.5V20h15V9.5" />
      <path d="M9.5 20v-5.5h5V20" />
    </>
  ),
  users: (
    <>
      <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
      <circle cx="9" cy="7" r="4" />
      <path d="M22 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75" />
    </>
  ),
  user: (
    <>
      <circle cx="12" cy="8" r="4" />
      <path d="M4 21a8 8 0 0 1 16 0" />
    </>
  ),
  clock: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 7v5l3 2" />
    </>
  ),
  calendar: (
    <>
      <rect x="3" y="4.5" width="18" height="17" rx="2" />
      <path d="M16 2.5v4M8 2.5v4M3 10h18" />
    </>
  ),
  lock: (
    <>
      <rect x="4" y="11" width="16" height="10" rx="2" />
      <path d="M8 11V7a4 4 0 0 1 8 0v4" />
    </>
  ),
  coins: (
    <>
      <circle cx="9" cy="9" r="6" />
      <path d="M18.1 10.4A6 6 0 1 1 10.4 18.1" />
    </>
  ),
  wallet: (
    <>
      <path d="M20 7V5.5A1.5 1.5 0 0 0 18.5 4H5a2 2 0 0 0 0 4h15a1 1 0 0 1 1 1v3.5" />
      <path d="M3 6v12a2 2 0 0 0 2 2h15a1 1 0 0 0 1-1v-3.5" />
      <path d="M17 12.5h4v3h-4a1.5 1.5 0 0 1 0-3z" />
    </>
  ),
  qr: (
    <>
      <rect x="3" y="3" width="7" height="7" rx="1" />
      <rect x="14" y="3" width="7" height="7" rx="1" />
      <rect x="3" y="14" width="7" height="7" rx="1" />
      <path d="M14 14h3v3h-3zM21 14v.01M14 21h.01M17.5 21H21v-3.5" />
    </>
  ),
  activity: <path d="M22 12h-4l-3 9L9 3l-3 9H2" />,
  check: <path d="M20 6 9 17l-5-5" />,
  x: <path d="M18 6 6 18M6 6l12 12" />,
  plus: <path d="M12 5v14M5 12h14" />,
  chevronDown: <path d="m6 9 6 6 6-6" />,
  chevronRight: <path d="m9 18 6-6-6-6" />,
  external: <path d="M15 3h6v6M10 14 21 3M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />,
  copy: (
    <>
      <rect x="9" y="9" width="12" height="12" rx="2" />
      <path d="M5 15H4.5A1.5 1.5 0 0 1 3 13.5V4.5A1.5 1.5 0 0 1 4.5 3h9A1.5 1.5 0 0 1 15 4.5V5" />
    </>
  ),
  menu: <path d="M4 6h16M4 12h16M4 18h16" />,
  shield: <path d="M12 22s8-4 8-10V5.5L12 2.5 4 5.5V12c0 6 8 10 8 10z" />,
  info: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 16v-4.5M12 8h.01" />
    </>
  ),
  alert: (
    <>
      <path d="M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z" />
      <path d="M12 9v4M12 17h.01" />
    </>
  ),
  send: <path d="m22 2-7 20-4-9-9-4zM22 2 11 13" />,
  hash: <path d="M4 9h16M4 15h16M10 3 8 21M16 3l-2 18" />,
  book: (
    <>
      <path d="M2 4h6a4 4 0 0 1 4 4v13a3 3 0 0 0-3-3H2z" />
      <path d="M22 4h-6a4 4 0 0 0-4 4v13a3 3 0 0 1 3-3h7z" />
    </>
  ),
};

export function Icon({ name, size = 16, className }: { name: keyof typeof PATHS | string; size?: number; className?: string }) {
  return (
    <svg
      className={`icon ${className ?? ""}`}
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.7}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {PATHS[name]}
    </svg>
  );
}

export function Spinner() {
  return (
    <svg className="spinner" width={14} height={14} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.2} strokeLinecap="round" aria-hidden="true">
      <path d="M21 12a9 9 0 1 1-6.2-8.6" />
    </svg>
  );
}

const AVATAR_TONES = ["blue", "green", "orange", "purple", "pink", "brown", "yellow", "red"];
export function Avatar({ name, seed, size = 22 }: { name: string; seed?: string; size?: number }) {
  const key = seed ?? name;
  let h = 0;
  for (let i = 0; i < key.length; i++) h = (h * 31 + key.charCodeAt(i)) >>> 0;
  return (
    <span className={`avatar tone-${AVATAR_TONES[h % AVATAR_TONES.length]}`} style={{ width: size, height: size, fontSize: size * 0.48 }}>
      {(name.trim()[0] ?? "?").toUpperCase()}
    </span>
  );
}

export type Tone = "gray" | "blue" | "green" | "orange" | "red" | "yellow" | "purple";
export const Tag = ({ tone = "gray", children }: { tone?: Tone; children: ReactNode }) => (
  <span className={`tag tone-${tone}`}>{children}</span>
);

export function Properties({ children }: { children: ReactNode }) {
  return <div className="props">{children}</div>;
}
export function Prop({ icon, label, children }: { icon: string; label: string; children: ReactNode }) {
  return (
    <div className="prop">
      <div className="prop-label">
        <Icon name={icon} size={15} />
        {label}
      </div>
      <div className="prop-value">{children}</div>
    </div>
  );
}

export function Callout({ icon = "info", tone = "gray", children }: { icon?: string; tone?: Tone; children: ReactNode }) {
  return (
    <div className={`callout tone-${tone}`}>
      <Icon name={icon} size={18} />
      <div>{children}</div>
    </div>
  );
}

export function ExtLink({ href, children }: { href: string; children: ReactNode }) {
  return (
    <a className="ext" href={href} target="_blank" rel="noreferrer">
      {children}
      <Icon name="external" size={12} />
    </a>
  );
}
