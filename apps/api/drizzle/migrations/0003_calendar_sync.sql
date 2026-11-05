CREATE TABLE "external_calendars" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" text NOT NULL,
	"account_id" text NOT NULL,
	"google_calendar_id" text NOT NULL,
	"name" text NOT NULL,
	"color" text,
	"time_zone" text,
	"access_role" text,
	"sync_enabled" boolean DEFAULT true NOT NULL,
	"visibility" text DEFAULT 'shared' NOT NULL,
	"confirmed_at" timestamp,
	"sync_token" text,
	"window_start" timestamp,
	"window_end" timestamp,
	"last_synced_at" timestamp,
	"last_full_sync_at" timestamp,
	"last_error" text,
	"lock_until" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"deleted_at" timestamp
);
--> statement-breakpoint
CREATE TABLE "external_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"calendar_id" uuid NOT NULL,
	"user_id" text NOT NULL,
	"google_event_id" text NOT NULL,
	"ical_uid" text,
	"title" text,
	"description" text,
	"location" text,
	"start_at" timestamp,
	"end_at" timestamp,
	"start_date" date,
	"end_date" date,
	"is_all_day" boolean DEFAULT false NOT NULL,
	"status" text DEFAULT 'confirmed' NOT NULL,
	"transparency" text DEFAULT 'opaque' NOT NULL,
	"my_response" text,
	"google_visibility" text,
	"visibility_override" text,
	"html_link" text,
	"is_recurring_instance" boolean DEFAULT false NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"deleted_at" timestamp
);
--> statement-breakpoint
ALTER TABLE "tasks" ADD COLUMN "priority" text DEFAULT 'normal' NOT NULL;--> statement-breakpoint
ALTER TABLE "external_calendars" ADD CONSTRAINT "external_calendars_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "external_calendars" ADD CONSTRAINT "external_calendars_account_id_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."accounts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "external_events" ADD CONSTRAINT "external_events_calendar_id_external_calendars_id_fk" FOREIGN KEY ("calendar_id") REFERENCES "public"."external_calendars"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "external_events" ADD CONSTRAINT "external_events_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "external_calendars_account_google_id" ON "external_calendars" USING btree ("account_id","google_calendar_id");--> statement-breakpoint
CREATE INDEX "external_calendars_user" ON "external_calendars" USING btree ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "external_events_calendar_google_id" ON "external_events" USING btree ("calendar_id","google_event_id");--> statement-breakpoint
CREATE INDEX "external_events_user_updated" ON "external_events" USING btree ("user_id","updated_at");