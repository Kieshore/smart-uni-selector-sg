/*
  Warnings:

  - You are about to drop the column `employment_rate` on the `course_outcomes` table. All the data in the column will be lost.
  - You are about to drop the column `further_study_rate` on the `course_outcomes` table. All the data in the column will be lost.
  - You are about to drop the column `median_salary` on the `course_outcomes` table. All the data in the column will be lost.
  - You are about to drop the column `broad_field` on the `courses` table. All the data in the column will be lost.
  - You are about to drop the column `course_code` on the `courses` table. All the data in the column will be lost.
  - You are about to drop the column `course_fees` on the `courses` table. All the data in the column will be lost.
  - You are about to drop the column `degree_type` on the `courses` table. All the data in the column will be lost.
  - You are about to drop the column `faculty` on the `courses` table. All the data in the column will be lost.
  - You are about to drop the column `intake_size` on the `courses` table. All the data in the column will be lost.

*/
-- AlterTable
ALTER TABLE "course_outcomes" DROP COLUMN "employment_rate",
DROP COLUMN "further_study_rate",
DROP COLUMN "median_salary",
ADD COLUMN     "basic_monthly_median" DECIMAL(10,2),
ADD COLUMN     "employment_rate_ft_perm" DECIMAL(5,2),
ADD COLUMN     "employment_rate_overall" DECIMAL(5,2);

-- AlterTable
ALTER TABLE "courses" DROP COLUMN "broad_field",
DROP COLUMN "course_code",
DROP COLUMN "course_fees",
DROP COLUMN "degree_type",
DROP COLUMN "faculty",
DROP COLUMN "intake_size",
ADD COLUMN     "career_prospects" TEXT,
ADD COLUMN     "school" TEXT;
