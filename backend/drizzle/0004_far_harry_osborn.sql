CREATE TABLE "smart_match_cache" (
	"user_id" uuid NOT NULL,
	"key" text NOT NULL,
	"kind" text NOT NULL,
	"payload" jsonb NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	CONSTRAINT "smart_match_cache_user_id_key_pk" PRIMARY KEY("user_id","key")
);
--> statement-breakpoint
CREATE TABLE "smart_match_locks" (
	"user_id" uuid PRIMARY KEY NOT NULL,
	"lease_id" uuid NOT NULL,
	"expires_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "smart_match_profiles" (
	"user_id" uuid PRIMARY KEY NOT NULL,
	"profile" jsonb NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "smart_match_usage" (
	"scope" text NOT NULL,
	"day" date NOT NULL,
	"requests" integer DEFAULT 0 NOT NULL,
	"reserved_cents" integer DEFAULT 0 NOT NULL,
	CONSTRAINT "smart_match_usage_scope_day_pk" PRIMARY KEY("scope","day")
);
--> statement-breakpoint
ALTER TABLE "smart_match_cache" ADD CONSTRAINT "smart_match_cache_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "smart_match_locks" ADD CONSTRAINT "smart_match_locks_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "smart_match_profiles" ADD CONSTRAINT "smart_match_profiles_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "smart_match_cache_expiry_idx" ON "smart_match_cache" USING btree ("expires_at");