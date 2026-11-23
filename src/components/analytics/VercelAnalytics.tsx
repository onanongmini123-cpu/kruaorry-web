"use client";

import { Analytics } from "@vercel/analytics/next";
import { redactAnalyticsUrl } from "@/lib/analyticsUrl";

export function VercelAnalytics() {
  return <Analytics beforeSend={redactAnalyticsUrl} />;
}
