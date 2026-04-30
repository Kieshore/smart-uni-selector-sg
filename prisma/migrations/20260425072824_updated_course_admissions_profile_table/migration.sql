/*
  Warnings:

  - You are about to drop the column `min_rank_points` on the `course_admissions_profiles` table. All the data in the column will be lost.
  - You are about to drop the column `upper_percentile_gpa` on the `course_admissions_profiles` table. All the data in the column will be lost.
  - You are about to drop the column `upper_rank_points` on the `course_admissions_profiles` table. All the data in the column will be lost.

*/
-- AlterTable
ALTER TABLE "course_admissions_profiles" DROP COLUMN "min_rank_points",
DROP COLUMN "upper_percentile_gpa",
DROP COLUMN "upper_rank_points",
ADD COLUMN     "tenth_percentile_grades" TEXT,
ADD COLUMN     "tenth_percentile_rp" DECIMAL(5,2);
