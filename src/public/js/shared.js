const CURRENT_USER_ID = 2;

const STORAGE_KEYS = {
  interestsState: `findmyunisg_interests_${CURRENT_USER_ID}`,
  finderState: `findmyunisg_finder_${CURRENT_USER_ID}`,
  compareCourses: `findmyunisg_compare_${CURRENT_USER_ID}`,
};

const PRESTIGE_SCORES = {
  NUS: 92,
  NTU: 89,
  SMU: 85,
  SUTD: 82,
  SIT: 78,
  SUSS: 75,
};

const DEFAULT_INTEREST_STATE = {
  wanted: {
    high: [],
    medium: [],
    low: [],
  },
  unwanted: {
    high: [],
    medium: [],
    low: [],
  },
};

const DEFAULT_FINDER_STATE = {
  activeUni: "All",
  gpaBoost: "0.00",
  selectedUniversities: [],
  onlyWanted: false,
  excludeUnwanted: false,
  courseKeyword: "",
  priority: {
  1: ["prestige"],
  2: ["salary"],
  3: ["employability"],
  4: [],
},
};

function getStoredJson(key, fallback) {
  try {
    const stored = localStorage.getItem(key);
    return stored ? JSON.parse(stored) : structuredClone(fallback);
  } catch {
    return structuredClone(fallback);
  }
}

function setStoredJson(key, value) {
  localStorage.setItem(key, JSON.stringify(value));
}

function getInterestState() {
  return getStoredJson(STORAGE_KEYS.interestsState, DEFAULT_INTEREST_STATE);
}

function saveInterestState(value) {
  setStoredJson(STORAGE_KEYS.interestsState, value);
}

function normalizeInterestKey(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ");
}

function getWantedInterestSelections() {
  const interestState = getInterestState();

  return [
    ...interestState.wanted.high.map(name => ({
      name,
      tier: "high",
      label: "High interest",
    })),

    ...interestState.wanted.medium.map(name => ({
      name,
      tier: "medium",
      label: "Med interest",
    })),

    ...interestState.wanted.low.map(name => ({
      name,
      tier: "low",
      label: "Low interest",
    })),
  ];
}

function getCourseInterestRelevanceRows(course) {
  const sourceCourse = course?.raw || course;
  const selectedInterests = getWantedInterestSelections();

  const relevanceMap = new Map();

  const relatedInterests = sourceCourse?.related_interests || [];

  relatedInterests.forEach(row => {
    const interestName =
      row.interest_group?.interest_name ||
      row.interest_name ||
      row.name;

    if (!interestName) return;

    relevanceMap.set(
      normalizeInterestKey(interestName),
      Number(row.relevance_score || 0)
    );
  });

  const zones = sourceCourse?.interest_fit?.zones || {};

  ["high", "medium", "low", "high_unwanted", "medium_unwanted", "low_unwanted"].forEach(zone => {
    const rows = zones[zone] || [];

    rows.forEach(row => {
      if (!row.interest_name) return;

      relevanceMap.set(
        normalizeInterestKey(row.interest_name),
        Number(row.relevance_score || 0)
      );
    });
  });

  return selectedInterests.map(interest => ({
    ...interest,
    relevance_score: relevanceMap.get(normalizeInterestKey(interest.name)) ?? 0,
  }));
}

function getFinderState() {
  return getStoredJson(STORAGE_KEYS.finderState, DEFAULT_FINDER_STATE);
}

function saveFinderState(value) {
  setStoredJson(STORAGE_KEYS.finderState, value);
}

function debounce(fn, delay = 350) {
  let timeoutId;

  return (...args) => {
    clearTimeout(timeoutId);
    timeoutId = setTimeout(() => fn(...args), delay);
  };
}

function valueOrDash(value, suffix = "") {
  if (value === null || value === undefined || value === "") return "—";
  return `${value}${suffix}`;
}

function moneyOrDash(value) {
  if (value === null || value === undefined || value === "") return "—";
  return `$${Number(value).toLocaleString()}`;
}

function getPrestigeScore(uniCode) {
  return PRESTIGE_SCORES[String(uniCode || "").toUpperCase()] ?? null;
}

async function fetchJson(url, options = {}) {
  const response = await fetch(url, options);
  const json = await response.json();

  if (!response.ok) {
    throw new Error(json.error || json.message || "Request failed");
  }

  return json;
}

function saveCompareCourses(courses) {
  localStorage.setItem(
    STORAGE_KEYS.compareCourses,
    JSON.stringify(courses.filter(Boolean))
  );
}

function getCompareCourses() {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEYS.compareCourses) || "[]");
  } catch {
    return [];
  }
}

function normalizeCourseForCompare(course) {
  const admission = course.admissions?.[0] || {};
  const outcome = course.outcomes?.[0] || {};

  const maxInterestRelevance = course.related_interests?.length
    ? Math.max(...course.related_interests.map(item => Number(item.relevance_score || 0)))
    : null;

  return {
    course_id: course.course_id,
    course_name: course.course_name,
    university_code: course.university?.short_name || course.university_code,
    intake_size: course.intake_size ?? admission.intake_size ?? null,
    min_gpa: course.min_gpa ?? admission.min_gpa ?? null,
    tenth_percentile_rp: course.tenth_percentile_rp ?? admission.tenth_percentile_rp ?? null,
    tenth_percentile_uas_70: course.tenth_percentile_uas_70 ?? admission.tenth_percentile_uas_70 ?? null,
    cutoff_gap: course.cutoff_gap ?? null,
    salary:
      course.ges?.gross_monthly_median ??
      outcome.gross_monthly_median ??
      outcome.basic_monthly_median ??
      null,
    employability:
      course.ges?.employment_rate_overall ??
      outcome.employment_rate_overall ??
      null,
    interest_score: course.interest_fit?.score ?? maxInterestRelevance,
    matched_interest_count: course.interest_fit?.matched_interest_count ?? null,
    prestige: getPrestigeScore(course.university?.short_name || course.university_code),
    interest_relevance_rows: getCourseInterestRelevanceRows(course),
    raw: course,
  };
}