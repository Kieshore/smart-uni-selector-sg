-- AlterTable
ALTER TABLE "course_admissions_band_metrics" ADD COLUMN     "band_max_uas_70" DECIMAL(5,2),
ADD COLUMN     "band_min_uas_70" DECIMAL(5,2),
ADD COLUMN     "band_score_system" TEXT;

-- AlterTable
ALTER TABLE "course_admissions_profiles" ADD COLUMN     "score_system" TEXT,
ADD COLUMN     "tenth_percentile_uas_70" DECIMAL(5,2);

-- AlterTable
ALTER TABLE "user_academic_profiles" ADD COLUMN     "uas_70" DECIMAL(5,2);

-- CreateIndex
CREATE INDEX "course_admissions_band_metrics_band_score_system_idx" ON "course_admissions_band_metrics"("band_score_system");

-- CreateIndex
CREATE INDEX "course_admissions_profiles_year_recorded_idx" ON "course_admissions_profiles"("year_recorded");
