import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { isPermanentAuthUser } from "@/lib/authIdentity";
import { OwnerFinancePanel } from "./OwnerFinancePanel";

export const dynamic = "force-dynamic";

export default async function OwnerFinancePage() {
  const supabase = await createClient();
  const { data: { user }, error } = await supabase.auth.getUser();
  if (error || !isPermanentAuthUser(user)) redirect("/login?next=%2Fadmin%2Fowner-finance");
  const { data: profile, error: roleError } = await supabase.from("profiles")
    .select("role").eq("id", user.id).maybeSingle();
  if (roleError || profile?.role !== "owner") redirect("/admin");
  return <OwnerFinancePanel />;
}
