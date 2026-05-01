const prisma = require("../lib/prisma");

const DEFAULT_DIFFERENCE = 0;

const QUALIFICATION = {
  POLY: ["polytechnic", "poly"],
  JC: ["a-level", "a level", "jc", "junior college"],
};

const H2_POINTS = {
  A: 20,
  B: 17.5,
  C: 15,
  D: 12.5,
  E: 10,
  S: 5,
  U: 0,
};

const H1_POINTS = {
  A: 10,
  B: 8.75,
  C: 7.5,
  D: 6.25,
  E: 5,
  S: 2.5,
  U: 0,
};

function normalizeQualificationType(value) {
  return String(value || "").trim().toLowerCase();
}

function isPolyQualification(value) {
  return QUALIFICATION.POLY.includes(normalizeQualificationType(value));
}

function isJcQualification(value) {
  return QUALIFICATION.JC.includes(normalizeQualificationType(value));
}

function parseTenthPercentileGrades(gradeProfile) {
  if (!gradeProfile || typeof gradeProfile !== "string") {
    return null;
  }

  const cleaned = gradeProfile.replace(/\s+/g, "").toUpperCase();
  const parts = cleaned.split("/");

  if (parts.length !== 2) {
    return null;
  }

  const h2Part = parts[0];
  const h1Part = parts[1];

  if (h2Part.length !== 3 || h1Part.length !== 1) {
    return null;
  }

  const validGrades = ["A", "B", "C", "D", "E", "S", "U"];
  const h2Grades = h2Part.split("");
  const h1Grade = h1Part;

  const allValid =
    h2Grades.every((g) => validGrades.includes(g)) &&
    validGrades.includes(h1Grade);

  if (!allValid) {
    return null;
  }

  return { h2Grades, h1Grade };
}

function calculateLegacyRpFromGradeProfile(gradeProfile) {
  const parsed = parseTenthPercentileGrades(gradeProfile);

  if (!parsed) {
    return null;
  }

  const { h2Grades, h1Grade } = parsed;

  const h2Total = h2Grades.reduce((sum, grade) => sum + H2_POINTS[grade], 0);
  const h1Total = H1_POINTS[h1Grade];

  const gpPoints = H1_POINTS.C;
  const pwPoints = H1_POINTS.C;

  return Number((h2Total + h1Total + gpPoints + pwPoints).toFixed(2));
}

function getAcademicValue(profile) {
  if (isPolyQualification(profile.qualification_type)) {
    if (profile.projected_gpa !== null && profile.projected_gpa !== undefined) {
      return Number(profile.projected_gpa);
    }
    if (profile.current_gpa !== null && profile.current_gpa !== undefined) {
      return Number(profile.current_gpa);
    }
    return null;
  }

  if (isJcQualification(profile.qualification_type)) {
    if (profile.rank_points !== null && profile.rank_points !== undefined) {
      return Number(profile.rank_points);
    }
    return null;
  }

  return null;
}

function isValueWithinBand(value, bandMin, bandMax) {
  if (value === null || value === undefined) {
    return false;
  }

  const numericValue = Number(value);

  if (bandMin === null || bandMin === undefined) {
    return numericValue <= Number(bandMax);
  }

  if (bandMax === null || bandMax === undefined) {
    return numericValue >= Number(bandMin);
  }

  return numericValue >= Number(bandMin) && numericValue <= Number(bandMax);
}

function getDirectCutoffValue(admissionsProfile, qualificationType) {
  if (isPolyQualification(qualificationType)) {
    return admissionsProfile.min_gpa !== null && admissionsProfile.min_gpa !== undefined
      ? Number(admissionsProfile.min_gpa)
      : null;
  }

  if (isJcQualification(qualificationType)) {
    return admissionsProfile.tenth_percentile_rp !== null && admissionsProfile.tenth_percentile_rp !== undefined
      ? Number(admissionsProfile.tenth_percentile_rp)
      : null;
  }

  return null;
}

function getCutoffGap({ benchmarkValue, qualificationType, admissionsProfile, matchedBandMetric }) {
  if (benchmarkValue === null || benchmarkValue === undefined) {
    return null;
  }

  // For band-based matches, use lower bound of band where possible
  if (matchedBandMetric) {
    if (matchedBandMetric.band_min !== null && matchedBandMetric.band_min !== undefined) {
      return Number((benchmarkValue - Number(matchedBandMetric.band_min)).toFixed(2));
    }
    return null;
  }

  const directCutoff = getDirectCutoffValue(admissionsProfile, qualificationType);

  if (directCutoff === null) {
    return null;
  }

  return Number((benchmarkValue - directCutoff).toFixed(2));
}

function buildCourseResult({
  admissionsProfile,
  latestOutcome,
  matchedVia,
  matchedBandMetric = null,
  benchmarkValue,
  qualificationType,
}) {
  const cutoffGap = getCutoffGap({
    benchmarkValue,
    qualificationType,
    admissionsProfile,
    matchedBandMetric,
  });

  return {
    course_id: admissionsProfile.course.course_id,
    course_name: admissionsProfile.course.course_name,
    admission_profile_id: admissionsProfile.admission_profile_id,
    year_recorded: admissionsProfile.year_recorded,
    min_gpa: admissionsProfile.min_gpa,
    tenth_percentile_grades: admissionsProfile.tenth_percentile_grades,
    tenth_percentile_rp: admissionsProfile.tenth_percentile_rp,
    intake_size: admissionsProfile.intake_size,
    matched_via: matchedVia,
    benchmark_value: benchmarkValue,
    cutoff_gap: cutoffGap,
    band_metric: matchedBandMetric
      ? {
          band_metric_id: matchedBandMetric.band_metric_id,
          university_code: matchedBandMetric.university_code,
          qualification_type: matchedBandMetric.qualification_type,
          metric_type: matchedBandMetric.metric_type,
          scope_type: matchedBandMetric.scope_type,
          band_label: matchedBandMetric.band_label,
          band_min: matchedBandMetric.band_min,
          band_max: matchedBandMetric.band_max,
          percentage_value: matchedBandMetric.percentage_value,
          display_order: matchedBandMetric.display_order,
          source_note: matchedBandMetric.source_note,
        }
      : null,
    ges: latestOutcome
      ? {
          source_year: latestOutcome.source_year,
          basic_monthly_median: latestOutcome.basic_monthly_median,
          employment_rate_ft_perm: latestOutcome.employment_rate_ft_perm,
          employment_rate_overall: latestOutcome.employment_rate_overall,
        }
      : null,
  };
}

module.exports.updateTenthPercentileRp = async function updateTenthPercentileRp(courseId = null) {
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
    const computedRp = calculateLegacyRpFromGradeProfile(profile.tenth_percentile_grades);

    if (computedRp === null) {
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
        tenth_percentile_rp: computedRp,
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

module.exports.getEligibleCoursesForUser = async function getEligibleCoursesForUser(userId, difference = DEFAULT_DIFFERENCE, limit = null, uniCode = null) {
  const parsedUserId = parseInt(userId, 10);
  const parsedDifference = Number(difference ?? DEFAULT_DIFFERENCE);
  const parsedLimit =
    limit === null || limit === undefined || limit === ""
      ? null
      : Number(limit);
  const normalizedUniCode = uniCode ? String(uniCode).trim().toUpperCase() : null;

  if (Number.isNaN(parsedUserId)) {
    throw new Error("Invalid userId");
  }

  if (Number.isNaN(parsedDifference)) {
    throw new Error("Invalid difference");
  }

  if (parsedLimit !== null && Number.isNaN(parsedLimit)) {
    throw new Error("Invalid limit");
  }

  const academicProfiles = await prisma.userAcademicProfile.findMany({
    where: {
      user_id: parsedUserId,
    },
    orderBy: {
      created_at: "desc",
    },
  });

  const relevantProfiles = academicProfiles.filter(
    (profile) =>
      isPolyQualification(profile.qualification_type) ||
      isJcQualification(profile.qualification_type)
  );

  const results = [];

  for (const profile of relevantProfiles) {
    const benchmarkValue = getAcademicValue(profile);

    if (benchmarkValue === null) {
      results.push({
        academic_profile_id: profile.academic_profile_id,
        qualification_type: profile.qualification_type,
        benchmark_value: null,
        difference_used: parsedDifference,
        uni_code: normalizedUniCode,
        courses: [],
      });
      continue;
    }

    const maxAllowedCutoff = benchmarkValue + parsedDifference;

    const admissionsWhereClause = {
      ...(normalizedUniCode
        ? {
            course: {
              university: {
                short_name: normalizedUniCode,
              },
            },
          }
        : {}),
      ...(isPolyQualification(profile.qualification_type)
        ? {
            min_gpa: {
              not: null,
              lte: maxAllowedCutoff,
            },
          }
        : {
            tenth_percentile_rp: {
              not: null,
              lte: maxAllowedCutoff,
            },
          }),
    };

    const directMatches = await prisma.courseAdmissionsProfile.findMany({
      where: admissionsWhereClause,
      include: {
        course: {
          select: {
            course_id: true,
            course_name: true,
            university: {
              select: {
                short_name: true,
              },
            },
            outcomes: {
              orderBy: {
                source_year: "desc",
              },
              take: 1,
              select: {
                source_year: true,
                basic_monthly_median: true,
                employment_rate_ft_perm: true,
                employment_rate_overall: true,
              },
            },
          },
        },
      },
    });

    const bandQualificationType = isPolyQualification(profile.qualification_type)
      ? "poly_gpa"
      : "a_level_uas";

    const bandCandidates = await prisma.courseAdmissionsBandMetric.findMany({
      where: {
        qualification_type: bandQualificationType,
        percentage_value: {
          not: null,
          gt: 80,
        },
        ...(normalizedUniCode
          ? {
              admission_profile: {
                course: {
                  university: {
                    short_name: normalizedUniCode,
                  },
                },
              },
            }
          : {}),
      },
      include: {
        admission_profile: {
          include: {
            course: {
              select: {
                course_id: true,
                course_name: true,
                university: {
                  select: {
                    short_name: true,
                  },
                },
                outcomes: {
                  orderBy: {
                    source_year: "desc",
                  },
                  take: 1,
                  select: {
                    source_year: true,
                    basic_monthly_median: true,
                    employment_rate_ft_perm: true,
                    employment_rate_overall: true,
                  },
                },
              },
            },
          },
        },
      },
      orderBy: [
        { percentage_value: "desc" },
        { display_order: "asc" },
      ],
    });

    const filteredBandMatches = bandCandidates.filter((row) =>
      isValueWithinBand(benchmarkValue, row.band_min, row.band_max)
    );

    const deduped = new Map();

    for (const admissionsProfile of directMatches) {
      const latestOutcome = admissionsProfile.course.outcomes[0] || null;

      deduped.set(
        admissionsProfile.course.course_id,
        buildCourseResult({
          admissionsProfile,
          latestOutcome,
          matchedVia: "direct_igp",
          matchedBandMetric: null,
          benchmarkValue,
          qualificationType: profile.qualification_type,
        })
      );
    }

    for (const bandMetric of filteredBandMatches) {
      const admissionsProfile = bandMetric.admission_profile;
      const latestOutcome = admissionsProfile.course.outcomes[0] || null;

      const existing = deduped.get(admissionsProfile.course.course_id);

      const result = buildCourseResult({
        admissionsProfile,
        latestOutcome,
        matchedVia: "band_metric",
        matchedBandMetric: bandMetric,
        benchmarkValue,
        qualificationType: profile.qualification_type,
      });

      if (!existing) {
        deduped.set(admissionsProfile.course.course_id, result);
      } else {
        deduped.set(admissionsProfile.course.course_id, {
          ...existing,
          matched_via: "direct_igp_and_band_metric",
          band_metric: result.band_metric,
          cutoff_gap:
            existing.cutoff_gap === null || result.cutoff_gap === null
              ? existing.cutoff_gap ?? result.cutoff_gap
              : Math.min(existing.cutoff_gap, result.cutoff_gap),
        });
      }
    }

    let rankedCourses = Array.from(deduped.values()).sort((a, b) => {
      const aGap = a.cutoff_gap === null ? Number.POSITIVE_INFINITY : Number(a.cutoff_gap);
      const bGap = b.cutoff_gap === null ? Number.POSITIVE_INFINITY : Number(b.cutoff_gap);

      if (aGap !== bGap) {
        return aGap - bGap; // ascending cutoff gap
      }

      const bBand = b.band_metric?.percentage_value ? Number(b.band_metric.percentage_value) : -1;
      const aBand = a.band_metric?.percentage_value ? Number(a.band_metric.percentage_value) : -1;

      if (bBand !== aBand) {
        return bBand - aBand;
      }

      const bSalary = b.ges?.basic_monthly_median ? Number(b.ges.basic_monthly_median) : -1;
      const aSalary = a.ges?.basic_monthly_median ? Number(a.ges.basic_monthly_median) : -1;

      return bSalary - aSalary;
    });

    if (parsedLimit !== null) {
      rankedCourses = rankedCourses.slice(0, parsedLimit);
    }

    results.push({
      academic_profile_id: profile.academic_profile_id,
      qualification_type: profile.qualification_type,
      benchmark_value: benchmarkValue,
      difference_used: parsedDifference,
      uni_code: normalizedUniCode,
      courses: rankedCourses,
    });
  }

  return {
    user_id: parsedUserId,
    default_difference: DEFAULT_DIFFERENCE,
    results,
  };
};