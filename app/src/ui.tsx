// Small shared UI pieces: icons (Lucide-style strokes), avatars, tags, properties, callouts.

import { useState, type ReactNode } from "react";

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
  settings: (
    <>
      <circle cx="12" cy="12" r="3" />
      <path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z" />
    </>
  ),
  arrowUp: <path d="M12 19V5M5 12l7-7 7 7" />,
  arrowDown: <path d="M12 5v14M19 12l-7 7-7-7" />,
  arrowLeft: <path d="M19 12H5M12 19l-7-7 7-7" />,
  arrowRight: <path d="M5 12h14M12 5l7 7-7 7" />,
  compass: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="m15.5 8.5-2 5-5 2 2-5z" />
    </>
  ),
  pointer: <path d="M4 3l7 17 2.5-7.5L21 10z" />,
  globe: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M3 12h18M12 3a14 14 0 0 1 0 18M12 3a14 14 0 0 0 0 18" />
    </>
  ),
  list: <path d="M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01" />,
  terminal: <path d="m4 17 6-6-6-6M12 19h8" />,
  book: (
    <>
      <path d="M2 4h6a4 4 0 0 1 4 4v13a3 3 0 0 0-3-3H2z" />
      <path d="M22 4h-6a4 4 0 0 0-4 4v13a3 3 0 0 1 3-3h7z" />
    </>
  ),
};

/** Everything is drawn 10% larger than the nominal size (the whole UI is scaled up). */
const SCALE = 1.1;

export function Icon({ name, size = 16, className }: { name: keyof typeof PATHS | string; size?: number; className?: string }) {
  size = Math.round(size * SCALE);
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

export function Avatar({ name, size = 22 }: { name: string; seed?: string; size?: number }) {
  size = Math.round(size * SCALE);
  return (
    <span className="avatar" style={{ width: size, height: size, fontSize: size * 0.46 }}>
      {(name.trim()[0] ?? "?").toUpperCase()}
    </span>
  );
}

export type Tone = "gray" | "blue" | "green" | "orange" | "red" | "yellow" | "purple";
/** Pill badge. Green is the brand tone. */
export const Tag = ({ tone = "gray", children }: { tone?: Tone; children: ReactNode }) => (
  <span className={`badge tone-${tone}`}>{children}</span>
);

/** Page title row: title, optional badge, description and right-aligned actions. */
export function PageHeader({
  title,
  badge,
  description,
  actions,
}: {
  title: ReactNode;
  badge?: ReactNode;
  description?: ReactNode;
  actions?: ReactNode;
}) {
  return (
    <div className="page-header">
      <div>
        <div className="page-title-row">
          <h1 className="page-title">{title}</h1>
          {badge}
        </div>
        {description && <p className="page-desc">{description}</p>}
      </div>
      {actions && <div className="page-actions">{actions}</div>}
    </div>
  );
}

/** Bordered card with a header strip, a body and an optional footer of actions. */
export function Panel({
  title,
  description,
  actions,
  footer,
  flush,
  tour,
  children,
}: {
  /** Anchor for the guided tour. */
  tour?: string;
  title?: ReactNode;
  description?: ReactNode;
  actions?: ReactNode;
  footer?: ReactNode;
  /** Body without padding, for tables and lists. */
  flush?: boolean;
  children: ReactNode;
}) {
  return (
    <section className="panel" data-tour={tour}>
      {title && (
        <header className="panel-head">
          <div>
            <h2 className="panel-title">{title}</h2>
            {description && <p className="panel-desc">{description}</p>}
          </div>
          {actions && <div className="panel-actions">{actions}</div>}
        </header>
      )}
      <div className={flush ? "panel-body flush" : "panel-body"}>{children}</div>
      {footer && <footer className="panel-foot">{footer}</footer>}
    </section>
  );
}

/** Small metric card. */
export function Stat({ label, value, sub, icon }: { label: string; value: ReactNode; sub?: ReactNode; icon: string }) {
  return (
    <div className="stat">
      <div className="stat-label">
        <Icon name={icon} size={14} />
        {label}
      </div>
      <div className="stat-value">{value}</div>
      {sub && <div className="stat-sub">{sub}</div>}
    </div>
  );
}

/** Key/value rows inside a panel. */
export function Properties({ children }: { children: ReactNode }) {
  return <dl className="kv">{children}</dl>;
}
export function Prop({ label, children }: { icon?: string; label: string; children: ReactNode }) {
  return (
    <div className="kv-row">
      <dt>{label}</dt>
      <dd>{children}</dd>
    </div>
  );
}

/** Admonition box: icon, optional title, text, optional action on the right. */
export function Callout({
  icon = "info",
  tone = "gray",
  title,
  action,
  children,
}: {
  icon?: string;
  tone?: Tone;
  title?: ReactNode;
  action?: ReactNode;
  children?: ReactNode;
}) {
  return (
    <div className={`alert tone-${tone}`}>
      <span className="alert-icon">
        <Icon name={icon} size={16} />
      </span>
      <div className="alert-body">
        {title && <div className="alert-title">{title}</div>}
        {children && <div className="alert-text">{children}</div>}
      </div>
      {action && <div className="alert-action">{action}</div>}
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

export function CopyButton({ text, label = "Copy" }: { text: string; label?: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      className="btn tiny"
      onClick={() =>
        navigator.clipboard?.writeText(text).then(() => {
          setCopied(true);
          setTimeout(() => setCopied(false), 1400);
        })
      }
    >
      <Icon name={copied ? "check" : "copy"} size={12} />
      {copied ? "Copied" : label}
    </button>
  );
}
