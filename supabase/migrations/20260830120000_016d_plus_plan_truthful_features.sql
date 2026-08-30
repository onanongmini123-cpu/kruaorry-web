-- NOT YET APPLIED to the live project — prepared on review branch
-- claude/hide-unavailable-features, deliberately left for manual apply so
-- this can be reviewed alongside the copy changes it matches.
--
-- Numbered 016d rather than 016 because, as of this migration, the live
-- project (ghwpmtmbqtchsrnagoir) already has 016/016b/016c applied from
-- the still-unmerged claude/admin-owner-roles branch — those files don't
-- exist yet in this branch's history (branched from main before that
-- work merged), but the version numbering here follows the live database's
-- actual sequence so it doesn't collide once the two branches converge.
-- Per this directory's own README.md convention, rename this file to match
-- the exact version supabase_migrations.schema_migrations records once it
-- is actually applied.
--
-- The Plus plan's features list still promises an "AI ออกข้อสอบ/แผนการสอน"
-- (AI exam/lesson-plan generator) tool that does not exist anywhere in this
-- app — no AI content-generation feature has been built. Replaces that
-- line with the truthful equivalent of what Plus actually unlocks today:
-- the full resource library, which already includes downloadable files and
-- Google Sheets/Docs/Slides templates and forms (see the four resource
-- delivery modes in resources.delivery_mode), plus the in-app classroom
-- tools. price_label and note are untouched — only the false feature claim
-- is replaced.
--
-- Idempotent: a plain UPDATE to a fixed value converges to the same row
-- state no matter how many times it runs.
update public.plans
set features = array['คลังสื่อพร้อมสอนทั้งหมด', 'เทมเพลต Google และฟอร์มพร้อมใช้งาน', 'เครื่องมือในห้องเรียนครบชุด']
where id = 'plus';
