CREATE TABLE "important_dates" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"space_id" uuid NOT NULL,
	"creator_id" text NOT NULL,
	"title" text NOT NULL,
	"type" text DEFAULT 'other' NOT NULL,
	"notes" text,
	"date" date NOT NULL,
	"count_first_day" boolean DEFAULT false NOT NULL,
	"repeat" text DEFAULT 'yearly' NOT NULL,
	"pinned" boolean DEFAULT false NOT NULL,
	"alert_offset_days" integer,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"deleted_at" timestamp
);
--> statement-breakpoint
ALTER TABLE "important_dates" ADD CONSTRAINT "important_dates_space_id_spaces_id_fk" FOREIGN KEY ("space_id") REFERENCES "public"."spaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "important_dates" ADD CONSTRAINT "important_dates_creator_id_users_id_fk" FOREIGN KEY ("creator_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "important_dates_one_pinned_per_space" ON "important_dates" USING btree ("space_id") WHERE "important_dates"."pinned" AND "important_dates"."deleted_at" IS NULL;