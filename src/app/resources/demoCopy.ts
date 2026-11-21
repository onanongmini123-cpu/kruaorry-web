import { publicDemoUrl } from "@/lib/resourceDemoUrl";
import { membershipUpgradeHref, type PublicResource, type PublicResourceAction, type PublicResourceViewer } from "./catalog";

export const DEMO_BUTTON_LABEL = "ทดลองเล่น";
export const DEMO_UPGRADE_NOTE = "ทดลองเล่นได้ฟรี ไม่ต้องสมัคร — ถ้าอยากใช้ฉบับเต็ม สมัคร Teacher Pro ได้เองเมื่อพร้อม";
export const DEMO_UPGRADE_LABEL = "ดูแพ็ก Teacher Pro";

export interface ResourceDemoView {
  /** Validated https link; opened in a new tab by the visitor's own click. */
  href: string;
  label: string;
  /**
   * Shown only when the full version needs a paid plan this visitor lacks. It is a
   * plain link the visitor presses themselves; nothing here navigates for them.
   */
  upgrade: { note: string; href: string; label: string } | null;
}

/**
 * What the detail page shows for the demo. The demo is public and independent of
 * the access mode, so this never looks at who the viewer is to decide whether the
 * button exists - only to decide whether to add the (optional) upgrade invitation.
 * The full version's own button and access check are not changed by any of this.
 */
export function resourceDemoView(
  item: Pick<PublicResource, "id" | "slug" | "demoUrl" | "accessMode" | "requiredPlanIds">,
  viewer: Pick<PublicResourceViewer, "pendingPlanIds">,
  action: Pick<PublicResourceAction, "canUse">,
): ResourceDemoView | null {
  const href = publicDemoUrl(item.demoUrl);
  if (!href) return null;

  const upgradePending = item.requiredPlanIds.some((planId) => (viewer.pendingPlanIds ?? []).includes(planId));
  const invite = item.accessMode === "plans" && !action.canUse && !upgradePending
    && item.requiredPlanIds.some((planId) => planId === "founder" || planId === "teacher");

  return {
    href,
    label: DEMO_BUTTON_LABEL,
    upgrade: invite ? { note: DEMO_UPGRADE_NOTE, href: membershipUpgradeHref(item), label: DEMO_UPGRADE_LABEL } : null,
  };
}
