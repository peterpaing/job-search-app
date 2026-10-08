CREATE TABLE "jobs" (
	"id" text PRIMARY KEY NOT NULL,
	"source" text NOT NULL,
	"title" text NOT NULL,
	"company" text NOT NULL,
	"company_logo" text,
	"description" text,
	"location" text,
	"country" text,
	"tags" text[] DEFAULT '{}' NOT NULL,
	"url" text NOT NULL,
	"posted_at" timestamp with time zone NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"last_seen_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX "jobs_source_idx" ON "jobs" USING btree ("source");--> statement-breakpoint
CREATE INDEX "jobs_posted_at_idx" ON "jobs" USING btree ("posted_at");