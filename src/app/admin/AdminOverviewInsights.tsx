"use client";

import { Crown, Heart, LayoutGrid, ListChecks, Star, UserPlus, Users, Wallet } from "lucide-react";
import { resourceGradeLabel } from "@/lib/resourceGrades";
import type { AdminOverviewInsights as Insights } from "@/lib/adminOverview";

interface AdminOverviewInsightsProps {
  data: Insights | null;
  loading: boolean;
  message: string | null;
}

const numberFormat = new Intl.NumberFormat("th-TH");
const currencyFormat = new Intl.NumberFormat("th-TH", {
  style: "currency",
  currency: "THB",
  maximumFractionDigits: 0,
});
const dateFormat = new Intl.DateTimeFormat("th-TH", {
  timeZone: "Asia/Bangkok",
  day: "numeric",
  month: "short",
  year: "numeric",
});
const dateTimeFormat = new Intl.DateTimeFormat("th-TH", {
  timeZone: "Asia/Bangkok",
  day: "numeric",
  month: "short",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
});

function Metric({ value, label }: { value: string | number; label: string }) {
  return (
    <div className="kru-admin-insight-metric">
      <strong>{typeof value === "number" ? numberFormat.format(value) : value}</strong>
      <span>{label}</span>
    </div>
  );
}

function Card({ icon: Icon, title, children, wide = false }: {
  icon: typeof Wallet;
  title: string;
  children: React.ReactNode;
  wide?: boolean;
}) {
  const headingId = `insight-${title.replace(/\s+/g, "-")}`;
  return (
    <section className={`kru-card kru-admin-insight-card${wide ? " kru-admin-insight-card--wide" : ""}`} aria-labelledby={headingId}>
      <header>
        <span aria-hidden="true"><Icon size={19} /></span>
        <h3 id={headingId}>{title}</h3>
      </header>
      {children}
    </section>
  );
}

export function AdminOverviewInsights({ data, loading, message }: AdminOverviewInsightsProps) {
  if (loading && !data) {
    return <p className="kru-admin-insight-notice" role="status">กำลังโหลดข้อมูลธุรกิจ…</p>;
  }
  if (!data) {
    return message ? <p className="kru-admin-insight-notice" role="status">{message}</p> : null;
  }

  const firstConfirmation = data.revenue.first_confirmed_at
    ? dateFormat.format(new Date(data.revenue.first_confirmed_at))
    : null;

  return (
    <section className="kru-admin-insights" aria-labelledby="admin-business-insights-title">
      <div className="kru-admin-insights-heading">
        <div>
          <h2 id="admin-business-insights-title">ข้อมูลธุรกิจ</h2>
          <p>ตัวเลขรวมจากฐานข้อมูล · ตัดรอบตามเวลาไทย</p>
        </div>
        <span>อัปเดต {dateTimeFormat.format(new Date(data.as_of))} น.</span>
      </div>
      {message && <p className="kru-admin-insight-notice" role="status">{message}</p>}

      <div className="kru-admin-insights-grid">
        <Card icon={Wallet} title="รายได้ที่ยืนยันแล้ว">
          <div className="kru-admin-insight-metrics">
            <Metric value={currencyFormat.format(data.revenue.month_confirmed_thb)} label="เดือนนี้" />
            <Metric value={currencyFormat.format(data.revenue.all_time_confirmed_thb)} label="ทั้งหมด" />
          </div>
          <p className="kru-admin-insight-help">ยืนยันโดยแอดมิน</p>
          <p className="kru-admin-insight-help">
            {firstConfirmation
              ? `ยอดทั้งหมดนับตั้งแต่รายการแรกในระบบ วันที่ ${firstConfirmation}`
              : "ยังไม่มีรายการยืนยันชำระในระบบ"}
          </p>
          <p className="kru-admin-insight-caveat">ระบบยังไม่มีสถานะยกเลิกหรือคืนเงิน จึงยังไม่มีรายการดังกล่าวให้หักออกจากยอดนี้</p>
        </Card>

        <Card icon={Crown} title="สมาชิก Pro">
          <div className="kru-admin-insight-metrics">
            <Metric value={data.premium_memberships.active_count} label="ใช้งานอยู่" />
            <Metric value={data.premium_memberships.expiring_within_30_days_count} label="หมดอายุใน 30 วัน" />
          </div>
          <p className="kru-admin-insight-help">นับแพ็กที่มีสิทธิ์คลังสื่อพรีเมียมและยังไม่หมดอายุ</p>
        </Card>

        <Card icon={UserPlus} title="สมาชิกใหม่">
          <div className="kru-admin-insight-metrics">
            <Metric value={data.new_members.last_7_days_count} label="7 วันล่าสุด" />
            <Metric value={data.new_members.last_30_days_count} label="30 วันล่าสุด" />
          </div>
          <p className="kru-admin-insight-help">เริ่มนับเวลา 00:00 น. ตามปฏิทิน Asia/Bangkok</p>
        </Card>

        <Card icon={Users} title="ที่นั่ง Founder">
          <div className="kru-admin-insight-founder">
            <strong>{numberFormat.format(data.founder_seats.used)}</strong>
            <span>จาก {numberFormat.format(data.founder_seats.capacity)} ที่นั่ง</span>
          </div>
          <p className="kru-admin-insight-help">นับจากสมุดที่นั่งถาวร ที่นั่งเดิมไม่ถูกนำกลับมาใช้ซ้ำ</p>
        </Card>

        <Card icon={ListChecks} title="ขั้นตอนการสมัคร" wide>
          <ol className="kru-admin-insight-funnel">
            <li><strong>{numberFormat.format(data.application_funnel.total_members)}</strong><span>สมาชิกทั้งหมด</span></li>
            <li><strong>{numberFormat.format(data.application_funnel.requested_premium)}</strong><span>เคยยื่นคำขอ Pro</span></li>
            <li><strong>{numberFormat.format(data.application_funnel.approved_premium)}</strong><span>ได้รับอนุมัติแล้ว</span></li>
          </ol>
        </Card>

        <Card icon={Heart} title="สื่อที่ครูกดหัวใจ" wide>
          {data.favorites.top_published_resources.length > 0 ? (
            <ol className="kru-admin-insight-ranked">
              {data.favorites.top_published_resources.map((resource, index) => (
                <li key={`${resource.title}:${index}`}><span>{resource.title}</span><strong>{numberFormat.format(resource.heart_count)} หัวใจ</strong></li>
              ))}
            </ol>
          ) : <p className="kru-admin-insight-empty">ยังไม่มีสื่อที่เผยแพร่แล้วได้รับหัวใจ</p>}
          <p className="kru-admin-insight-help">สื่อที่เผยแพร่แล้วแต่ยังไม่มีหัวใจ: {numberFormat.format(data.favorites.published_without_hearts_count)} รายการ</p>
        </Card>

        <Card icon={Star} title="สื่อรีวิวสูงสุด" wide>
          {data.reviews.top_published_resources.length > 0 ? (
            <ol className="kru-admin-insight-ranked">
              {data.reviews.top_published_resources.map((resource, index) => (
                <li key={`${resource.title}:${index}`}>
                  <span>{resource.title}</span>
                  <strong>{numberFormat.format(resource.average_rating)} ดาว · {numberFormat.format(resource.review_count)} รีวิว</strong>
                </li>
              ))}
            </ol>
          ) : <p className="kru-admin-insight-empty">ยังไม่มีสื่อที่ผ่านเกณฑ์จัดอันดับ</p>}
          <p className="kru-admin-insight-help">เฉพาะสื่อที่เผยแพร่และรีวิวที่อนุมัติแล้ว อย่างน้อย {numberFormat.format(data.reviews.minimum_review_count)} รีวิว</p>
        </Card>

        <Card icon={LayoutGrid} title="ช่องว่างเนื้อหา" wide>
          {data.content_breakdown.length > 0 ? (
            <div className="kru-admin-insight-table" role="table" aria-label="จำนวนสื่อที่เผยแพร่ตามระดับชั้นและหมวดหมู่">
              <div role="row" className="kru-admin-insight-table__head">
                <span role="columnheader">ระดับชั้น</span><span role="columnheader">หมวดหมู่</span><span role="columnheader">จำนวน</span>
              </div>
              {data.content_breakdown.map((row) => (
                <div role="row" key={`${row.grade_level}:${row.category}`}>
                  <span role="cell">{resourceGradeLabel(row.grade_level)}</span>
                  <span role="cell">{row.category}</span>
                  <strong role="cell">{numberFormat.format(row.resource_count)}</strong>
                </div>
              ))}
            </div>
          ) : <p className="kru-admin-insight-empty">ยังไม่มีสื่อที่เผยแพร่ให้สรุปตามระดับชั้น</p>}
        </Card>
      </div>
    </section>
  );
}
