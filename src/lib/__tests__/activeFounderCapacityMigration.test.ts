import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const sql = readFileSync(join(process.cwd(), "supabase/migrations/20260924170000_025_active_founder_capacity.sql"), "utf8");

describe("active Founder capacity migration", () => {
  it("counts every current entitled Founder subscription, including unexpired past_due", () => {
    const counter = sql.slice(sql.indexOf("create function public.active_founder_seat_count"), sql.indexOf("create function public.get_founder_capacity"));
    expect(counter).toContain("s.plan_id = 'founder'");
    expect(counter).toContain("s.status in ('active', 'past_due')");
    expect(counter).toContain("s.current_period_end > now()");
    expect(counter).not.toContain("founder_seat_ledger");
    expect(counter).not.toContain("founder_price_lock");
  });

  it("exposes aggregate capacity only and grants it to public clients", () => {
    const aggregate = sql.slice(sql.indexOf("create function public.get_founder_capacity"), sql.indexOf("create or replace function public.get_founder_seat_count"));
    expect(aggregate).toContain("used integer");
    expect(aggregate).toContain("remaining integer");
    expect(aggregate).toContain("is_full boolean");
    expect(aggregate).toContain("greatest(0, 100 - active_count)");
    expect(aggregate).toContain("grant execute on function public.get_founder_capacity() to anon, authenticated");
    expect(aggregate).not.toMatch(/user_id|email|full_name/);
  });

  it("serializes server-side allocation and blocks seat 101", () => {
    const trigger = sql.slice(sql.indexOf("create or replace function public.enforce_founder_100_cap"), sql.indexOf("drop trigger if exists trg_enforce_founder_100_cap"));
    expect(trigger).toContain("pg_advisory_xact_lock(hashtextextended('founder-seat-allocation', 0))");
    expect(trigger).toContain("if v_founder_count >= 100");
    expect(trigger).toContain("Founder 100 is full");
    expect(trigger).toContain("Founder subscription owner cannot be changed");
    expect(sql).toContain("before insert or update on public.subscriptions");
    expect(sql).toContain("or not (select capacity.is_full from public.get_founder_capacity() capacity)");
  });

  it("does not rewrite or delete membership history", () => {
    const executable = sql.split("\n").filter((line) => !line.trimStart().startsWith("--")).join("\n");
    expect(executable).not.toMatch(/delete\s+from/i);
    expect(executable).not.toMatch(/truncate/i);
    expect(executable).not.toMatch(/drop\s+table/i);
  });
});
