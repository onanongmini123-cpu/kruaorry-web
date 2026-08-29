-- DRAFT — NOT YET APPLIED to the production project as of this commit.
-- Reviewed alongside the app-side changes; apply after sign-off with:
--   supabase db push   (or the equivalent apply_migration call)
--
-- Tightens the publish requirement added in 014_resource_file_uploads:
-- that migration only required "a cover image, and a file OR a link" for
-- every delivery mode. This makes it mode-specific instead — a
-- file_download resource must actually have a file, and the three
-- link-based modes (web_app, google_template, google_form) must actually
-- have a destination URL, rather than accepting either for any mode.
--
-- Safety check performed before drafting this (read-only, against the live
-- project ghwpmtmbqtchsrnagoir): all 4 currently-published rows are
-- web_app/google_template/google_form with both cover_image_url and
-- cta_url set, and no file_download rows exist yet — so this constraint
-- does not conflict with any existing data.
alter table public.resources drop constraint if exists resources_publish_requires_content;
alter table public.resources add constraint resources_publish_requires_type_target
  check (
    status <> 'published'
    or (
      cover_image_url is not null
      and (
        (delivery_mode = 'file_download' and file_path is not null)
        or (delivery_mode <> 'file_download' and cta_url is not null)
      )
    )
  );
