"use client";

import React, { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { House, FolderOpen, IdCard, LogOut, ArrowLeft, Bookmark, ShieldCheck, MessageSquareText, MessageCircle } from "lucide-react";
import { Mascot } from "@/components/Mascot";
import { Button, Input, SearchField, SideNav, ResourceCard, FilterChips, EmptyState, Badge, type SideNavGroup } from "@/components/ui";
import { createClient } from "@/lib/supabase/client";
import { PAYMENT_LINE_ID } from "@/lib/config";
import {
  fetchPublishedResources,
  fetchPlans,
  fetchProfile,
  fetchRequests,
  submitRequest,
  fetchSavedResourceIds,
  setResourceSaved,
  fetchUpgradeRequests,
  submitUpgradeRequest,
  resourceIcon,
  resourceTint,
  type Resource,
  type Plan,
  type Profile,
  type TeacherRequest,
  type UpgradeRequest,
} from "@/lib/data";
import { canAccessResource } from "@/lib/entitlement";
import { openDownloadInNewTab } from "@/lib/downloadWindow";

export const dynamic = "force-dynamic";

type View = "home" | "library" | "detail" | "plans" | "requests";

const NAV_GROUPS: SideNavGroup[] = [
  {
    items: [
      { key: "home", label: "หน้าแรก", icon: House },
      { key: "library", label: "คลังสื่อ", icon: FolderOpen },
      { key: "requests", label: "เสนอไอเดีย", icon: MessageSquareText },
      { key: "plans", label: "แพ็กเกจ", icon: IdCard },
    ],
  },
];

const REQUEST_STATUS_LABEL: Record<TeacherRequest["status"], string> = { pending: "รอพิจารณา", in_progress: "กำลังผลิต", done: "เสร็จแล้ว" };
const REQUEST_STATUS_TONE: Record<TeacherRequest["status"], "warning" | "info" | "success"> = { pending: "warning", in_progress: "info", done: "success" };

export default function TeacherAppPage() {
  const router = useRouter();
  const supabase = useMemo(() => createClient(), []);
  const [loading, setLoading] = useState(true);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [resources, setResources] = useState<Resource[]>([]);
  const [plans, setPlans] = useState<Plan[]>([]);
  const [view, setView] = useState<View>("home");
  const [detailId, setDetailId] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [categories, setCategories] = useState<string[]>([]);
  const [saved, setSaved] = useState<string[]>([]);
  const [userId, setUserId] = useState<string | null>(null);
  const [requests, setRequests] = useState<TeacherRequest[]>([]);
  const [newRequestTitle, setNewRequestTitle] = useState("");
  const [submittingRequest, setSubmittingRequest] = useState(false);
  const [requestError, setRequestError] = useState<string | null>(null);
  const [upgradeRequests, setUpgradeRequests] = useState<UpgradeRequest[]>([]);
  const [submittingUpgradePlanId, setSubmittingUpgradePlanId] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) {
        router.push("/login");
        return;
      }
      setUserId(user.id);
      const [profileData, resourceData, planData, requestData, savedIds, upgradeData] = await Promise.all([
        fetchProfile(supabase, user.id),
        fetchPublishedResources(supabase),
        fetchPlans(supabase),
        fetchRequests(supabase),
        fetchSavedResourceIds(supabase, user.id),
        fetchUpgradeRequests(supabase, user.id),
      ]);
      setProfile(profileData);
      setResources(resourceData);
      setPlans(planData);
      setRequests(requestData);
      setSaved(savedIds);
      setUpgradeRequests(upgradeData);
      setLoading(false);
    })();
  }, [supabase, router]);

  const handleRequestUpgrade = async (planId: string) => {
    if (!userId) return;
    setSubmittingUpgradePlanId(planId);
    const errorMessage = await submitUpgradeRequest(supabase, userId, planId);
    setSubmittingUpgradePlanId(null);
    if (errorMessage) {
      window.alert(`ส่งคำขอไม่สำเร็จ: ${errorMessage}`);
      return;
    }
    setUpgradeRequests(await fetchUpgradeRequests(supabase, userId));
  };

  const handleSubmitRequest = async (e: React.FormEvent) => {
    e.preventDefault();
    setRequestError(null);
    if (!newRequestTitle.trim() || !userId) return;
    setSubmittingRequest(true);
    const errorMessage = await submitRequest(supabase, userId, newRequestTitle);
    setSubmittingRequest(false);
    if (errorMessage) {
      setRequestError(errorMessage);
      return;
    }
    setNewRequestTitle("");
    setRequests(await fetchRequests(supabase));
  };

  const categoryOptions = useMemo(() => {
    const seen = new Map<string, string>();
    resources.forEach((r) => {
      if (r.category) seen.set(r.category, r.category);
    });
    return Array.from(seen.entries()).map(([value, label]) => ({ value, label }));
  }, [resources]);

  const toggleSaved = (id: string) => {
    if (!userId) return;
    const nowSaved = !saved.includes(id);
    setSaved((prev) => (nowSaved ? [...prev, id] : prev.filter((s) => s !== id)));
    setResourceSaved(supabase, userId, id, nowSaved);
  };

  const openDetail = (r: Resource) => {
    setDetailId(r.id);
    setView("detail");
  };

  // Every published resource fetched by fetchPublishedResources already has
  // status "published", so it's hardcoded here rather than carried on Resource.
  const canAccess = (r: Resource) => canAccessResource({ status: "published", isFree: r.free }, profile && { plan: profile.plan, role: profile.role });

  const openResource = (r: Resource) => {
    if (!canAccess(r)) {
      setView("plans");
      return;
    }
    if (r.affordance === "file_download" && r.filePath) {
      // The URL is same-origin and known synchronously, so window.open()
      // happens immediately inside this click handler — no async gap, so
      // no risk of a blank tab left hanging (see downloadWindow.ts for why
      // that used to happen). This targets /download/[id] rather than the
      // API route directly: that page fetches the file as a Blob (the API
      // route itself is unchanged, still doing all the async entitlement
      // + signing work and redirecting) and closes its own tab once the
      // whole file is in hand — see triggerBlobDownload.ts for why that's
      // the deterministic point to do it from, and why a plain redirect
      // straight to the file can't reliably self-close a tab at all.
      const target = `/download/${r.id}${r.fileName ? `?name=${encodeURIComponent(r.fileName)}` : ""}`;
      const result = openDownloadInNewTab(target, {
        open: (url, tab) => window.open(url, tab),
        assign: (url) => window.location.assign(url),
      });
      if (result.outcome === "failed") {
        // The real cause (never the URL itself — it's our own same-origin
        // route, not a signed URL) is logged structured, not swallowed.
        console.error("[download] could not open or navigate to the download route", { openError: result.openError, assignError: result.assignError });
        window.alert("ดาวน์โหลดไฟล์ไม่สำเร็จ กรุณาลองใหม่อีกครั้ง");
      }
      return;
    }
    if (r.ctaUrl) window.open(r.ctaUrl, "_blank", "noopener,noreferrer");
  };

  const handleSignOut = async () => {
    await supabase.auth.signOut();
    router.push("/");
    router.refresh();
  };

  const detail = resources.find((r) => r.id === detailId) || null;

  const filtered = resources.filter((r) => {
    const matchesSearch = !query.trim() || r.title.toLowerCase().includes(query.toLowerCase());
    const matchesCategory = categories.length === 0 || (r.category ? categories.includes(r.category) : false);
    return matchesSearch && matchesCategory;
  });

  if (loading) {
    return (
      <div style={{ minHeight: "100vh", display: "grid", placeItems: "center" }}>
        <span className="kru-spin" aria-hidden="true" style={{ width: 28, height: 28, borderRadius: 999, border: "3px solid var(--border-subtle)", borderTopColor: "var(--brand)" }} />
      </div>
    );
  }

  const initials = (profile?.fullName || profile?.email || "ค").slice(0, 2);

  return (
    <div style={{ minHeight: "100vh" }}>
      <div className="kru-app-shell">
        <aside className="kru-app-sidebar">
          <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "0 6px var(--sp-6)" }}>
            <Mascot size={36} />
            <span style={{ fontFamily: "var(--font-display)", fontWeight: "var(--fw-bold)", fontSize: "var(--fs-20)", color: "var(--text-strong)" }}>KruAorry</span>
          </div>
          <div style={{ flex: 1, overflowY: "auto" }}>
            <SideNav groups={NAV_GROUPS} value={view === "detail" ? "library" : view} onChange={(k) => setView(k as View)} />
          </div>
          {(profile?.role === "admin" || profile?.role === "owner") && (
            <Button size="sm" block variant="soft" icon={ShieldCheck} onClick={() => router.push("/admin")} style={{ marginTop: "var(--sp-4)" }}>
              ไปที่หลังบ้านแอดมิน
            </Button>
          )}
          <Button size="sm" block variant="ghost" icon={LogOut} onClick={handleSignOut} style={{ marginTop: "var(--sp-4)" }}>
            ออกจากระบบ
          </Button>
        </aside>

        <div className="kru-app-main">
          <header className="kru-app-header">
            <SearchField value={query} onChange={setQuery} placeholder="ค้นหาสื่อที่ครูต้องใช้" style={{ flex: 1, maxWidth: 560 }} />
            <div style={{ flex: 1 }} />
            <div style={{ display: "flex", alignItems: "center", gap: 10 }} className="kru-app-header-account">
              <span style={{ width: 36, height: 36, borderRadius: "var(--r-pill)", background: "var(--pink-100)", color: "var(--pink-700)", display: "grid", placeItems: "center", fontWeight: "var(--fw-semibold)", fontSize: "var(--fs-14)" }}>
                {initials}
              </span>
              <div style={{ fontSize: "var(--fs-14)", lineHeight: 1.3 }}>
                <div style={{ fontWeight: "var(--fw-semibold)" }}>{profile?.fullName || profile?.email}</div>
                <div style={{ color: "var(--text-muted)", fontSize: "var(--fs-13)" }}>แพ็ก {profile?.plan}</div>
              </div>
            </div>
          </header>

          <main style={{ padding: "var(--sp-6) var(--sp-5)", flex: 1 }} className="kru-app-content">
            {view === "home" && (
              <div>
                <div style={{ background: "var(--wash-hero)", borderRadius: "var(--r-panel)", padding: "var(--sp-8)", marginBottom: "var(--sp-8)", display: "flex", alignItems: "center", gap: "var(--sp-6)", flexWrap: "wrap" }}>
                  <div style={{ flex: 1, minWidth: 240 }}>
                    <h1 style={{ fontSize: "var(--fs-30)" }}>สวัสดีค่ะ{profile?.fullName ? ` ${profile.fullName}` : ""}</h1>
                    <p style={{ margin: "var(--sp-3) 0 0", fontSize: "var(--fs-16)", color: "var(--text-body)" }}>สื่อพร้อมสอนภาษาไทย ใช้ได้ทันที ไม่ต้องทำเอง</p>
                  </div>
                  <Button size="lg" icon={FolderOpen} onClick={() => setView("library")}>
                    เข้าคลังสื่อ
                  </Button>
                </div>
                <h2 style={{ fontSize: "var(--fs-24)", marginBottom: "var(--sp-5)" }}>สื่อล่าสุดในคลัง</h2>
                {resources.length === 0 ? (
                  <EmptyState icon={FolderOpen} title="ยังไม่มีสื่อเผยแพร่" description="แอดมินยังไม่ได้เผยแพร่สื่อ กลับมาดูใหม่อีกครั้ง" />
                ) : (
                  <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(240px, 1fr))", gap: "var(--gap-grid)" }}>
                    {resources.slice(0, 3).map((r) => (
                      <ResourceCard
                        key={r.id}
                        title={r.title}
                        meta={r.meta}
                        affordance={r.affordance}
                        tags={r.tags}
                        icon={resourceIcon(r.affordance)}
                        tint={resourceTint(r.affordance)}
                        free={r.free}
                        locked={!canAccess(r)}
                        saved={saved.includes(r.id)}
                        onSave={() => toggleSaved(r.id)}
                        onClick={() => openDetail(r)}
                        onAction={() => openResource(r)}
                      />
                    ))}
                  </div>
                )}
              </div>
            )}

            {view === "library" && (
              <div>
                <h1 style={{ fontSize: "var(--fs-30)" }}>คลังสื่อ</h1>
                <p style={{ margin: "var(--sp-3) 0 var(--sp-6)", fontSize: "var(--fs-16)", color: "var(--text-muted)" }}>ดูตัวอย่างได้ทุกชิ้นก่อนใช้ ดาวน์โหลดแล้วสอนได้เลย</p>
                <div className="kru-lib-grid">
                  <aside className="kru-lib-filters">
                    <FilterChips label="หมวดหมู่" options={categoryOptions} value={categories} onChange={setCategories} />
                  </aside>
                  <div>
                    <div style={{ fontSize: "var(--fs-15)", color: "var(--text-muted)", marginBottom: "var(--sp-5)" }}>พบ {filtered.length} รายการ</div>
                    {filtered.length === 0 ? (
                      <EmptyState icon={FolderOpen} title="ยังไม่มีไฟล์ตามตัวกรองนี้" description="ลองเปลี่ยนตัวกรอง" />
                    ) : (
                      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(240px, 1fr))", gap: "var(--gap-grid)" }}>
                        {filtered.map((r) => (
                          <ResourceCard
                            key={r.id}
                            title={r.title}
                            meta={r.meta}
                            affordance={r.affordance}
                            tags={r.tags}
                            icon={resourceIcon(r.affordance)}
                            tint={resourceTint(r.affordance)}
                            free={r.free}
                            locked={!canAccess(r)}
                            saved={saved.includes(r.id)}
                            onSave={() => toggleSaved(r.id)}
                            onClick={() => openDetail(r)}
                            onAction={() => openResource(r)}
                          />
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            )}

            {view === "detail" && detail && (
              <div>
                <Button variant="ghost" size="sm" icon={ArrowLeft} onClick={() => setView("library")} style={{ marginBottom: "var(--sp-5)" }}>
                  คลังสื่อ
                </Button>
                <div className="kru-detail-grid">
                  <div>
                    <h1 style={{ fontSize: "var(--fs-36)" }}>{detail.title}</h1>
                    <div style={{ margin: "var(--sp-5) 0 var(--sp-6)", color: "var(--text-muted)" }}>{detail.meta}</div>
                    <div style={{ border: "1px solid var(--border-subtle)", borderRadius: "var(--r-panel)", background: "var(--surface-card)", height: 320, display: "grid", placeItems: "center", color: "var(--text-faint)", overflow: "hidden" }}>
                      {detail.coverImageUrl ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={detail.coverImageUrl} alt={detail.title} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                      ) : (
                        React.createElement(resourceIcon(detail.affordance), { size: 48, strokeWidth: 1.5 })
                      )}
                    </div>
                    <div style={{ display: "grid", gap: "var(--sp-6)", marginTop: "var(--sp-8)", maxWidth: 640 }}>
                      <div>
                        <h3 style={{ fontSize: "var(--fs-20)" }}>สื่อนี้คืออะไร</h3>
                        <p style={{ fontSize: "var(--fs-16)", lineHeight: "var(--lh-loose)", color: "var(--text-body)" }}>{detail.description || "—"}</p>
                      </div>
                    </div>
                  </div>
                  <div className="kru-detail-side">
                    <div className="kru-card" style={{ padding: "var(--sp-7)" }}>
                      <div style={{ fontFamily: "var(--font-display)", fontSize: "var(--fs-18)", fontWeight: "var(--fw-semibold)" }}>
                        {canAccess(detail) ? "พร้อมใช้สอนได้เลย" : "สื่อนี้สำหรับสมาชิก"}
                      </div>
                      <Button block size="lg" style={{ marginTop: "var(--sp-6)" }} onClick={() => openResource(detail)}>
                        {canAccess(detail) ? "เปิดใช้งาน" : "ดูแพ็กที่ปลดล็อก"}
                      </Button>
                      <Button block variant="ghost" icon={Bookmark} onClick={() => toggleSaved(detail.id)} style={{ marginTop: "var(--sp-4)" }}>
                        {saved.includes(detail.id) ? "บันทึกไว้แล้ว" : "บันทึกไว้ใช้ทีหลัง"}
                      </Button>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {view === "requests" && (
              <div>
                <h1 style={{ fontSize: "var(--fs-30)" }}>เสนอไอเดียสื่อใหม่</h1>
                <p style={{ margin: "var(--sp-3) 0 var(--sp-7)", color: "var(--text-muted)" }}>บอกทีมงานว่าอยากได้สื่ออะไรเพิ่ม</p>
                <form onSubmit={handleSubmitRequest} className="kru-card" style={{ padding: "var(--sp-6)", display: "flex", gap: "var(--sp-4)", alignItems: "flex-end", flexWrap: "wrap", maxWidth: 700, marginBottom: "var(--sp-8)" }}>
                  <div style={{ flex: 1, minWidth: 240 }}>
                    <Input label="ไอเดียของครู" placeholder="เช่น เกมทบทวนคำศัพท์ภาษาอังกฤษ ป.3" value={newRequestTitle} onChange={(e) => setNewRequestTitle(e.target.value)} />
                  </div>
                  <Button type="submit" loading={submittingRequest}>
                    ส่งไอเดีย
                  </Button>
                  {requestError && <p style={{ width: "100%", fontSize: "var(--fs-14)", color: "var(--status-danger-fg)" }}>{requestError}</p>}
                </form>
                {requests.length === 0 ? (
                  <EmptyState icon={MessageSquareText} title="ยังไม่มีไอเดียจากครู" description="เป็นคนแรกที่เสนอไอเดียสิ" />
                ) : (
                  <div style={{ display: "grid", gap: "var(--sp-5)", maxWidth: 700 }}>
                    {requests.map((r) => (
                      <div key={r.id} className="kru-card" style={{ padding: "var(--sp-6)", display: "flex", alignItems: "center", gap: "var(--sp-6)" }}>
                        <div style={{ flex: 1 }}>
                          <div style={{ fontWeight: "var(--fw-semibold)" }}>{r.title}</div>
                          <div style={{ fontSize: "var(--fs-14)", color: "var(--text-muted)" }}>{r.votes} โหวต</div>
                        </div>
                        <Badge tone={REQUEST_STATUS_TONE[r.status]}>{REQUEST_STATUS_LABEL[r.status]}</Badge>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {view === "plans" && (
              <div>
                <h1 style={{ fontSize: "var(--fs-30)" }}>แพ็กเกจ</h1>
                <p style={{ margin: "var(--sp-3) 0 var(--sp-7)", color: "var(--text-muted)" }}>แพ็กปัจจุบันของคุณคือ {profile?.plan}</p>
                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))", gap: "var(--gap-grid)" }}>
                  {plans.map((plan) => {
                    const isCurrent = profile?.plan === plan.id;
                    const pendingRequest = upgradeRequests.find((r) => r.planId === plan.id && r.status === "pending");
                    return (
                      <div key={plan.id} className="kru-card" style={{ padding: "var(--sp-7)", display: "flex", flexDirection: "column" }}>
                        <div style={{ fontFamily: "var(--font-display)", fontSize: "var(--fs-20)", fontWeight: "var(--fw-semibold)" }}>{plan.name}</div>
                        <div style={{ fontFamily: "var(--font-display)", fontSize: "var(--fs-30)", fontWeight: "var(--fw-bold)", marginTop: 8 }}>{plan.priceLabel}</div>
                        <p style={{ fontSize: "var(--fs-14)", color: "var(--text-muted)", marginTop: 8 }}>{plan.note}</p>
                        <div style={{ marginTop: "var(--sp-6)" }}>
                          {isCurrent ? (
                            <Badge tone="success">แพ็กปัจจุบันของคุณ</Badge>
                          ) : plan.id === "free" ? null : pendingRequest ? (
                            <div>
                              <Badge tone="warning">รอแอดมินอนุมัติ</Badge>
                              <p style={{ fontSize: "var(--fs-13)", color: "var(--text-muted)", marginTop: 8 }}>
                                โอนเงินหรือติดต่อชำระผ่าน LINE: <strong>{PAYMENT_LINE_ID}</strong> แล้วรอแอดมินอัปเกรดให้
                              </p>
                            </div>
                          ) : (
                            <Button block icon={MessageCircle} loading={submittingUpgradePlanId === plan.id} onClick={() => handleRequestUpgrade(plan.id)}>
                              สนใจอัปเกรด
                            </Button>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
                <p style={{ marginTop: "var(--sp-7)", fontSize: "var(--fs-14)", color: "var(--text-muted)" }}>
                  วิธีอัปเกรด: กด &ldquo;สนใจอัปเกรด&rdquo; แล้วโอนเงินหรือติดต่อชำระผ่าน LINE <strong>{PAYMENT_LINE_ID}</strong> ทีมงานจะอัปเกรดแพ็กให้หลังยืนยันการชำระเงิน
                </p>
              </div>
            )}
          </main>
        </div>
      </div>

      <nav className="kru-app-mobile-tabs">
        {NAV_GROUPS[0].items.map((tab) => {
          const active = view === tab.key || (tab.key === "library" && view === "detail");
          return (
            <button
              key={tab.key}
              type="button"
              onClick={() => setView(tab.key as View)}
              style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 2, border: "none", background: "transparent", color: active ? "var(--brand)" : "var(--text-muted)", fontSize: "var(--fs-12)", padding: "6px 4px", flex: 1 }}
            >
              <tab.icon size={22} strokeWidth={1.75} />
              <span>{tab.label}</span>
            </button>
          );
        })}
      </nav>

      <style>{`
        .kru-app-shell { display: flex; min-height: 100vh; }
        .kru-app-sidebar { display: none; }
        .kru-app-main { flex: 1; min-width: 0; display: flex; flex-direction: column; }
        .kru-app-header { background: var(--white); border-bottom: 1px solid var(--border-subtle); height: 64px; padding: 0 var(--sp-5); display: flex; align-items: center; gap: var(--sp-4); position: sticky; top: 0; z-index: 10; }
        .kru-app-header-account { display: none; }
        .kru-app-mobile-tabs { position: fixed; bottom: 0; left: 0; right: 0; height: 64px; background: var(--white); border-top: 1px solid var(--border-subtle); display: flex; z-index: 20; }
        .kru-lib-grid { display: grid; grid-template-columns: 1fr; gap: var(--sp-6); }
        .kru-lib-filters { display: flex; flex-direction: column; gap: var(--sp-6); }
        .kru-detail-grid { display: grid; grid-template-columns: 1fr; gap: var(--sp-7); }
        @media (min-width: 900px) {
          .kru-lib-grid { grid-template-columns: 256px 1fr; align-items: start; }
          .kru-lib-filters { background: var(--surface-card); border: 1px solid var(--border-subtle); border-radius: var(--r-card); padding: var(--sp-6); position: sticky; top: var(--sp-6); }
        }
        @media (min-width: 1024px) {
          .kru-app-sidebar { display: flex; flex-direction: column; width: 272px; flex: 0 0 auto; background: var(--white); border-right: 1px solid var(--border-subtle); padding: var(--sp-6); position: sticky; top: 0; height: 100vh; }
          .kru-app-header { height: 72px; padding: 0 var(--sp-8); }
          .kru-app-header-account { display: flex; }
          .kru-app-content { padding: var(--sp-8) !important; }
          .kru-app-mobile-tabs { display: none; }
          .kru-detail-grid { grid-template-columns: 1fr 340px; gap: var(--sp-9); }
          .kru-detail-side { position: sticky; top: var(--sp-6); }
        }
      `}</style>
    </div>
  );
}
