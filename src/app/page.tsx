import type { Metadata } from "next";
import { LandingExperience } from "@/app/landing/LandingExperience";
import { LANDING_REVALIDATE_SECONDS, loadLandingData } from "@/lib/landingData";

// Public, viewer-independent content: rendered on the server and revalidated
// in the background. Account-specific parts (header buttons) hydrate on the
// client after the page is already usable.
export const revalidate = LANDING_REVALIDATE_SECONDS;

export const metadata: Metadata = {
  alternates: { canonical: "/" },
};

export default async function HomePage() {
  const initial = await loadLandingData();
  return <LandingExperience initial={initial} />;
}
