"use client";

import { useEffect, useId, useRef, useState } from "react";
import { Eye, LogOut, Menu, X } from "lucide-react";
import { Button, SideNav, type SideNavGroup } from "@/components/ui";

interface AdminMobileNavProps {
  groups: SideNavGroup[];
  value: string;
  disabled?: boolean;
  onChange: (key: string) => void;
  onMemberPreview: () => void;
  onSignOut: () => void;
}

export function AdminMobileNav({ groups, value, disabled, onChange, onMemberPreview, onSignOut }: AdminMobileNavProps) {
  const [open, setOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const titleId = useId();
  const currentLabel = groups.flatMap((group) => group.items).find((item) => item.key === value)?.label ?? "หลังบ้าน";

  const close = () => setOpen(false);

  useEffect(() => {
    if (!open) return;
    const previousOverflow = document.body.style.overflow;
    const trigger = triggerRef.current;
    document.body.style.overflow = "hidden";
    const panel = panelRef.current;
    const first = panel?.querySelector<HTMLElement>("button:not(:disabled), a[href]");
    first?.focus();

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        close();
        return;
      }
      if (event.key !== "Tab" || !panel) return;
      const focusable = [...panel.querySelectorAll<HTMLElement>("button:not(:disabled), a[href], select:not(:disabled), input:not(:disabled)")];
      if (focusable.length === 0) return;
      const firstItem = focusable[0];
      const lastItem = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === firstItem) {
        event.preventDefault();
        lastItem.focus();
      } else if (!event.shiftKey && document.activeElement === lastItem) {
        event.preventDefault();
        firstItem.focus();
      }
    };

    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      document.body.style.overflow = previousOverflow;
      trigger?.focus();
    };
  }, [open]);

  return (
    <>
      <header className="kru-admin-mobile-header">
        <button
          ref={triggerRef}
          type="button"
          className="kru-admin-menu-trigger"
          aria-label="เปิดเมนูหลังบ้าน"
          aria-haspopup="dialog"
          aria-expanded={open}
          onClick={() => setOpen(true)}
          disabled={disabled}
        >
          <Menu size={22} aria-hidden="true" />
        </button>
        <strong>{currentLabel}</strong>
        <Button size="sm" variant="soft" icon={Eye} onClick={onMemberPreview} disabled={disabled}>
          หน้าสมาชิก
        </Button>
      </header>

      {open && (
        <div className="kru-admin-drawer-layer">
          <button type="button" className="kru-admin-drawer-scrim" aria-label="ปิดเมนูหลังบ้าน" onClick={close} />
          <div ref={panelRef} className="kru-admin-drawer" role="dialog" aria-modal="true" aria-labelledby={titleId}>
            <div className="kru-admin-drawer__header">
              <strong id={titleId}>เมนูหลังบ้าน</strong>
              <button type="button" className="kru-admin-drawer__close" aria-label="ปิดเมนูหลังบ้าน" onClick={close}>
                <X size={22} aria-hidden="true" />
              </button>
            </div>
            <div className="kru-admin-drawer__nav">
              <SideNav
                groups={groups}
                value={value}
                onChange={(key) => {
                  onChange(key);
                  close();
                }}
              />
            </div>
            <div className="kru-admin-drawer__footer">
              <Button block variant="soft" icon={Eye} onClick={() => { close(); onMemberPreview(); }} disabled={disabled}>
                ดูหน้าสมาชิก
              </Button>
              <Button block variant="ghost" icon={LogOut} onClick={() => { close(); onSignOut(); }} disabled={disabled}>
                ออกจากระบบ
              </Button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
