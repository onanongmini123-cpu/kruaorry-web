import type { ReactNode } from "react";
import { SlidersHorizontal, X } from "lucide-react";
import "./FilterSheet.css";

interface FilterSheetProps {
  /** Unique id for the popover; ties the buttons to the panel. */
  id: string;
  /** Number of filters currently narrowing the list, shown on the button. */
  activeCount?: number;
  title?: string;
  children: ReactNode;
}

/**
 * Filters that take no room on a phone: a button opens them as a bottom sheet
 * (the browser's native popover, so no script is needed and Esc/outside tap
 * close it). From tablet width up the same fields are simply shown inline, and
 * where popovers are unsupported they are always shown inline.
 */
export function FilterSheet({ id, activeCount = 0, title = "ตัวกรอง", children }: FilterSheetProps) {
  return (
    <div className="kru-filter-sheet">
      <button
        type="button"
        className="kru-btn kru-btn--secondary kru-filter-sheet__toggle"
        popoverTarget={id}
        popoverTargetAction="toggle"
      >
        <SlidersHorizontal size={18} aria-hidden="true" />
        {title}
        {activeCount > 0 && <span className="kru-filter-sheet__count" aria-label={`${activeCount} ตัวกรองที่ใช้อยู่`}>{activeCount}</span>}
      </button>
      <div id={id} popover="auto" className="kru-filter-sheet__panel" role="group" aria-label={title}>
        <div className="kru-filter-sheet__header">
          <strong>{title}</strong>
          <button
            type="button"
            className="kru-filter-sheet__close"
            popoverTarget={id}
            popoverTargetAction="hide"
            aria-label="ปิดตัวกรอง"
          >
            <X size={20} aria-hidden="true" />
          </button>
        </div>
        <div className="kru-filter-sheet__body">{children}</div>
      </div>
    </div>
  );
}
