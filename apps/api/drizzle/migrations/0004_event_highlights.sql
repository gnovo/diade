ALTER TABLE "events" ADD COLUMN "highlighted" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "external_events" ADD COLUMN "highlighted" boolean DEFAULT false NOT NULL;