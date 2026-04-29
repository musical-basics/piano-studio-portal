-- Featured flag on reviews — homepage shows only featured testimonials,
-- /reviews page continues to show all approved reviews.
ALTER TABLE "public"."reviews"
    ADD COLUMN IF NOT EXISTS "featured" boolean NOT NULL DEFAULT false;
