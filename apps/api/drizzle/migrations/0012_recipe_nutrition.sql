ALTER TABLE "ingredients" ADD COLUMN "kcal_per_100g" double precision;--> statement-breakpoint
ALTER TABLE "ingredients" ADD COLUMN "protein_per_100g" double precision;--> statement-breakpoint
ALTER TABLE "ingredients" ADD COLUMN "grams_per_unit" double precision;--> statement-breakpoint
ALTER TABLE "recipes" ADD COLUMN "nutrition" jsonb;