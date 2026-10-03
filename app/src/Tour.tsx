// Guided spotlight tour. The page is dimmed except for the one control to use next;
// a card and a bouncing arrow say what it does. Steps follow the real demo flow
// across pages: the user clicks the lit control, or presses Next to have it clicked.

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { ART } from "./art";
import { Icon, Spinner } from "./ui";

const SEEN = "napiwek.tour.v1";

interface Step {
  /** CSS selector of the element to light up; none = centered card. */
  target?: string;
  art?: keyof typeof ART;
  title: string;
  text: string;
  /** "click": the step is about pressing the lit control (Next presses it). */
  action?: "click";
  /** Skip silently when the target isn't on the page (e.g. venue already exists). */
  optional?: boolean;
  /** How long to wait for the target to appear, e.g. while a transaction confirms. */
  wait?: number;
}

const STEPS: Step[] = [
  { art: "jar", title: "Tips the owner can't touch", text: "A 60-second walk through one shift. Follow the light." },
  { target: '[data-tour="signer"]', art: "wallets", title: "Who's acting", text: "Owner, staff or guest. Switch here any time." },
  { target: '[data-tour="nav-venue"]', art: "store", title: "Your venue", text: "Open it.", action: "click" },
  { target: '[data-tour="create-venue"]', art: "store", title: "Create the venue", text: "Once per owner. Gives no access to tips.", action: "click", optional: true, wait: 1500 },
  { target: '[data-tour="new-shift"]', art: "store", title: "New shift", text: "Start a shift to get a tip vault.", action: "click", wait: 60000 },
  { target: '[data-tour="demo-crew"]', art: "team", title: "Who's working", text: "Fill in the demo crew.", action: "click" },
  { target: '[data-tour="open-shift"]', art: "jar", title: "Open the shift", text: "Creates the vault. The owner's last say.", action: "click" },
  { target: '[data-tour="stats"]', art: "split", title: "Live shift", text: "Vault, agreement and time, straight from the chain.", wait: 90000 },
  { target: '[data-tour="tip-link"]', art: "phone", title: "Guests tip here", text: "Scan or open. Money goes straight into the vault." },
  { target: '[data-tour="team"]', art: "split", title: "Fair split", text: "Shares follow the hours, live." },
  { target: '[data-tour="your-actions"]', art: "clock", title: "Your buttons", text: "Sign as Ana, Ben or Kasia: enter hours, press I agree." },
  { target: '[data-tour="security"]', art: "shield", title: "Try to steal", text: "As owner, both attempts reach Solana and fail.", optional: true, wait: 1500 },
  { art: "split", title: "Pay out", text: "When most agree, Pay out appears. Anyone can press it." },
];

export function useTour() {
  const [open, setOpen] = useState(() => {
    try {
      return !localStorage.getItem(SEEN);
    } catch {
      return false;
    }
  });
  const close = useCallback(() => {
    setOpen(false);
    try {
      localStorage.setItem(SEEN, "1");
    } catch {
      /* shown again next visit */
    }
  }, []);
  return { open, start: () => setOpen(true), close };
}

const PAD = 8;
/** The arrow bounces toward the target. */
const nudge = (x: number, y: number) => ({ "--nx": `${x}px`, "--ny": `${y}px` }) as React.CSSProperties;
const CARD_W = 330;

export function Tour({ onClose }: { onClose: () => void }) {
  const [i, setI] = useState(0);
  const [rect, setRect] = useState<DOMRect | null>(null);
  const [missing, setMissing] = useState(false);
  const [cardH, setCardH] = useState(180);
  const cardRef = useRef<HTMLDivElement>(null);
  const elRef = useRef<Element | null>(null);
  const dir = useRef(1);
  const step = STEPS[i];
  const last = i === STEPS.length - 1;

  const go = useCallback(
    (n: number) => {
      if (n >= STEPS.length) return onClose();
      dir.current = n >= i ? 1 : -1;
      setI(Math.max(0, n));
    },
    [i, onClose],
  );

  // Find the target (it may appear later: a page load or a confirming transaction), then follow it.
  useEffect(() => {
    setRect(null);
    setMissing(false);
    elRef.current = null;
    if (!step.target) return;
    let alive = true;
    let raf = 0;
    const started = Date.now();
    const visible = (el: Element | null) => !!el && el.getBoundingClientRect().width > 0;

    const track = () => {
      if (!alive) return;
      const el = elRef.current;
      if (!el || !el.isConnected) {
        elRef.current = null;
        return find();
      }
      setRect(el.getBoundingClientRect());
      raf = requestAnimationFrame(track);
    };
    const find = () => {
      if (!alive) return;
      const el = document.querySelector(step.target!);
      if (visible(el)) {
        elRef.current = el;
        el!.scrollIntoView({ block: "center", behavior: "smooth" });
        track();
      } else if (Date.now() - started > (step.wait ?? 4000)) {
        if (step.optional) setI((n) => Math.min(n + dir.current, STEPS.length - 1));
        else setMissing(true);
      } else {
        setTimeout(find, 150);
      }
    };
    find();
    return () => {
      alive = false;
      cancelAnimationFrame(raf);
    };
  }, [i, step.target, step.wait, step.optional]);

  // Clicking the lit control moves the tour on.
  useEffect(() => {
    const el = elRef.current;
    if (!el || step.action !== "click") return;
    const onClick = () => setTimeout(() => go(i + 1), 60);
    el.addEventListener("click", onClick);
    return () => el.removeEventListener("click", onClick);
  }, [rect !== null, i]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", key);
    return () => window.removeEventListener("keydown", key);
  }, [onClose]);

  useLayoutEffect(() => {
    if (cardRef.current) setCardH(cardRef.current.offsetHeight);
  });

  const next = () => {
    if (step.action === "click" && elRef.current) (elRef.current as HTMLElement).click();
    else go(i + 1);
  };

  const vw = window.innerWidth;
  const vh = window.innerHeight;
  const centered = !step.target || missing || !rect;
  const searching = !!step.target && !rect && !missing;

  // Place the card below, above, right or left of the target, whichever fits.
  let card: React.CSSProperties = {};
  let arrow: { style: React.CSSProperties; icon: string } | null = null;
  let hole: { top: number; left: number; width: number; height: number } | null = null;
  if (!centered && rect) {
    hole = { top: rect.top - PAD, left: rect.left - PAD, width: rect.width + PAD * 2, height: rect.height + PAD * 2 };
    const gap = 54;
    const clampX = (x: number) => Math.max(12, Math.min(x, vw - CARD_W - 12));
    const clampY = (y: number) => Math.max(12, Math.min(y, vh - cardH - 12));
    const cx = rect.left + rect.width / 2;
    const cy = rect.top + rect.height / 2;
    if (rect.bottom + gap + cardH < vh) {
      card = { top: rect.bottom + gap, left: clampX(cx - CARD_W / 2) };
      arrow = { icon: "arrowUp", style: { top: rect.bottom + 12, left: cx - 14, ...nudge(0, -6) } };
    } else if (rect.top - gap - cardH > 0) {
      card = { top: rect.top - gap - cardH, left: clampX(cx - CARD_W / 2) };
      arrow = { icon: "arrowDown", style: { top: rect.top - 40, left: cx - 14, ...nudge(0, 6) } };
    } else if (rect.right + gap + CARD_W < vw) {
      card = { top: clampY(cy - cardH / 2), left: rect.right + gap };
      arrow = { icon: "arrowLeft", style: { top: cy - 14, left: rect.right + 12, ...nudge(-6, 0) } };
    } else {
      card = { top: clampY(cy - cardH / 2), left: Math.max(12, rect.left - gap - CARD_W) };
      arrow = { icon: "arrowRight", style: { top: cy - 14, left: rect.left - 40, ...nudge(6, 0) } };
    }
  }

  return (
    <div className="tour" role="dialog" aria-modal="true" aria-label="Guided tour">
      {hole ? (
        <>
          {/* four click blockers around the hole; the hole itself stays clickable */}
          <div className="tour-block" style={{ top: 0, left: 0, right: 0, height: Math.max(0, hole.top) }} />
          <div className="tour-block" style={{ top: hole.top + hole.height, left: 0, right: 0, bottom: 0 }} />
          <div className="tour-block" style={{ top: hole.top, left: 0, width: Math.max(0, hole.left), height: hole.height }} />
          <div className="tour-block" style={{ top: hole.top, left: hole.left + hole.width, right: 0, height: hole.height }} />
          <div className={`tour-hole ${step.action === "click" ? "pulse" : ""}`} style={hole} />
          {arrow && (
            <div className="tour-arrow" style={arrow.style}>
              <Icon name={arrow.icon} size={28} />
            </div>
          )}
        </>
      ) : (
        <div className="tour-dim" />
      )}

      <div
        ref={cardRef}
        className={`tour-card ${centered ? "center" : ""}`}
        style={centered ? undefined : { ...card, width: CARD_W }}
        key={i}
      >
        <div className="tour-head">
          {step.art && <img src={ART[step.art]} alt="" />}
          <div>
            <div className="tour-count">
              {i + 1} / {STEPS.length}
            </div>
            <div className="tour-title">{step.title}</div>
          </div>
          <button className="icon-btn small tour-x" onClick={onClose} aria-label="Close tour">
            <Icon name="x" size={14} />
          </button>
        </div>
        <p className="tour-text">
          {missing ? "This part isn't on screen yet. Continue, or come back to it later." : step.text}
        </p>
        {searching && (
          <div className="tour-hint">
            <Spinner /> Waiting for it to appear…
          </div>
        )}
        {step.action === "click" && !centered && (
          <div className="tour-hint">
            <Icon name="pointer" size={13} /> Click the highlighted button
          </div>
        )}
        <div className="tour-foot">
          <div className="tour-bar">
            <span style={{ width: `${((i + 1) / STEPS.length) * 100}%` }} />
          </div>
          {i > 0 && (
            <button className="btn tiny" onClick={() => go(i - 1)}>
              <Icon name="arrowLeft" size={12} />
            </button>
          )}
          <button className="btn primary tiny" onClick={missing ? () => go(i + 1) : next}>
            {last ? "Done" : step.action === "click" && !centered ? "Do it" : "Next"}
            {!last && <Icon name="arrowRight" size={12} />}
          </button>
        </div>
      </div>
    </div>
  );
}
