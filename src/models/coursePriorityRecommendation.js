const { getEligibleCoursesForUser } = require("./courseRecommendationIGP");

const PRIORITY_METRICS = {
  salary: {
    key: "salary",
    label: "Gross Monthly Median",
    higherIsBetter: true,
    tolerance: 200,
    getValue: (course) => {
      if (!course?.ges?.gross_monthly_median) return null;
      return Number(course.ges.gross_monthly_median);
    },
  },
  employability: {
    key: "employability",
    label: "Overall Employment Rate",
    higherIsBetter: true,
    tolerance: 2,
    getValue: (course) => {
      if (!course?.ges?.employment_rate_overall) return null;
      return Number(course.ges.employment_rate_overall);
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

function compareCoursesByMetric(a, b, metricConfig) {
  const aValue = metricConfig.getValue(a);
  const bValue = metricConfig.getValue(b);

  if (aValue === null && bValue === null) return 0;
  if (aValue === null) return 1;
  if (bValue === null) return -1;

  if (metricConfig.higherIsBetter) {
    return bValue - aValue;
  }

  return aValue - bValue;
}

function sameTierByTolerance(a, b, metricConfig) {
  const aValue = metricConfig.getValue(a);
  const bValue = metricConfig.getValue(b);

  if (aValue === null && bValue === null) return true;
  if (aValue === null || bValue === null) return false;

  return Math.abs(aValue - bValue) <= metricConfig.tolerance;
}

function groupIntoTiers(sortedCourses, metricConfig) {
  if (sortedCourses.length === 0) {
    return [];
  }

  const tiers = [];
  let currentTier = [sortedCourses[0]];

  for (let i = 1; i < sortedCourses.length; i++) {
    const previousCourse = currentTier[currentTier.length - 1];
    const currentCourse = sortedCourses[i];

    if (sameTierByTolerance(previousCourse, currentCourse, metricConfig)) {
      currentTier.push(currentCourse);
    } else {
      tiers.push(currentTier);
      currentTier = [currentCourse];
    }
  }

  tiers.push(currentTier);
  return tiers;
}

function rankCoursesRecursively(courses, orderedMetrics, metricIndex = 0) {
  if (!Array.isArray(courses) || courses.length <= 1) {
    return courses;
  }

  if (metricIndex >= orderedMetrics.length) {
    return courses;
  }

  const metricKey = orderedMetrics[metricIndex];
  const metricConfig = PRIORITY_METRICS[metricKey];

  if (!metricConfig) {
    return rankCoursesRecursively(courses, orderedMetrics, metricIndex + 1);
  }

  const sorted = [...courses].sort((a, b) => compareCoursesByMetric(a, b, metricConfig));
  const tiers = groupIntoTiers(sorted, metricConfig);

  const finalOrdered = [];

  for (const tier of tiers) {
    const rankedTier = rankCoursesRecursively(tier, orderedMetrics, metricIndex + 1);
    finalOrdered.push(...rankedTier);
  }

  return finalOrdered;
}

function attachPriorityDebug(course, orderedMetrics) {
  const metrics = {};

  for (const metricKey of orderedMetrics) {
    const metricConfig = PRIORITY_METRICS[metricKey];

    metrics[metricKey] = {
      label: metricConfig.label,
      value: metricConfig.getValue(course),
      tolerance: metricConfig.tolerance,
    };
  }

  return {
    ...course,
    priority_metrics: metrics,
  };
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
        ? rankCoursesRecursively(originalCourses, priorityOrder)
        : originalCourses;

    const finalCourses =
      priorityOrder.length > 0
        ? rankedCourses.map((course) => attachPriorityDebug(course, priorityOrder))
        : rankedCourses;

    return {
      ...profileResult,
      applied_priority_order: priorityOrder,
      total_eligible_courses: originalCourses.length,
      courses: finalCourses,
    };
  });

  return {
    ...eligibleData,
    available_priority_metrics: Object.keys(PRIORITY_METRICS),
    results: rankedResults,
  };
};