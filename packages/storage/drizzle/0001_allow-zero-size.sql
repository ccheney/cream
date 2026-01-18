ALTER TABLE "decisions" DROP CONSTRAINT "positive_size";--> statement-breakpoint
ALTER TABLE "decisions" ADD CONSTRAINT "non_negative_size" CHECK ("decisions"."size"::numeric >= 0);