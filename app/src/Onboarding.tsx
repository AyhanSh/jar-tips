// First-visit walkthrough: what Napiwek does and how to run a shift, one step per screen.
// Shown once per browser; the "How it works" button in the top bar reopens it.

import { useCallback, useEffect, useState } from "react";
import { Icon } from "./ui";

const SEEN = "napiwek.onboarded.v1";

interface Step {
  art: string;
  eyebrow: string;
  title: string;
  body: string;
  tip?: string;
}

const STEPS: Step[] = [
  {
    art: "jar",
    eyebrow: "Welcome",
    title: "A tip jar the owner can't open",
    body: "Card and QR tips usually land in the restaurant's account, and staff have to trust the owner to pass them on. In Napiwek, tips go into a vault that only a Solana program controls, and it only ever pays the team.",
    tip: "Takes about a minute. Use the arrow keys to move through it.",
  },
  {
    art: "wallets",
    eyebrow: "Before you start",
    title: "One laptop plays every role",
    body: "Your connected wallet is the owner. Ana, Ben and Kasia (staff) and a Guest are demo wallets stored in this browser. Choose who signs each action from the menu at the top right.",
    tip: "First time? Press Fund demo wallets on the Overview page so everyone has devnet SOL.",
  },
  {
    art: "store",
    eyebrow: "Step 1 · Owner",
    title: "Open a shift",
    body: "Name the shift and list who's working. This creates the tip vault and a QR code. It's the owner's last say over the money: from here on they can't withdraw, edit hours or remove anyone.",
  },
  {
    art: "phone",
    eyebrow: "Step 2 · Guests",
    title: "Guests tip by QR",
    body: "A guest scans the code, picks 5, 10 or 20 USDC and pays. The money moves from their wallet straight into the shift's vault. The restaurant never touches it.",
  },
  {
    art: "clock",
    eyebrow: "Step 3 · Staff",
    title: "Everyone enters their hours, then agrees",
    body: "After the shift, each person enters only their own hours. Then they check the team table and press I agree. If anyone changes a number, every agreement resets.",
  },
  {
    art: "split",
    eyebrow: "Step 4 · Anyone",
    title: "Pay everyone out",
    body: "Once more than half the team agrees, anyone can press Pay out and the pot is split by hours. If nobody agrees in time, anyone can split it equally. The money can never get stuck.",
  },
  {
    art: "shield",
    eyebrow: "Try to break it",
    title: "Play the greedy owner",
    body: "Sign as the owner, open Your actions on a shift and run the security test. Both theft attempts are real transactions, and Solana rejects them. Open them on Explorer to see the error.",
    tip: "This is the moment to show judges: the middleman is gone, enforced by code.",
  },
];

export const ART: Record<string, string> = {
  jar: "/icons/jar.png",
  store: "/icons/store.png",
  phone: "/icons/phone.png",
  clock: "/icons/clock.png",
  team: "/icons/team.png",
  split: "/icons/split.png",
  shield: "/icons/shield.png",
  wallets: "/icons/wallets.png",
};

export function useOnboarding() {
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
  return { open, show: () => setOpen(true), close };
}

export function Onboarding({ onClose }: { onClose: () => void }) {
  const [i, setI] = useState(0);
  const step = STEPS[i];
  const last = i === STEPS.length - 1;

  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
      if (e.key === "ArrowRight") setI((n) => Math.min(n + 1, STEPS.length - 1));
      if (e.key === "ArrowLeft") setI((n) => Math.max(n - 1, 0));
    };
    window.addEventListener("keydown", key);
    return () => window.removeEventListener("keydown", key);
  }, [onClose]);

  const finish = () => {
    onClose();
    window.location.hash = "/";
  };

  return (
    <div className="modal-backdrop" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal" role="dialog" aria-modal="true" aria-labelledby="onb-title">
        <button className="icon-btn modal-close" onClick={onClose} aria-label="Close">
          <Icon name="x" size={16} />
        </button>
        <div className="onb-art" key={step.art}>
          <div className="onb-glow" />
          <img src={ART[step.art]} alt="" />
        </div>
        <div className="onb-body" key={i}>
          <div className="onb-eyebrow">{step.eyebrow}</div>
          <h2 id="onb-title" className="onb-title">
            {step.title}
          </h2>
          <p className="onb-text">{step.body}</p>
          {step.tip && (
            <p className="onb-tip">
              <Icon name="info" size={14} />
              {step.tip}
            </p>
          )}
        </div>
        <div className="onb-foot">
          <div className="onb-dots" role="tablist" aria-label="Steps">
            {STEPS.map((s, n) => (
              <button
                key={s.title}
                role="tab"
                aria-selected={n === i}
                aria-label={`Step ${n + 1}`}
                className={`onb-dot ${n === i ? "on" : ""} ${n < i ? "done" : ""}`}
                onClick={() => setI(n)}
              />
            ))}
          </div>
          <div className="onb-actions">
            {i === 0 ? (
              <button className="btn ghost" onClick={onClose}>
                Skip
              </button>
            ) : (
              <button className="btn" onClick={() => setI(i - 1)}>
                Back
              </button>
            )}
            <button className="btn primary" onClick={() => (last ? finish() : setI(i + 1))} autoFocus>
              {last ? "Get started" : "Next"}
              {!last && <Icon name="chevronRight" size={14} />}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
