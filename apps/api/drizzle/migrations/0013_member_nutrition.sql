ALTER TABLE "space_members" ADD COLUMN "nutrition_enabled" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "space_members" ADD COLUMN "nutrition_targets" jsonb;