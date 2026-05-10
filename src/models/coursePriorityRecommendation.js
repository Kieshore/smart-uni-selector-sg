const prisma = require("../lib/prisma");
const { getEligibleCoursesForUser } = require("./courseRecommendationIGP");

/**
 * Compressed fixed prestige scores.
 * These are INTERNAL APP HEURISTICS, not objective truth.
 */
const BASE_PRESTIGE_SCORES = {
  NUS: 92,
  NTU: 89,
  SMU: 85,
  SUTD: 82,
  SIT: 78,
  SUSS: 75,
};

/**
 * Internal weights inside the INTEREST priority system.
 * This is separate from the outer priority weighting.
 */
const INTEREST_ZONE_WEIGHTS = {
  high: 1.0,
  medium: 0.5,
  low: 0.2,
};

const INTEREST_RELEVANCE_MAX = 3;

const PRIORITY_METRICS = {
  salary: {
    key: "salary",
    label: "Gross Monthly Median",
    higherIsBetter: true,
    normalization: "dynamic_minmax",
    getValue: (course) => {
      if (!course?.ges?.gross_monthly_median) return null;
      return Number(course.ges.gross_monthly_median);
    },
  },
  employability: {
    key: "employability",
    label: "Overall Employment Rate",
    higherIsBetter: true,
    normalization: "dynamic_minmax",
    getValue: (course) => {
      if (!course?.ges?.employment_rate_overall) return null;
      return Number(course.ges.employment_rate_overall);
    },
  },
  prestige: {
    key: "prestige",
    label: "University Prestige Score",
    higherIsBetter: true,
    normalization: "fixed_direct",
    getValue: (course) => {
      const universityCode = String(course?.university_code || "").toUpperCase();
      return BASE_PRESTIGE_SCORES[universityCode] ?? null;
    },
  },
  interest: {
    key: "interest",
    label: "Interest Fit Score",
    higherIsBetter: true,
    normalization: "fixed_direct",
    getValue: (course) => {
      if (!course?.interest_fit?.score && course?.interest_fit?.score !== 0) {
        return null;
      }
      return Number(course.interest_fit.score);
    },
  },
};

function toNumber(value) {
  if (value === null || value === undefined || value === "") {
    return null;
  }

  const parsed = Number(value);
  return Number.isNaN(parsed) ? null : parsed;
}

function normalizePreferredUniversities(value) {
  if (!value) {
    return [];
  }

  if (Array.isArray(value)) {
    return value
      .map((item) => String(item).trim().toUpperCase())
      .filter(Boolean);
  }

  if (typeof value === "string") {
    const cleaned = value.trim();
    return cleaned ? [cleaned.toUpperCase()] : [];
  }

  if (typeof value === "object") {
    return Object.values(value)
      .flatMap((item) => (Array.isArray(item) ? item : [item]))
      .map((item) => String(item).trim().toUpperCase())
      .filter(Boolean);
  }

  return [];
}

function parseInterestList(rawValue) {
  if (!rawValue) {
    return [];
  }

  if (Array.isArray(rawValue)) {
    return rawValue
      .flatMap((item) => String(item).split(","))
      .map((item) => item.trim())
      .filter(Boolean);
  }

  if (typeof rawValue === "string") {
    const trimmed = rawValue.trim();

    if (!trimmed) {
      return [];
    }

    // Support JSON array strings too
    if (trimmed.startsWith("[") && trimmed.endsWith("]")) {
      try {
        const parsed = JSON.parse(trimmed);
        if (Array.isArray(parsed)) {
          return parsed.map((item) => String(item).trim()).filter(Boolean);
        }
      } catch (error) {
        // fall back to comma split
      }
    }

    return trimmed
      .split(",")
      .map((item) => item.trim())
      .filter(Boolean);
  }

  return [];
}

function normalizeInterestName(name) {
  return String(name || "")
    .trim()
    .replace(/\s+/g, " ");
}

function buildInterestProfileFromQuery(query) {
  const high = parseInterestList(query.high_interests).map(normalizeInterestName);
  const medium = parseInterestList(query.medium_interests).map(normalizeInterestName);
  const low = parseInterestList(query.low_interests).map(normalizeInterestName);

  return {
    high: [...new Set(high)],
    medium: [...new Set(medium)],
    low: [...new Set(low)],
  };
}

function getAllSelectedInterests(interestProfile) {
  return [...interestProfile.high, ...interestProfile.medium, ...interestProfile.low];
}

function validateInterestProfile(interestProfile, priorityOrder) {
  const selectedInterests = getAllSelectedInterests(interestProfile);
  const includesInterestPriority = priorityOrder.includes("interest");

  if (includesInterestPriority && selectedInterests.length === 0) {
    throw new Error(
      "interest_priority was provided but no interests were supplied. Pass high_interests, medium_interests, or low_interests."
    );
  }

  const zoneByInterest = new Map();

  for (const zone of ["high", "medium", "low"]) {
    for (const interestName of interestProfile[zone]) {
      const existingZone = zoneByInterest.get(interestName);

      if (existingZone) {
        throw new Error(
          `Interest "${interestName}" appears in multiple zones (${existingZone} and ${zone}). Each interest must appear only once.`
        );
      }

      zoneByInterest.set(interestName, zone);
    }
  }
}

async function getSavedPreferredUniversities(userId) {
  const parsedUserId = toNumber(userId);

  if (parsedUserId === null) {
    return [];
  }

  const latestPreference = await prisma.userPreference.findFirst({
    where: {
      user_id: parsedUserId,
    },
    orderBy: {
      created_at: "desc",
    },
    select: {
      preferred_universities: true,
    },
  });

  return normalizePreferredUniversities(latestPreference?.preferred_universities);
}

function buildPriorityOrderFromQuery(query) {
  const found = [];

  for (const metricKey of Object.keys(PRIORITY_METRICS)) {
    const paramName = `${metricKey}_priority`;
    const priorityValue = toNumber(query[paramName]);

    if (priorityValue !== null) {
      found.push({
        metric: metricKey,
        priority: priorityValue,
      });
    }
  }

  found.sort((a, b) => a.priority - b.priority);

  return found.map((item) => item.metric);
}

function validatePriorityOrder(priorityOrder) {
  const seen = new Set();

  for (const metric of priorityOrder) {
    if (!PRIORITY_METRICS[metric]) {
      throw new Error(`Unsupported priority metric: ${metric}`);
    }

    if (seen.has(metric)) {
      throw new Error(`Duplicate priority metric: ${metric}`);
    }

    seen.add(metric);
  }
}

function validatePrestigeUsage(priorityOrder, explicitUniCode, savedPreferredUniversities) {
  const prestigeIncluded = priorityOrder.includes("prestige");

  if (!prestigeIncluded) {
    return;
  }

  const hasExplicitUniCode = Boolean(String(explicitUniCode || "").trim());
  const hasSavedUniversityPreference =
    Array.isArray(savedPreferredUniversities) && savedPreferredUniversities.length > 0;

  if (hasExplicitUniCode || hasSavedUniversityPreference) {
    throw new Error(
      "Prestige priority cannot be used when a university preference already exists. Remove uni_code or saved preferred_universities first."
    );
  }
}

function buildPriorityWeights(priorityOrder) {
  const n = priorityOrder.length;

  if (n === 0) {
    return {};
  }

  const denominator = (n * (n + 1)) / 2;
  const weights = {};

  priorityOrder.forEach((metricKey, index) => {
    const rankWeight = n - index;
    weights[metricKey] = rankWeight / denominator;
  });

  return weights;
}

function buildMetricStats(courses, priorityOrder) {
  const stats = {};

  for (const metricKey of priorityOrder) {
    const metricConfig = PRIORITY_METRICS[metricKey];

    if (metricConfig.normalization !== "dynamic_minmax") {
      stats[metricKey] = null;
      continue;
    }

    const values = courses
      .map((course) => metricConfig.getValue(course))
      .filter((value) => value !== null && value !== undefined);

    const min = values.length > 0 ? Math.min(...values) : null;
    const max = values.length > 0 ? Math.max(...values) : null;

    stats[metricKey] = {
      min,
      max,
    };
  }

  return stats;
}

function getNormalizedMetricScore(course, metricKey, metricStats) {
  const metricConfig = PRIORITY_METRICS[metricKey];
  const rawValue = metricConfig.getValue(course);

  if (rawValue === null || rawValue === undefined) {
    return null;
  }

  if (metricConfig.normalization === "fixed_direct") {
    return Number(rawValue.toFixed(4));
  }

  const stats = metricStats[metricKey];

  if (!stats || stats.min === null || stats.max === null) {
    return null;
  }

  if (stats.max === stats.min) {
    return 100;
  }

  let normalized =
    ((rawValue - stats.min) / (stats.max - stats.min)) * 100;

  if (!metricConfig.higherIsBetter) {
    normalized = 100 - normalized;
  }

  return Number(normalized.toFixed(4));
}

function calculateWeightedPriorityScore(course, priorityOrder, priorityWeights, metricStats) {
  if (priorityOrder.length === 0) {
    return null;
  }

  let totalScore = 0;

  for (const metricKey of priorityOrder) {
    const weight = priorityWeights[metricKey] ?? 0;
    const normalizedScore = getNormalizedMetricScore(course, metricKey, metricStats);

    totalScore += (normalizedScore ?? 0) * weight;
  }

  return Number(totalScore.toFixed(4));
}

function attachPriorityDebug(course, priorityOrder, priorityWeights, metricStats) {
  const metrics = {};

  for (const metricKey of priorityOrder) {
    const metricConfig = PRIORITY_METRICS[metricKey];
    const rawValue = metricConfig.getValue(course);
    const normalizedScore = getNormalizedMetricScore(course, metricKey, metricStats);

    metrics[metricKey] = {
      label: metricConfig.label,
      raw_value: rawValue,
      normalized_score: normalizedScore,
      weight: Number((priorityWeights[metricKey] ?? 0).toFixed(4)),
    };

    if (metricKey === "interest" && course.interest_fit) {
      metrics[metricKey].zones = course.interest_fit.zones;
      metrics[metricKey].matched_interest_count = course.interest_fit.matched_interest_count;
    }
  }

  return {
    ...course,
    priority_score: calculateWeightedPriorityScore(
      course,
      priorityOrder,
      priorityWeights,
      metricStats
    ),
    priority_metrics: metrics,
  };
}

function calculateSingleInterestMatchScore(relevanceScore) {
  const numericRelevance = toNumber(relevanceScore);

  if (numericRelevance === null || numericRelevance <= 0) {
    return 0;
  }

  return Number(((numericRelevance / INTEREST_RELEVANCE_MAX) * 100).toFixed(4));
}

async function attachInterestScoresToCourses(courses, interestProfile) {
  const selectedInterests = getAllSelectedInterests(interestProfile);

  if (!Array.isArray(courses) || courses.length === 0 || selectedInterests.length === 0) {
    return courses;
  }

  const courseIds = courses
    .map((course) => toNumber(course.course_id))
    .filter((value) => value !== null);

  if (courseIds.length === 0) {
    return courses;
  }

  // Adjust model names here only if your Prisma client uses different names
  const interestGroups = await prisma.interestGroup.findMany({
    where: {
      interest_name: {
        in: selectedInterests,
      },
    },
    select: {
      interest_group_id: true,
      interest_name: true,
    },
  });

  const interestGroupMap = new Map(
    interestGroups.map((group) => [group.interest_name, group.interest_group_id])
  );

  const selectedInterestGroupIds = interestGroups.map((group) => group.interest_group_id);

  if (selectedInterestGroupIds.length === 0) {
    return courses.map((course) => ({
      ...course,
      interest_fit: {
        score: 0,
        matched_interest_count: 0,
        zones: {
          high: [],
          medium: [],
          low: [],
        },
      },
    }));
  }

  const courseInterestRows = await prisma.courseRelatedInterest.findMany({
    where: {
      course_id: {
        in: courseIds,
      },
      interest_group_id: {
        in: selectedInterestGroupIds,
      },
    },
    select: {
      course_id: true,
      interest_group_id: true,
      relevance_score: true,
    },
  });

  const courseInterestMap = new Map();

  for (const row of courseInterestRows) {
    const key = `${row.course_id}:${row.interest_group_id}`;
    courseInterestMap.set(key, toNumber(row.relevance_score) ?? 0);
  }

  return courses.map((course) => {
    let weightedScoreSum = 0;
    let totalPossibleWeight = 0;
    let matchedInterestCount = 0;

    const zoneDebug = {
      high: [],
      medium: [],
      low: [],
    };

    for (const zone of ["high", "medium", "low"]) {
      const zoneWeight = INTEREST_ZONE_WEIGHTS[zone];
      const zoneInterests = interestProfile[zone];

      for (const interestName of zoneInterests) {
        const interestGroupId = interestGroupMap.get(interestName);
        const relevanceScore = interestGroupId
          ? courseInterestMap.get(`${course.course_id}:${interestGroupId}`) ?? 0
          : 0;

        const matchScore = calculateSingleInterestMatchScore(relevanceScore);

        totalPossibleWeight += zoneWeight;
        weightedScoreSum += matchScore * zoneWeight;

        if (relevanceScore > 0) {
          matchedInterestCount += 1;
        }

        zoneDebug[zone].push({
          interest_name: interestName,
          relevance_score: relevanceScore,
          match_score: matchScore,
          zone_weight: zoneWeight,
        });
      }
    }

    const finalInterestScore =
      totalPossibleWeight > 0 ? Number((weightedScoreSum / totalPossibleWeight).toFixed(4)) : 0;

    return {
      ...course,
      interest_fit: {
        score: finalInterestScore,
        matched_interest_count: matchedInterestCount,
        zones: zoneDebug,
      },
    };
  });
}

function sortCoursesByWeightedPriority(courses, priorityOrder) {
  if (priorityOrder.length === 0) {
    return courses;
  }

  const priorityWeights = buildPriorityWeights(priorityOrder);
  const metricStats = buildMetricStats(courses, priorityOrder);

  const enrichedCourses = courses.map((course) =>
    attachPriorityDebug(course, priorityOrder, priorityWeights, metricStats)
  );

  enrichedCourses.sort((a, b) => {
    const aScore = a.priority_score ?? -1;
    const bScore = b.priority_score ?? -1;

    if (bScore !== aScore) {
      return bScore - aScore;
    }

    for (const metricKey of priorityOrder) {
      const metricConfig = PRIORITY_METRICS[metricKey];
      const aValue = metricConfig.getValue(a);
      const bValue = metricConfig.getValue(b);

      if (aValue === null && bValue === null) continue;
      if (aValue === null) return 1;
      if (bValue === null) return -1;

      if (metricConfig.higherIsBetter) {
        if (bValue !== aValue) return bValue - aValue;
      } else {
        if (aValue !== bValue) return aValue - bValue;
      }
    }

    // Extra tie-break for interest priority if both scores are same
    const aHighMatches = a?.interest_fit?.zones?.high?.filter((x) => x.relevance_score > 0).length ?? 0;
    const bHighMatches = b?.interest_fit?.zones?.high?.filter((x) => x.relevance_score > 0).length ?? 0;

    if (bHighMatches !== aHighMatches) {
      return bHighMatches - aHighMatches;
    }

    const aGap =
      a.cutoff_gap === null || a.cutoff_gap === undefined
        ? Number.POSITIVE_INFINITY
        : Number(a.cutoff_gap);

    const bGap =
      b.cutoff_gap === null || b.cutoff_gap === undefined
        ? Number.POSITIVE_INFINITY
        : Number(b.cutoff_gap);

    return aGap - bGap;
  });

  return enrichedCourses;
}

module.exports.getRankedEligibleCoursesForUser = async function getRankedEligibleCoursesForUser(
  queryParams
) {
  const {
    userId,
    difference = 0,
    limit = null,
    uni_code = null,
  } = queryParams;

  const priorityOrder = buildPriorityOrderFromQuery(queryParams);
  validatePriorityOrder(priorityOrder);

  const interestProfile = buildInterestProfileFromQuery(queryParams);
  validateInterestProfile(interestProfile, priorityOrder);

  const savedPreferredUniversities = await getSavedPreferredUniversities(userId);
  validatePrestigeUsage(priorityOrder, uni_code, savedPreferredUniversities);

  const eligibleData = await getEligibleCoursesForUser(
    userId,
    difference,
    limit,
    uni_code
  );

  const rankedResults = [];

  for (const profileResult of eligibleData.results) {
    const originalCourses = Array.isArray(profileResult.courses)
      ? profileResult.courses
      : [];

    const enrichedCourses = priorityOrder.includes("interest")
      ? await attachInterestScoresToCourses(originalCourses, interestProfile)
      : originalCourses;

    const rankedCourses =
      priorityOrder.length > 0
        ? sortCoursesByWeightedPriority(enrichedCourses, priorityOrder)
        : enrichedCourses;

    rankedResults.push({
      ...profileResult,
      applied_priority_order: priorityOrder,
      applied_priority_weights: buildPriorityWeights(priorityOrder),
      applied_interest_profile: interestProfile,
      saved_preferred_universities: savedPreferredUniversities,
      total_eligible_courses: originalCourses.length,
      courses: rankedCourses,
    });
  }

  return {
    ...eligibleData,
    available_priority_metrics: Object.keys(PRIORITY_METRICS),
    available_interest_zones: Object.keys(INTEREST_ZONE_WEIGHTS),
    interest_zone_weights: INTEREST_ZONE_WEIGHTS,
    prestige_score_map: BASE_PRESTIGE_SCORES,
    results: rankedResults,
  };
};