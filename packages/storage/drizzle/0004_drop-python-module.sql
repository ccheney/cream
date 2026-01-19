-- Drop python_module column from factors table
-- Python was removed from the project, this column is no longer needed

ALTER TABLE "factors" DROP COLUMN IF EXISTS "python_module";
