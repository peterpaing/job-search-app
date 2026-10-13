CREATE TABLE "billing_customers" (
	"user_id" uuid NOT NULL,
	"livemode" boolean NOT NULL,
	"stripe_customer_id" text NOT NULL,
	"checkout_key" uuid,
	"checkout_expires_at" timestamp with time zone,
	"checkout_session_id" text,
	"consent_at" timestamp with time zone,
	"sync_owner" uuid,
	"sync_until" timestamp with time zone,
	"synced_at" timestamp with time zone,
	"risk_hold" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "billing_customers_user_id_livemode_pk" PRIMARY KEY("user_id","livemode"),
	CONSTRAINT "billing_customers_stripe_customer_id_unique" UNIQUE("stripe_customer_id")
);
--> statement-breakpoint
CREATE TABLE "billing_events" (
	"stripe_event_id" text PRIMARY KEY NOT NULL,
	"livemode" boolean NOT NULL,
	"processed_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "billing_subscriptions" (
	"stripe_subscription_id" text PRIMARY KEY NOT NULL,
	"stripe_customer_id" text NOT NULL,
	"price_id" text NOT NULL,
	"status" text NOT NULL,
	"premium" boolean DEFAULT false NOT NULL,
	"paid_until" timestamp with time zone,
	"cancel_at_period_end" boolean DEFAULT false NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "billing_customers" ADD CONSTRAINT "billing_customers_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "billing_subscriptions" ADD CONSTRAINT "billing_subscriptions_stripe_customer_id_billing_customers_stripe_customer_id_fk" FOREIGN KEY ("stripe_customer_id") REFERENCES "public"."billing_customers"("stripe_customer_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "billing_subscriptions_customer_idx" ON "billing_subscriptions" USING btree ("stripe_customer_id");