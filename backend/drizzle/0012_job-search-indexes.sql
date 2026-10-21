CREATE EXTENSION IF NOT EXISTS pg_trgm WITH SCHEMA public;
--> statement-breakpoint

-- Fixed text[] input makes this deterministic: no arbitrary element-to-text
-- conversions, timestamps, or session-dependent formatting are involved.
CREATE FUNCTION public.stackwing_job_tag_text(input_tags text[])
RETURNS text
LANGUAGE sql
IMMUTABLE
STRICT
PARALLEL SAFE
SET search_path = pg_catalog
AS $function$
  SELECT pg_catalog.array_to_string(input_tags, ' '::text);
$function$;
--> statement-breakpoint

CREATE INDEX "jobs_active_title_trgm_idx"
ON "jobs" USING gin ("title" gin_trgm_ops)
WHERE "is_active" = true;
--> statement-breakpoint

CREATE INDEX "jobs_active_company_trgm_idx"
ON "jobs" USING gin ("company" gin_trgm_ops)
WHERE "is_active" = true;
--> statement-breakpoint

CREATE INDEX "jobs_active_location_trgm_idx"
ON "jobs" USING gin ("location" gin_trgm_ops)
WHERE "is_active" = true;
--> statement-breakpoint

CREATE INDEX "jobs_active_country_trgm_idx"
ON "jobs" USING gin ("country" gin_trgm_ops)
WHERE "is_active" = true;
--> statement-breakpoint

CREATE INDEX "jobs_active_tags_trgm_idx"
ON "jobs" USING gin (
  public.stackwing_job_tag_text("tags") gin_trgm_ops
)
WHERE "is_active" = true;
--> statement-breakpoint

CREATE INDEX "jobs_active_listing_order_idx"
ON "jobs" USING btree (
  (CASE "source"
    WHEN 'Himalayas' THEN 1
    WHEN 'Dev Global Jobs' THEN 2
    WHEN 'We Work Remotely' THEN 3
    WHEN 'Remote OK' THEN 4
    ELSE 5
  END),
  "posted_at" DESC,
  "id" ASC
)
WHERE "is_active" = true;