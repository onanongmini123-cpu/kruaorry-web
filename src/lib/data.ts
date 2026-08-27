import { Sparkles, FileSpreadsheet, Gamepad2, ClipboardCheck } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import type { ResourceAffordance } from "@/components/ui";
import type { SupabaseClient } from "@supabase/supabase-js";

export interface Resource {
  id: string;
  title: string;
  meta: string;
  description: string | null;
  category: string | null;
  affordance: ResourceAffordance;
  ctaUrl: string | null;
  coverImageUrl: string | null;
  tags: string[];
  free: boolean;
}

export interface Plan {
  id: string;
  name: string;
  priceLabel: string;
  note: string | null;
  features: string[];
}

export interface Profile {
  id: string;
  email: string;
  fullName: string | null;
  role: "member" | "admin";
  plan: string;
}

const ICON_BY_MODE: Record<ResourceAffordance, LucideIcon> = {
  web_app: Gamepad2,
  google_template: FileSpreadsheet,
  google_form: ClipboardCheck,
};

const TINT_BY_MODE: Record<ResourceAffordance, "purple" | "pink" | "blue"> = {
  web_app: "pink",
  google_template: "blue",
  google_form: "purple",
};

export function resourceIcon(affordance: ResourceAffordance): LucideIcon {
  return ICON_BY_MODE[affordance] ?? Sparkles;
}

export function resourceTint(affordance: ResourceAffordance): "purple" | "pink" | "blue" {
  return TINT_BY_MODE[affordance] ?? "purple";
}

export async function fetchPublishedResources(supabase: SupabaseClient): Promise<Resource[]> {
  const { data, error } = await supabase
    .from("resources")
    .select("id, title, meta, description, category, delivery_mode, cta_url, cover_image_url, tags, is_free")
    .eq("status", "published")
    .order("created_at", { ascending: false });

  if (error || !data) return [];

  return data.map((r) => ({
    id: r.id,
    title: r.title,
    meta: r.meta ?? "",
    description: r.description,
    category: r.category,
    affordance: r.delivery_mode as ResourceAffordance,
    ctaUrl: r.cta_url,
    coverImageUrl: r.cover_image_url,
    tags: r.tags ?? [],
    free: r.is_free,
  }));
}

export async function fetchPlans(supabase: SupabaseClient): Promise<Plan[]> {
  const { data, error } = await supabase
    .from("plans")
    .select("id, name, price_label, note, features")
    .order("sort_order", { ascending: true });

  if (error || !data) return [];

  return data.map((p) => ({
    id: p.id,
    name: p.name,
    priceLabel: p.price_label,
    note: p.note,
    features: p.features ?? [],
  }));
}

export async function fetchProfile(supabase: SupabaseClient, userId: string): Promise<Profile | null> {
  const { data, error } = await supabase
    .from("profiles")
    .select("id, email, full_name, role, plan")
    .eq("id", userId)
    .single();

  if (error || !data) return null;

  return {
    id: data.id,
    email: data.email,
    fullName: data.full_name,
    role: data.role,
    plan: data.plan,
  };
}
