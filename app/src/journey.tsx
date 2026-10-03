// Visual building blocks that make the flow readable at a glance: who does what (RoleTag),
// where you are in the whole journey (Journey), and the one thing to do next (NextStep).

import type { ReactNode } from "react";
import { ART } from "./art";
import { Icon } from "./ui";

export type Role = "staff" | "guest" | "anyone" | "outsider";

const ROLES: Record<Role, { label: string; icon: string }> = {
  staff: { label: "Staff", icon: "users" },
  guest: { label: "Guest", icon: "user" },
  anyone: { label: "Anyone", icon: "globe" },
  outsider: { label: "Outsider", icon: "store" },
};

/** Coloured tag that says which kind of person does a step. Same colours everywhere. */
export function RoleTag({ role, children }: { role: Role; children?: ReactNode }) {
  const r = ROLES[role];
  return (
    <span className={`role role-${role}`}>
      <Icon name={r.icon} size={12} />
      {children ?? r.label}
    </span>
  );
}

export const JOURNEY: { art: keyof typeof ART; title: string; role: Role }[] = [
  { art: "team", title: "Start a team", role: "staff" },
  { art: "jar", title: "Open a shift", role: "staff" },
  { art: "phone", title: "Guests tip", role: "guest" },
  { art: "clock", title: "Agree on hours", role: "staff" },
  { art: "split", title: "Pay out", role: "anyone" },
];

/** The whole life of the app in five pictures. `current` is 1-5; above 5 means everything is done. */
export function Journey({ current }: { current: number }) {
  return (
    <ol className="journey" aria-label="How Jar works">
      {JOURNEY.map((j, i) => {
        const n = i + 1;
        // current = 0: just explain the journey, nothing highlighted.
        const state = current === 0 ? "neutral" : n < current ? "done" : n === current ? "current" : "todo";
        return (
          <li key={j.title} className={`journey-step ${state}`}>
            <div className="journey-art">
              <img src={ART[j.art]} alt="" />
              {state === "done" && (
                <span className="journey-check">
                  <Icon name="check" size={11} />
                </span>
              )}
            </div>
            <div className="journey-n">
              {state === "current" ? "You are here" : state === "done" ? "Done" : `Step ${n}`}
            </div>
            <div className="journey-title">{j.title}</div>
            <RoleTag role={j.role} />
            {n < JOURNEY.length && <Icon name="arrowRight" size={14} className="journey-arrow" />}
          </li>
        );
      })}
    </ol>
  );
}

/** One big, illustrated card with the single next action. */
export function NextStep({
  art,
  eyebrow,
  title,
  text,
  role,
  action,
  tour,
}: {
  art: keyof typeof ART;
  eyebrow: string;
  title: string;
  text: string;
  role?: Role;
  action?: ReactNode;
  tour?: string;
}) {
  return (
    <section className="next-step" data-tour={tour}>
      <img className="next-art" src={ART[art]} alt="" />
      <div className="next-body">
        <div className="next-eyebrow">
          {eyebrow} {role && <RoleTag role={role} />}
        </div>
        <h2 className="next-title">{title}</h2>
        <p className="next-text">{text}</p>
      </div>
      {action && <div className="next-action">{action}</div>}
    </section>
  );
}
