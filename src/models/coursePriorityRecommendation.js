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
const POSITIVE_INTEREST_ZONE_WEIGHTS = {
  high: 1.0,
  medium: 0.5,
  low: 0.2,
};

const NEGATIVE_INTEREST_ZONE_WEIGHTS = {
  high_unwanted: 1.0,
  medium_unwanted: 0.5,
  low_unwanted: 0.2,
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

function parseBoolean(value, defaultValue = false) {
  if (value === null || value === undefined || value === "") {
    return defaultValue;
  }

  if (typeof value === "boolean") {
    return value;
  }

  const normalized = String(value).trim().toLowerCase();

  if (["true", "1", "yes", "y", "on"].includes(normalized)) {
    return true;
  }

  if (["false", "0", "no", "n", "off"].includes(normalized)) {
    return false;
  }

  return defaultValue;
}

function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max);
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

  const highUnwanted = parseInterestList(query.high_unwanted_interests).map(normalizeInterestName);
  const mediumUnwanted = parseInterestList(query.medium_unwanted_interests).map(normalizeInterestName);
  const lowUnwanted = parseInterestList(query.low_unwanted_interests).map(normalizeInterestName);

  return {
    high: [...new Set(high)],
    medium: [...new Set(medium)],
    low: [...new Set(low)],
    high_unwanted: [...new Set(highUnwanted)],
    medium_unwanted: [...new Set(mediumUnwanted)],
    low_unwanted: [...new Set(lowUnwanted)],
  };
}

function getAllSelectedInterests(interestProfile) {
  return [
    ...interestProfile.high,
    ...interestProfile.medium,
    ...interestProfile.low,
    ...interestProfile.high_unwanted,
    ...interestProfile.medium_unwanted,
    ...interestProfile.low_unwanted,
  ];
}

function getAllWantedInterests(interestProfile) {
  return [
    ...interestProfile.high,
    ...interestProfile.medium,
    ...interestProfile.low,
  ];
}

function getAllUnwantedInterests(interestProfile) {
  return [
    ...interestProfile.high_unwanted,
    ...interestProfile.medium_unwanted,
    ...interestProfile.low_unwanted,
  ];
}

function validateInterestProfile(interestProfile, priorityOrder, options = {}) {
  const selectedInterests = getAllSelectedInterests(interestProfile);
  const wantedInterests = getAllWantedInterests(interestProfile);
  const unWantedInterests = getAllUnwantedInterests(interestProfile);
  const includesInterestPriority = priorityOrder.includes("interest");
  const excludeUnwantedInterests = Boolean(options.excludeUnwantedInterests);
  const onlyWantedInterests = Boolean(options.onlyWantedInterests);

  if (includesInterestPriority && (selectedInterests.length===0&&unWantedInterests.length=== 0)) {
    throw new Error(
      "interest_priority was provided but no interests were supplied. Pass high_interests, medium_interests, low_interests, or the unwanted interest fields."
    );
  }

  if (onlyWantedInterests && wantedInterests.length === 0) {
    throw new Error(
      "only_wanted_interests=true requires at least one wanted interest in high_interests, medium_interests, or low_interests."
    );
  }

  if (excludeUnwantedInterests && onlyWantedInterests) {
    throw new Error(
      "exclude_unwanted_interests and only_wanted_interests cannot both be true at the same time."
    );
  }

  const zoneByInterest = new Map();
  const allZones = [
    "high",
    "medium",
    "low",
    "high_unwanted",
    "medium_unwanted",
    "low_unwanted",
  ];

  for (const zone of allZones) {
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
  let totalScore = 0;
  let totalPossibleScore = 0;

  for (const metricKey of priorityOrder) {
    const metricConfig = PRIORITY_METRICS[metricKey];
    const rawValue = metricConfig.getValue(course);
    const normalizedScore = getNormalizedMetricScore(course, metricKey, metricStats);
    const weight = Number((priorityWeights[metricKey] ?? 0).toFixed(4));
    const stats = metricStats[metricKey];

    const contribution =
      normalizedScore === null || normalizedScore === undefined
        ? 0
        : Number((normalizedScore * weight).toFixed(4));

    const contributionMax = Number((100 * weight).toFixed(4));

    totalScore += contribution;
    totalPossibleScore += contributionMax;

    metrics[metricKey] = {
      label: metricConfig.label,
      raw_value: rawValue,
      normalized_score: normalizedScore,
      weight,
      weighted_contribution: contribution,
      weighted_contribution_display: `${contribution.toFixed(2)} / ${contributionMax.toFixed(2)}`,
      normalization_context:
        metricConfig.normalization === "dynamic_minmax" && stats
          ? {
              min: stats.min,
              max: stats.max,
            }
          : null,
    };

    if (metricKey === "interest" && course.interest_fit) {
      metrics[metricKey].zones = course.interest_fit.zones;
      metrics[metricKey].matched_interest_count = course.interest_fit.matched_interest_count;
      metrics[metricKey].wanted_score = course.interest_fit.wanted_score;
      metrics[metricKey].unwanted_penalty = course.interest_fit.unwanted_penalty;
      metrics[metricKey].excluded_due_to_unwanted = course.interest_fit.excluded_due_to_unwanted;
      metrics[metricKey].excluded_unwanted_matches = course.interest_fit.excluded_unwanted_matches;
      metrics[metricKey].excluded_due_to_only_wanted = course.interest_fit.excluded_due_to_only_wanted;
      metrics[metricKey].wanted_matches = course.interest_fit.wanted_matches;
    }
  }

  totalScore = Number(totalScore.toFixed(4));
  totalPossibleScore = Number(totalPossibleScore.toFixed(4));

  return {
    ...course,
    total_score: totalScore,
    total_score_display: `${totalScore.toFixed(2)} / ${totalPossibleScore.toFixed(2)}`,
    priority_score: totalScore,
    priority_score_display: `${totalScore.toFixed(2)} / ${totalPossibleScore.toFixed(2)}`,
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

async function attachInterestScoresToCourses(
  courses,
  interestProfile,
  options = {}
) {
  const excludeUnwantedInterests = Boolean(options.excludeUnwantedInterests);
  const onlyWantedInterests = Boolean(options.onlyWantedInterests);
  const selectedInterests = getAllSelectedInterests(interestProfile);

  if (!Array.isArray(courses) || courses.length === 0 || selectedInterests.length === 0) {
    return {
      courses,
      excluded_courses: [],
    };
  }

  const courseIds = courses
    .map((course) => toNumber(course.course_id))
    .filter((value) => value !== null);

  if (courseIds.length === 0) {
    return {
      courses,
      excluded_courses: [],
    };
  }

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
    return {
      courses: courses.map((course) => ({
        ...course,
        interest_fit: {
          score: 0,
          wanted_score: 0,
          unwanted_penalty: 0,
          matched_interest_count: 0,
          excluded_due_to_unwanted: false,
          excluded_unwanted_matches: [],
          excluded_due_to_only_wanted: false,
          wanted_matches: [],
          zones: {
            high: [],
            medium: [],
            low: [],
            high_unwanted: [],
            medium_unwanted: [],
            low_unwanted: [],
          },
        },
      })),
      excluded_courses: [],
    };
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

  const enrichedCourses = [];
  const excludedCourses = [];

  for (const course of courses) {
    let wantedWeightedScoreSum = 0;
    let wantedTotalPossibleWeight = 0;
    let unwantedWeightedPenaltySum = 0;
    let unwantedTotalPossibleWeight = 0;
    let matchedInterestCount = 0;

    const zoneDebug = {
      high: [],
      medium: [],
      low: [],
      high_unwanted: [],
      medium_unwanted: [],
      low_unwanted: [],
    };

    const excludedUnwantedMatches = [];
    const wantedMatches = [];

    for (const zone of ["high", "medium", "low"]) {
      const zoneWeight = POSITIVE_INTEREST_ZONE_WEIGHTS[zone];
      const zoneInterests = interestProfile[zone];

      for (const interestName of zoneInterests) {
        const interestGroupId = interestGroupMap.get(interestName);
        const relevanceScore = interestGroupId
          ? courseInterestMap.get(`${course.course_id}:${interestGroupId}`) ?? 0
          : 0;

        const matchScore = calculateSingleInterestMatchScore(relevanceScore);

        wantedTotalPossibleWeight += zoneWeight;
        wantedWeightedScoreSum += matchScore * zoneWeight;

        if (relevanceScore > 0) {
          matchedInterestCount += 1;
          wantedMatches.push({
            interest_name: interestName,
            relevance_score: relevanceScore,
            match_score: matchScore,
            zone_weight: zoneWeight,
            zone,
          });
        }

        zoneDebug[zone].push({
          interest_name: interestName,
          relevance_score: relevanceScore,
          match_score: matchScore,
          zone_weight: zoneWeight,
        });
      }
    }

    for (const zone of ["high_unwanted", "medium_unwanted", "low_unwanted"]) {
      const zoneWeight = NEGATIVE_INTEREST_ZONE_WEIGHTS[zone];
      const zoneInterests = interestProfile[zone];

      for (const interestName of zoneInterests) {
        const interestGroupId = interestGroupMap.get(interestName);
        const relevanceScore = interestGroupId
          ? courseInterestMap.get(`${course.course_id}:${interestGroupId}`) ?? 0
          : 0;

        const matchScore = calculateSingleInterestMatchScore(relevanceScore);

        unwantedTotalPossibleWeight += zoneWeight;
        unwantedWeightedPenaltySum += matchScore * zoneWeight;

        if (relevanceScore > 0) {
          excludedUnwantedMatches.push({
            interest_name: interestName,
            relevance_score: relevanceScore,
            match_score: matchScore,
            zone_weight: zoneWeight,
            zone,
          });
        }

        zoneDebug[zone].push({
          interest_name: interestName,
          relevance_score: relevanceScore,
          match_score: matchScore,
          zone_weight: zoneWeight,
        });
      }
    }

    const wantedScore =
      wantedTotalPossibleWeight > 0
        ? Number((wantedWeightedScoreSum / wantedTotalPossibleWeight).toFixed(4))
        : 0;

    const unwantedPenalty =
      unwantedTotalPossibleWeight > 0
        ? Number((unwantedWeightedPenaltySum / unwantedTotalPossibleWeight).toFixed(4))
        : 0;

    const finalInterestScore = Number(
      clamp(wantedScore - unwantedPenalty, 0, 100).toFixed(4)
    );

    const excludedDueToUnwanted =
      excludeUnwantedInterests && excludedUnwantedMatches.length > 0;

    const excludedDueToOnlyWanted =
      onlyWantedInterests && wantedMatches.length === 0;

    const enrichedCourse = {
      ...course,
      interest_fit: {
        score: finalInterestScore,
        wanted_score: wantedScore,
        unwanted_penalty: unwantedPenalty,
        matched_interest_count: matchedInterestCount,
        excluded_due_to_unwanted: excludedDueToUnwanted,
        excluded_unwanted_matches: excludedUnwantedMatches,
        excluded_due_to_only_wanted: excludedDueToOnlyWanted,
        wanted_matches: wantedMatches,
        zones: zoneDebug,
      },
    };

    if (excludedDueToUnwanted || excludedDueToOnlyWanted) {
      excludedCourses.push(enrichedCourse);
    } else {
      enrichedCourses.push(enrichedCourse);
    }
  }

  return {
    courses: enrichedCourses,
    excluded_courses: excludedCourses,
  };
}

function sortCoursesByWeightedPriority(courses, priorityOrder) {
  if (priorityOrder.length === 0) {
    return courses.map((course, index) => ({
      ...course,
      rank_number: index + 1,
    }));
  }

  const priorityWeights = buildPriorityWeights(priorityOrder);
  const metricStats = buildMetricStats(courses, priorityOrder);

  const enrichedCourses = courses.map((course) =>
    attachPriorityDebug(course, priorityOrder, priorityWeights, metricStats)
  );

  enrichedCourses.sort((a, b) => {
    const aScore = a.total_score ?? a.priority_score ?? -1;
    const bScore = b.total_score ?? b.priority_score ?? -1;

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

    const aHighMatches =
      a?.interest_fit?.zones?.high?.filter((x) => x.relevance_score > 0).length ?? 0;
    const bHighMatches =
      b?.interest_fit?.zones?.high?.filter((x) => x.relevance_score > 0).length ?? 0;

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

  return enrichedCourses.map((course, index) => ({
    ...course,
    rank_number: index + 1,
  }));
}

module.exports.getRankedEligibleCoursesForUser = async function getRankedEligibleCoursesForUser(
  queryParams
) {
  const {
    userId,
    difference = 0,
    limit = null,
    uni_code = null,
    band_min_percentage = 80,
    exclude_unwanted_interests = false,
    only_wanted_interests = false,
  } = queryParams;

  const priorityOrder = buildPriorityOrderFromQuery(queryParams);
  validatePriorityOrder(priorityOrder);

  const excludeUnwantedInterests = parseBoolean(exclude_unwanted_interests, false);
  const onlyWantedInterests = parseBoolean(only_wanted_interests, false);

  const interestProfile = buildInterestProfileFromQuery(queryParams);
  validateInterestProfile(interestProfile, priorityOrder, {
    excludeUnwantedInterests,
    onlyWantedInterests,
  });

  const savedPreferredUniversities = await getSavedPreferredUniversities(userId);
  validatePrestigeUsage(priorityOrder, uni_code, savedPreferredUniversities);

  const eligibleData = await getEligibleCoursesForUser(
    userId,
    difference,
    limit,
    uni_code,
    band_min_percentage
  );

  const rankedResults = [];

  for (const profileResult of eligibleData.results) {
    const originalCourses = Array.isArray(profileResult.courses)
      ? profileResult.courses
      : [];

    let enrichedCourses = originalCourses;
    let excludedCourses = [];

    if (priorityOrder.includes("interest")) {
      const interestProcessingResult = await attachInterestScoresToCourses(
        originalCourses,
        interestProfile,
        {
          excludeUnwantedInterests,
          onlyWantedInterests,
        }
      );

      enrichedCourses = interestProcessingResult.courses;
      excludedCourses = interestProcessingResult.excluded_courses;
    }

    const rankedCourses =
      priorityOrder.length > 0
        ? sortCoursesByWeightedPriority(enrichedCourses, priorityOrder)
        : enrichedCourses.map((course, index) => ({
            ...course,
            rank_number: index + 1,
          }));

    rankedResults.push({
      ...profileResult,
      applied_priority_order: priorityOrder,
      applied_priority_weights: buildPriorityWeights(priorityOrder),
      applied_interest_profile: interestProfile,
      exclude_unwanted_interests: excludeUnwantedInterests,
      only_wanted_interests: onlyWantedInterests,
      saved_preferred_universities: savedPreferredUniversities,
      total_eligible_courses: originalCourses.length,
      total_courses_after_interest_filter: rankedCourses.length,
      total_excluded_due_to_unwanted: excludeUnwantedInterests
        ? excludedCourses.filter((course) => course?.interest_fit?.excluded_due_to_unwanted).length
        : 0,
      total_excluded_due_to_only_wanted: onlyWantedInterests
        ? excludedCourses.filter((course) => course?.interest_fit?.excluded_due_to_only_wanted).length
        : 0,
      excluded_courses_due_to_unwanted: excludeUnwantedInterests
        ? excludedCourses.filter((course) => course?.interest_fit?.excluded_due_to_unwanted)
        : [],
      excluded_courses_due_to_only_wanted: onlyWantedInterests
        ? excludedCourses.filter((course) => course?.interest_fit?.excluded_due_to_only_wanted)
        : [],
      courses: rankedCourses,
    });
  }

  return {
    ...eligibleData,
    available_priority_metrics: Object.keys(PRIORITY_METRICS),
    available_interest_zones: [
      ...Object.keys(POSITIVE_INTEREST_ZONE_WEIGHTS),
      ...Object.keys(NEGATIVE_INTEREST_ZONE_WEIGHTS),
    ],
    positive_interest_zone_weights: POSITIVE_INTEREST_ZONE_WEIGHTS,
    negative_interest_zone_weights: NEGATIVE_INTEREST_ZONE_WEIGHTS,
    prestige_score_map: BASE_PRESTIGE_SCORES,
    results: rankedResults,
  };
};