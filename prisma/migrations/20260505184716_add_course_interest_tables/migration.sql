-- CreateTable
CREATE TABLE "interest_groups" (
    "interest_group_id" SERIAL NOT NULL,
    "interest_name" TEXT NOT NULL,
    "description" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "interest_groups_pkey" PRIMARY KEY ("interest_group_id")
);

-- CreateTable
CREATE TABLE "course_related_interests" (
    "course_related_interest_id" SERIAL NOT NULL,
    "course_id" INTEGER NOT NULL,
    "interest_group_id" INTEGER NOT NULL,
    "relevance_score" INTEGER NOT NULL,
    "source_type" TEXT,
    "source_note" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "last_updated" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "course_related_interests_pkey" PRIMARY KEY ("course_related_interest_id")
);

-- CreateIndex
CREATE UNIQUE INDEX "interest_groups_interest_name_key" ON "interest_groups"("interest_name");

-- CreateIndex
CREATE INDEX "course_related_interests_course_id_idx" ON "course_related_interests"("course_id");

-- CreateIndex
CREATE INDEX "course_related_interests_interest_group_id_idx" ON "course_related_interests"("interest_group_id");

-- CreateIndex
CREATE INDEX "course_related_interests_relevance_score_idx" ON "course_related_interests"("relevance_score");

-- CreateIndex
CREATE UNIQUE INDEX "course_related_interests_course_id_interest_group_id_key" ON "course_related_interests"("course_id", "interest_group_id");

-- AddForeignKey
ALTER TABLE "course_related_interests" ADD CONSTRAINT "course_related_interests_course_id_fkey" FOREIGN KEY ("course_id") REFERENCES "courses"("course_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "course_related_interests" ADD CONSTRAINT "course_related_interests_interest_group_id_fkey" FOREIGN KEY ("interest_group_id") REFERENCES "interest_groups"("interest_group_id") ON DELETE CASCADE ON UPDATE CASCADE;
