import { WORKFLOW } from "@/lib/workflow";
import { cx } from "./ui";

/** current = index being waited on (earlier steps done). counts = live records waiting at each step. */
export function Stepper({ current, counts, compact, skip = [] }: { current?: number; counts?: number[]; compact?: boolean; skip?: number[] }) {
  return (
    <ol className={cx("grid gap-2", compact ? "grid-cols-3 sm:grid-cols-9" : "grid-cols-1 sm:grid-cols-3 lg:grid-cols-9")} aria-label="Workflow">
      {WORKFLOW.map((s, i) => {
        const skipped = skip.includes(i);
        const done = current !== undefined && i < current && !skipped;
        const active = current === i;
        return (
          <li key={s.key} aria-current={active ? "step" : undefined} className={cx("cs-card relative p-3 transition", active && "cs-active-step", done && "bg-ok", skipped && "opacity-40")} style={{ boxShadow: active ? undefined : "none" }}>
            <div className="flex items-center gap-2">
              <span className={cx("grid size-6 shrink-0 place-items-center rounded-full text-[11px] font-bold", done ? "bg-[var(--ok)] text-white" : active ? "btn-primary" : "border border-line text-mut")}>{done ? "✓" : i + 1}</span>
              {counts && counts[i] > 0 && <span className="ml-auto rounded-full bg-[var(--navy)] px-2 text-[11px] font-bold text-white" aria-label={`${counts[i]} waiting`}>{counts[i]}</span>}
            </div>
            <div className="mt-2 text-[13px] font-bold leading-tight">{s.label}</div>
            {!compact && <div className="mt-0.5 text-[11px] text-mut">{skipped ? "not used here" : s.hint}</div>}
          </li>
        );
      })}
    </ol>
  );
}
