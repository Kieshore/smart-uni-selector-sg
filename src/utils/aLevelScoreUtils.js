const H2_POINTS_90 = {
  A: 20,
  B: 17.5,
  C: 15,
  D: 12.5,
  E: 10,
  S: 5,
  U: 0,
};

const H1_POINTS_90 = {
  A: 10,
  B: 8.75,
  C: 7.5,
  D: 6.25,
  E: 5,
  S: 2.5,
  U: 0,
};

// Kept for clarity / future use
const H2_POINTS_70 = {
  A: 20,
  B: 17.5,
  C: 15,
  D: 12.5,
  E: 10,
  S: 5,
  U: 0,
};

const GP_POINTS_70 = {
  A: 10,
  B: 8.75,
  C: 7.5,
  D: 6.25,
  E: 5,
  S: 2.5,
  U: 0,
};

const H1_CONTENT_POINTS_70 = {
  A: 10,
  B: 8.75,
  C: 7.5,
  D: 6.25,
  E: 5,
  S: 2.5,
  U: 0,
};

function toNumber(value) {
  if (value === null || value === undefined || value === "") {
    return null;
  }

  const parsed = Number(value);
  return Number.isNaN(parsed) ? null : parsed;
}

function parseGradeProfile(profile) {
  if (!profile || typeof profile !== "string") {
    return null;
  }

  const cleaned = profile.replace(/\s+/g, "").toUpperCase();
  const parts = cleaned.split("/");

  if (parts.length !== 2) {
    return null;
  }

  const h2Part = parts[0];
  const h1Part = parts[1];

  if (h2Part.length !== 3 || h1Part.length !== 1) {
    return null;
  }

  const valid = ["A", "B", "C", "D", "E", "S", "U"];
  const h2Grades = h2Part.split("");
  const h1Grade = h1Part;

  if (!h2Grades.every((g) => valid.includes(g)) || !valid.includes(h1Grade)) {
    return null;
  }

  return { h2Grades, h1Grade };
}

// Legacy 90-scale approximation for stored IGP grade-profile rows like AAA/A
function calculateLegacyRp90FromGradeProfile(profile) {
  const parsed = parseGradeProfile(profile);
  if (!parsed) return null;

  const { h2Grades, h1Grade } = parsed;

  const h2Total = h2Grades.reduce((sum, grade) => sum + H2_POINTS_90[grade], 0);
  const h1Total = H1_POINTS_90[h1Grade];

  // Current compatibility assumption for old-style published IGP rows:
  // GP = C and PW = C
  const gpAssumedC = H1_POINTS_90.C;
  const pwAssumedC = H1_POINTS_90.C;

  return Number((h2Total + h1Total + gpAssumedC + pwAssumedC).toFixed(2));
}

// Convert legacy 90-scale score to revised 70-scale equivalent
function convertLegacy90ToUas70(score90) {
  const parsed = toNumber(score90);
  if (parsed === null) return null;

  return Number(((parsed / 90) * 70).toFixed(2));
}

// Convenience function for admissions-profile grade strings
function calculateBothFromGradeProfile(profile) {
  const legacy90 = calculateLegacyRp90FromGradeProfile(profile);
  const uas70 = convertLegacy90ToUas70(legacy90);

  return {
    legacy90,
    uas70,
  };
}

/**
 * USER-SIDE HELPERS
 *
 * If graduation_year <= 2024:
 * - treat stored rank_points as legacy-compatible 90-scale
 * - derive 70-scale by /90 * 70
 *
 * If graduation_year >= 2025:
 * - treat stored rank_points as already being the new 70-scale UAS
 *
 * This avoids needing another Prisma field for now.
 */
function getUserAlevelScoresFromProfile(profile) {
  if (!profile) {
    return {
      legacy90: null,
      uas70: null,
      scoreMode: null,
    };
  }

  const graduationYear = toNumber(profile.graduation_year);
  const storedRankPoints = toNumber(profile.rank_points);

  if (storedRankPoints === null) {
    return {
      legacy90: null,
      uas70: null,
      scoreMode: null,
    };
  }

  if (graduationYear !== null && graduationYear <= 2024) {
    return {
      legacy90: storedRankPoints,
      uas70: convertLegacy90ToUas70(storedRankPoints),
      scoreMode: "legacy90_to_uas70",
    };
  }

  return {
    legacy90: null,
    uas70: storedRankPoints,
    scoreMode: "uas70_direct",
  };
}

/**
 * For direct AU-style matching (NUS / NTU / SMU):
 * use revised 70-scale
 */
function getUserDirectComparableScore(profile) {
  const scores = getUserAlevelScoresFromProfile(profile);
  return scores.uas70;
}

/**
 * For current SIT / SUSS band matching:
 * use legacy-compatible score if available
 *
 * If the profile is 2025+ and only has 70-scale stored,
 * we currently return null rather than guessing a reverse conversion.
 * This is safer and avoids hidden discrepancies.
 */
function getUserLegacyBandComparableScore(profile) {
  const scores = getUserAlevelScoresFromProfile(profile);
  return scores.legacy90;
}

/**
 * Helper for direct course admissions profile comparison:
 * prefers uas70 if available, otherwise falls back to legacy90 conversion result
 */
function getComparableAdmissionsScore(admissionsProfile) {
  if (!admissionsProfile) {
    return {
      legacy90: null,
      uas70: null,
    };
  }

  return {
    legacy90: toNumber(admissionsProfile.tenth_percentile_rp),
    uas70: toNumber(admissionsProfile.tenth_percentile_uas_70),
  };
}

module.exports = {
  parseGradeProfile,
  calculateLegacyRp90FromGradeProfile,
  convertLegacy90ToUas70,
  calculateBothFromGradeProfile,
  toNumber,
  getUserAlevelScores: getUserAlevelScoresFromProfile,
  getUserDirectComparableScore,
  getUserLegacyBandComparableScore,
  getComparableAdmissionsScore,
};