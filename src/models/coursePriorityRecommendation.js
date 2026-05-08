const prisma = require("../lib/prisma");
const { getEligibleCoursesForUser } = require("./courseRecommendationIGP");

/**
 * Compressed fixed prestige scores.
 * These are INTERNAL APP HEURISTICS, not objective truth.
 * Important: prestige should NOT be min-max normalized against the current result set.
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
 * Metric registry.
 *
 * normalization:
 * - "dynamic_minmax" => normalize based on values inside current eligible result set
 * - "fixed_direct"   => use the raw metric value directly as a 0-100 style score
 */
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

/**
 * Dynamic weights:
 * 3 priorities => 3/6, 2/6, 1/6
 * 2 priorities => 2/3, 1/3
 */
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

    // Tie-break by raw values according to priority order
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

    // Final fallback: closer admissions cutoff first
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

  const savedPreferredUniversities = await getSavedPreferredUniversities(userId);
  validatePrestigeUsage(priorityOrder, uni_code, savedPreferredUniversities);

  const eligibleData = await getEligibleCoursesForUser(
    userId,
    difference,
    limit,
    uni_code
  );

  const rankedResults = eligibleData.results.map((profileResult) => {
    const originalCourses = Array.isArray(profileResult.courses)
      ? profileResult.courses
      : [];

    const rankedCourses =
      priorityOrder.length > 0
        ? sortCoursesByWeightedPriority(originalCourses, priorityOrder)
        : originalCourses;

    return {
      ...profileResult,
      applied_priority_order: priorityOrder,
      applied_priority_weights: buildPriorityWeights(priorityOrder),
      saved_preferred_universities: savedPreferredUniversities,
      total_eligible_courses: originalCourses.length,
      courses: rankedCourses,
    };
  });

  return {
    ...eligibleData,
    available_priority_metrics: Object.keys(PRIORITY_METRICS),
    prestige_score_map: BASE_PRESTIGE_SCORES,
    results: rankedResults,
  };
};