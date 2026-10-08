"use client";

import { useCallback, useEffect, useId, useRef, type ReactNode } from "react";
import { X } from "lucide-react";
import { Button } from "@/components/ui";
import "./adminResources.css";

interface ResourceEditorDrawerProps {
  open: boolean;
  /** Id of the <form> rendered inside; the footer's save button submits it. */
  formId: string;
  title: string;
  subtitle?: string;
  submitLabel: string;
  saving: boolean;
  /** True while any other admin action is running (the save button waits). */
  submitDisabled?: boolean;
  /** Unsaved edits exist: closing asks first. */
  dirty: boolean;
  error?: string | null;
  onClose: () => void;
  children: ReactNode;
}

export const UNSAVED_CONFIRM_MESSAGE = "มีการแก้ไขที่ยังไม่ได้บันทึก ต้องการปิดโดยไม่บันทึกหรือไม่?";

const FOCUSABLE =
  'a[href], button:not(:disabled), input:not(:disabled):not([type="hidden"]), select:not(:disabled), textarea:not(:disabled), [tabindex]:not([tabindex="-1"])';

/**
 * The resource editor as a slide-over panel on the right (a full-screen sheet on a phone).
 * It is fixed to the viewport, so opening it from a row far down the list never needs a
 * scroll back to the top; the header and the save bar stay in view while the fields scroll.
 */
export function ResourceEditorDrawer({
  open,
  formId,
  title,
  subtitle,
  submitLabel,
  saving,
  submitDisabled = false,
  dirty,
  error,
  onClose,
  children,
}: ResourceEditorDrawerProps) {
  const panelRef = useRef<HTMLDivElement>(null);
  const titleId = useId();
  const errorId = useId();
  // The latest values, read inside the key handler without re-running the effect on every keystroke.
  const state = useRef({ dirty, saving, onClose });
  useEffect(() => {
    state.current = { dirty, saving, onClose };
  });

  const requestClose = useCallback(() => {
    const { dirty: isDirty, saving: isSaving, onClose: close } = state.current;
    if (isSaving) return;
    if (isDirty && !window.confirm(UNSAVED_CONFIRM_MESSAGE)) return;
    close();
  }, []);

  useEffect(() => {
    if (!open) return;
    const panel = panelRef.current;
    const opener = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const frame = window.requestAnimationFrame(() => {
      panel?.querySelector<HTMLElement>(`#${CSS.escape(formId)} input:not([type="hidden"]), #${CSS.escape(formId)} textarea`)?.focus();
    });

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        requestClose();
        return;
      }
      if (event.key !== "Tab" || !panel) return;
      const focusable = [...panel.querySelectorAll<HTMLElement>(FOCUSABLE)].filter((element) => element.getAttribute("aria-hidden") !== "true");
      if (focusable.length === 0) {
        event.preventDefault();
        panel.focus();
        return;
      }
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      const active = document.activeElement;
      if (event.shiftKey && (active === first || !panel.contains(active))) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && (active === last || !panel.contains(active))) {
        event.preventDefault();
        first.focus();
      }
    };

    document.addEventListener("keydown", onKeyDown);
    return () => {
      window.cancelAnimationFrame(frame);
      document.removeEventListener("keydown", onKeyDown);
      document.body.style.overflow = previousOverflow;
      if (opener?.isConnected) opener.focus();
    };
  }, [open, formId, requestClose]);

  if (!open) return null;

  return (
    <div className="kru-res-drawer-layer">
      <button type="button" className="kru-res-drawer-scrim" aria-label="ปิดแผงแก้ไข" tabIndex={-1} onClick={requestClose} />
      <div
        ref={panelRef}
        tabIndex={-1}
        className="kru-res-drawer"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={error ? errorId : undefined}
      >
        <header className="kru-res-drawer__header">
          <div className="kru-res-drawer__heading">
            <h2 id={titleId}>{title}</h2>
            {subtitle ? <p title={subtitle}>{subtitle}</p> : null}
          </div>
          <button type="button" className="kru-res-drawer__close" aria-label="ปิดแผงแก้ไข" onClick={requestClose} disabled={saving}>
            <X size={22} aria-hidden="true" />
          </button>
        </header>
        <div className="kru-res-drawer__body">{children}</div>
        <footer className="kru-res-drawer__footer">
          {error ? (
            <p id={errorId} role="alert" className="kru-res-drawer__error">
              {error}
            </p>
          ) : null}
          <div className="kru-res-drawer__actions">
            {dirty && !saving ? <span className="kru-res-drawer__dirty">มีการแก้ไขที่ยังไม่ได้บันทึก</span> : <span />}
            <Button type="button" variant="ghost" onClick={requestClose} disabled={saving}>
              ยกเลิก
            </Button>
            <Button type="submit" form={formId} loading={saving} disabled={submitDisabled}>
              {submitLabel}
            </Button>
          </div>
        </footer>
      </div>
    </div>
  );
}
