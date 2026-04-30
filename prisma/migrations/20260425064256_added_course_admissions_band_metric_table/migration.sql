-- CreateTable
CREATE TABLE "course_admissions_band_metrics" (
    "band_metric_id" SERIAL NOT NULL,
    "admission_profile_id" INTEGER NOT NULL,
    "university_code" TEXT NOT NULL,
    "qualification_type" TEXT NOT NULL,
    "metric_type" TEXT NOT NULL,
    "scope_type" TEXT,
    "band_label" TEXT NOT NULL,
    "band_min" DECIMAL(5,2),
    "band_max" DECIMAL(5,2),
    "percentage_value" DECIMAL(5,2),
    "display_order" INTEGER,
    "source_note" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "course_admissions_band_metrics_pkey" PRIMARY KEY ("band_metric_id")
);

-- CreateIndex
CREATE INDEX "course_admissions_band_metrics_admission_profile_id_idx" ON "course_admissions_band_metrics"("admission_profile_id");

-- CreateIndex
CREATE INDEX "course_admissions_band_metrics_university_code_qualificatio_idx" ON "course_admissions_band_metrics"("university_code", "qualification_type", "metric_type");

-- AddForeignKey
ALTER TABLE "course_admissions_band_metrics" ADD CONSTRAINT "course_admissions_band_metrics_admission_profile_id_fkey" FOREIGN KEY ("admission_profile_id") REFERENCES "course_admissions_profiles"("admission_profile_id") ON DELETE CASCADE ON UPDATE CASCADE;
