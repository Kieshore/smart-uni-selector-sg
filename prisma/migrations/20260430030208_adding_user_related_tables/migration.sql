-- CreateTable
CREATE TABLE "users" (
    "user_id" SERIAL NOT NULL,
    "first_name" TEXT NOT NULL,
    "full_name" TEXT NOT NULL,
    "citizenship" TEXT,
    "email" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "users_pkey" PRIMARY KEY ("user_id")
);

-- CreateTable
CREATE TABLE "user_academic_profiles" (
    "academic_profile_id" SERIAL NOT NULL,
    "user_id" INTEGER NOT NULL,
    "qualification_type" TEXT NOT NULL,
    "current_gpa" DECIMAL(3,2),
    "projected_gpa" DECIMAL(3,2),
    "rank_points" DECIMAL(5,2),
    "diploma_name" TEXT,
    "institution_name" TEXT,
    "graduation_year" INTEGER,
    "english_grade" TEXT,
    "math_grade" TEXT,
    "computing_grade" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "user_academic_profiles_pkey" PRIMARY KEY ("academic_profile_id")
);

-- CreateTable
CREATE TABLE "user_preferences" (
    "preference_id" SERIAL NOT NULL,
    "user_id" INTEGER NOT NULL,
    "preferred_fields" JSONB,
    "preferred_universities" JSONB,
    "prioritise_salary" INTEGER,
    "prioritise_interest_fit" INTEGER,
    "prioritise_flexibility" INTEGER,
    "prioritise_admission_chance" INTEGER,
    "prioritise_prestige" INTEGER,
    "wants_broad_degree" BOOLEAN,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "user_preferences_pkey" PRIMARY KEY ("preference_id")
);

-- CreateIndex
CREATE UNIQUE INDEX "users_full_name_key" ON "users"("full_name");

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- AddForeignKey
ALTER TABLE "user_academic_profiles" ADD CONSTRAINT "user_academic_profiles_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("user_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_preferences" ADD CONSTRAINT "user_preferences_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("user_id") ON DELETE CASCADE ON UPDATE CASCADE;
