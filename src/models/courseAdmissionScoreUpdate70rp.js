const prisma = require("../lib/prisma");
const {
  calculateBothFromGradeProfile,
} = require("../utils/aLevelScoreUtils");

module.exports.updateAdmissionsScoresFromGrades = async function updateAdmissionsScoresFromGrades(courseId = null) {
  const whereClause = {
    tenth_percentile_grades: {
      not: null,
    },
    ...(courseId ? { course_id: parseInt(courseId, 10) } : {}),
  };

  const profiles = await prisma.courseAdmissionsProfile.findMany({
    where: whereClause,
    select: {
      admission_profile_id: true,
      course_id: true,
      tenth_percentile_grades: true,
    },
  });

  let updated = 0;
  const skipped = [];

  for (const profile of profiles) {
    const scores = calculateBothFromGradeProfile(profile.tenth_percentile_grades);

    if (scores.legacy90 === null) {
      skipped.push({
        admission_profile_id: profile.admission_profile_id,
        course_id: profile.course_id,
        tenth_percentile_grades: profile.tenth_percentile_grades,
      });
      continue;
    }

    await prisma.courseAdmissionsProfile.update({
      where: {
        admission_profile_id: profile.admission_profile_id,
      },
      data: {
        tenth_percentile_rp: scores.legacy90,
        tenth_percentile_uas_70: scores.uas70,
        score_system: "mixed",
      },
    });

    updated++;
  }

  return {
    totalProfilesChecked: profiles.length,
    updated,
    skipped,
  };
};