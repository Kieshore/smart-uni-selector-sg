-- CreateTable
CREATE TABLE "universities" (
    "university_id" SERIAL NOT NULL,
    "university_name" TEXT NOT NULL,
    "short_name" TEXT,
    "country" TEXT,
    "website_url" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "universities_pkey" PRIMARY KEY ("university_id")
);

-- CreateTable
CREATE TABLE "courses" (
    "course_id" SERIAL NOT NULL,
    "university_id" INTEGER NOT NULL,
    "course_name" TEXT NOT NULL,
    "degree_type" TEXT,
    "faculty" TEXT,
    "course_code" TEXT,
    "course_fees" INTEGER,
    "duration_years" DECIMAL(4,1),
    "intake_size" INTEGER,
    "broad_field" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "courses_pkey" PRIMARY KEY ("course_id")
);

-- CreateTable
CREATE TABLE "course_admissions_profiles" (
    "admission_profile_id" SERIAL NOT NULL,
    "course_id" INTEGER NOT NULL,
    "min_gpa" DECIMAL(3,2),
    "upper_percentile_gpa" DECIMAL(3,2),
    "min_rank_points" DECIMAL(5,2),
    "upper_rank_points" DECIMAL(5,2),
    "required_subjects" JSONB,
    "notes" TEXT,
    "intake_size" INTEGER,
    "demand_score" DECIMAL(5,2),
    "competitiveness_band" TEXT,
    "year_recorded" INTEGER NOT NULL,
    "source_type" TEXT,
    "last_updated" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "course_admissions_profiles_pkey" PRIMARY KEY ("admission_profile_id")
);

-- CreateTable
CREATE TABLE "course_outcomes" (
    "outcome_id" SERIAL NOT NULL,
    "course_id" INTEGER NOT NULL,
    "median_salary" DECIMAL(10,2),
    "employment_rate" DECIMAL(5,2),
    "further_study_rate" DECIMAL(5,2),
    "career_prospects_score" DECIMAL(5,2),
    "source_year" INTEGER NOT NULL,
    "source_type" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "course_outcomes_pkey" PRIMARY KEY ("outcome_id")
);

-- CreateIndex
CREATE UNIQUE INDEX "universities_university_name_key" ON "universities"("university_name");

-- CreateIndex
CREATE UNIQUE INDEX "universities_short_name_key" ON "universities"("short_name");

-- CreateIndex
CREATE UNIQUE INDEX "courses_university_id_course_name_key" ON "courses"("university_id", "course_name");

-- CreateIndex
CREATE UNIQUE INDEX "course_admissions_profiles_course_id_year_recorded_key" ON "course_admissions_profiles"("course_id", "year_recorded");

-- CreateIndex
CREATE UNIQUE INDEX "course_outcomes_course_id_source_year_key" ON "course_outcomes"("course_id", "source_year");

-- AddForeignKey
ALTER TABLE "courses" ADD CONSTRAINT "courses_university_id_fkey" FOREIGN KEY ("university_id") REFERENCES "universities"("university_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "course_admissions_profiles" ADD CONSTRAINT "course_admissions_profiles_course_id_fkey" FOREIGN KEY ("course_id") REFERENCES "courses"("course_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "course_outcomes" ADD CONSTRAINT "course_outcomes_course_id_fkey" FOREIGN KEY ("course_id") REFERENCES "courses"("course_id") ON DELETE CASCADE ON UPDATE CASCADE;
