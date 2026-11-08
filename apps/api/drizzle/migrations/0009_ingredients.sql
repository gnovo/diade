CREATE TABLE "ingredients" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"space_id" uuid NOT NULL,
	"creator_id" text NOT NULL,
	"name" text NOT NULL,
	"match_key" text NOT NULL,
	"aliases" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"merged_into_id" uuid,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"deleted_at" timestamp
);
--> statement-breakpoint
ALTER TABLE "ingredients" ADD CONSTRAINT "ingredients_space_id_spaces_id_fk" FOREIGN KEY ("space_id") REFERENCES "public"."spaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ingredients" ADD CONSTRAINT "ingredients_creator_id_users_id_fk" FOREIGN KEY ("creator_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "ingredients_space_match_key" ON "ingredients" USING btree ("space_id","match_key") WHERE "ingredients"."deleted_at" IS NULL;