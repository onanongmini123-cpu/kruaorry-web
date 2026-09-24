"use client";

import { useEffect, useRef, useState } from "react";
import { MessageCircle, MessagesSquare, X } from "lucide-react";
import { LINE_OA_URL, MESSENGER_URL } from "@/lib/config";

export function MemberContactMenu() {
  const [open, setOpen] = useState(false);
  const firstLinkRef = useRef<HTMLAnchorElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) return;
    firstLinkRef.current?.focus();
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setOpen(false);
        triggerRef.current?.focus();
      }
    };
    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, [open]);

  return (
    <div className="kru-contact-fab">
      {open && (
        <div id="member-contact-menu" role="dialog" aria-label="ช่องทางติดต่อแอดมิน" className="kru-contact-fab__menu">
          <div>
            <strong>ติดต่อทีมงาน</strong>
            <p>เลือกช่องทางที่สะดวกได้เลยค่ะ</p>
          </div>
          <a
            ref={firstLinkRef}
            href={LINE_OA_URL}
            target="_blank"
            rel="noopener noreferrer"
            referrerPolicy="no-referrer"
            className="kru-contact-fab__link"
          >
            <MessageCircle size={19} aria-hidden="true" />
            LINE Official Account
          </a>
          <a
            href={MESSENGER_URL}
            target="_blank"
            rel="noopener noreferrer"
            referrerPolicy="no-referrer"
            className="kru-contact-fab__link"
          >
            <MessagesSquare size={19} aria-hidden="true" />
            Messenger
          </a>
        </div>
      )}
      <button
        ref={triggerRef}
        type="button"
        className="kru-contact-fab__trigger"
        aria-label={open ? "ปิดเมนูติดต่อแอดมิน" : "ติดต่อแอดมิน"}
        aria-expanded={open}
        aria-haspopup="dialog"
        aria-controls="member-contact-menu"
        onClick={() => setOpen((current) => !current)}
      >
        {open ? <X size={22} aria-hidden="true" /> : <MessageCircle size={22} aria-hidden="true" />}
        <span>{open ? "ปิด" : "ติดต่อแอดมิน"}</span>
      </button>
    </div>
  );
}
