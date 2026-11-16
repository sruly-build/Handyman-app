import { useState, type ReactNode } from "react";
import { ChevronIcon } from "./Icons";

const KEY = "open-sections";
function readOpen(): string[] {
  try {
    return JSON.parse(localStorage.getItem(KEY) ?? "[]") as string[];
  } catch {
    return [];
  }
}

/**
 * A section that stays folded up (one tidy row with a short summary) until
 * tapped. The app remembers which ones were left open. Put several in a
 * <FoldList> to show them as one tidy card.
 */
export function Fold({
  id,
  icon,
  tint,
  title,
  summary,
  children,
}: {
  /** Remembers open/closed under this name */
  id: string;
  icon: ReactNode;
  /** Colours for the icon bubble, e.g. "bg-sky-soft text-sky" */
  tint: string;
  title: string;
  summary?: ReactNode;
  children: ReactNode;
}) {
  const [open, setOpen] = useState(() => readOpen().includes(id));
  const toggle = () => {
    const next = !open;
    setOpen(next);
    try {
      const all = readOpen().filter((x) => x !== id);
      localStorage.setItem(KEY, JSON.stringify(next ? [...all, id] : all));
    } catch {
      // only a convenience
    }
  };
  return (
    <section>
      <button
        type="button"
        onClick={toggle}
        aria-expanded={open}
        className="flex min-h-[52px] w-full items-center gap-3 px-3 text-left active:opacity-70"
      >
        <span
          className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-xl ${tint}`}
        >
          {icon}
        </span>
        <span className="shrink-0 text-[16px] font-semibold">{title}</span>
        <span className="min-w-0 flex-1 truncate text-right text-[14px] text-muted">
          {summary}
        </span>
        <ChevronIcon
          size={16}
          className={`shrink-0 text-[#b0b0b8] transition-transform ${open ? "rotate-90" : ""}`}
        />
      </button>
      {open && (
        <div className="border-t border-hairline bg-canvas/60 p-2.5">
          {children}
        </div>
      )}
    </section>
  );
}

/** Folds stacked in one card, with thin lines between them */
export function FoldList({ children }: { children: ReactNode }) {
  return (
    <div className="divide-y divide-hairline overflow-hidden rounded-2xl bg-card shadow-[0_1px_2px_rgba(15,23,42,0.06)] ring-1 ring-black/[0.04]">
      {children}
    </div>
  );
}
