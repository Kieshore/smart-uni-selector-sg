const { execFile } = require("child_process");
const path = require("path");
const prisma = require("../lib/prisma");
require("dotenv").config();

function runPythonFetch() {
  return new Promise((resolve, reject) => {
    const scriptPath = path.resolve("src/scripts/GESdatafetch.py");

    execFile("py", [scriptPath], { maxBuffer: 20 * 1024 * 1024 }, (error, stdout, stderr) => {
      if (error) {
        reject(new Error(`Python fetch failed: ${stderr || error.message}`));
        return;
      }

      try {
        const parsed = JSON.parse(stdout);
        resolve(parsed);
      } catch (parseError) {
        reject(new Error(`Failed to parse Python JSON output: ${parseError.message}`));
      }
    });
  });
}

function cleanText(value) {
  if (!value) return "";
  return value
    .toLowerCase()
    .replace(/[\*\#\^]+/g, " ")
    .replace(/&/g, " and ")
    .replace(/[\/\-]/g, " ")
    .replace(/[,:]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function normalizeGenericCourseName(name) {
  if (!name) return "";

  let s = cleanText(name);

  // preserve generic NUS broad degrees before wrappers get stripped into blanks
  if (
    s === "bachelor of arts" ||
    s === "bachelor of arts hons" ||
    s === "bachelor of arts with honours" ||
    s === "bachelor of arts with honors"
  ) return "arts";

  if (
    s === "bachelor of science" ||
    s === "bachelor of science hons" ||
    s === "bachelor of science with honours" ||
    s === "bachelor of science with honors"
  ) return "science";

  if (
    s === "bachelor of business administration" ||
    s === "bachelor of business administration hons" ||
    s === "bachelor of business administration with honours" ||
    s === "bachelor of business administration with honors"
  ) return "business administration";

  // strip full degree wrappers first
  s = s.replace(/\bbachelor of engineering with honours in\b/g, "");
  s = s.replace(/\bbachelor of engineering with honors in\b/g, "");
  s = s.replace(/\bbachelor of science with honours in\b/g, "");
  s = s.replace(/\bbachelor of science with honors in\b/g, "");
  s = s.replace(/\bbachelor of science in\b/g, "");
  s = s.replace(/\bbachelor in science\b/g, "");
  s = s.replace(/\bbachelor of arts with honours in\b/g, "");
  s = s.replace(/\bbachelor of arts with honors in\b/g, "");
  s = s.replace(/\bbachelor of arts in\b/g, "");
  s = s.replace(/\bbachelor of fine arts in\b/g, "");
  s = s.replace(/\bbachelor of professional studies in\b/g, "");
  s = s.replace(/\bbachelor of business administration in\b/g, "");
  s = s.replace(/\bbachelor of business administration\b/g, "");
  s = s.replace(/\bbachelor of hospitality business with honours\b/g, "hospitality business");
  s = s.replace(/\bbachelor of hospitality business\b/g, "hospitality business");
  s = s.replace(/\bbachelor of law\b/g, "law");
  s = s.replace(/\bbachelor of laws\b/g, "law");
  s = s.replace(/\bbachelor of computing\b/g, "");
  s = s.replace(/\bbachelor of engineering\b/g, "");
  s = s.replace(/\bbachelor of science\b/g, "");
  s = s.replace(/\bbachelor of arts\b/g, "");
  s = s.replace(/\bbachelor in\b/g, "");
  s = s.replace(/\bbachelor of\b/g, "");
  s = s.replace(/\bbachelor\b/g, "");

  s = s.replace(/\bwith honours\b/g, "");
  s = s.replace(/\bwith honors\b/g, "");
  s = s.replace(/\bhonours\b/g, "");
  s = s.replace(/\bhonors\b/g, "");
  s = s.replace(/\bhons\b/g, "");

  s = s.replace(/\b\d+\s*yr\b/g, "");
  s = s.replace(/\b\d+\s*year\b/g, "");
  s = s.replace(/\b4 years\b/g, "");
  s = s.replace(/\b4 year\b/g, "");
  s = s.replace(/\bdirect honours programme\b/g, "");
  s = s.replace(/\bdirect honors programme\b/g, "");
  s = s.replace(/\bdirect programme\b/g, "");
  s = s.replace(/\bdirect program\b/g, "");
  s = s.replace(/\bprogramme\b/g, "");
  s = s.replace(/\bprogram\b/g, "");
  s = s.replace(/\bdirect\b/g, "");

  s = s.replace(/\bcum laude and above\b/g, "");
  s = s.replace(/\bcum laude\b/g, "");

  s = s.replace(/\bdouble degree in\b/g, "");
  s = s.replace(/\binter disciplinary\b/g, "interdisciplinary");
  s = s.replace(/\bmajor in\b/g, "");
  s = s.replace(/\bmajoring in\b/g, "");

  s = s.replace(/[()]/g, " ");
  s = s.replace(/[^a-z0-9\s]/g, " ");
  s = s.replace(/^\s*in\s+/g, "");
  s = s.replace(/\s+/g, " ").trim();

  return s;
}

function extractPreferredBracketContent(rawName, universityShortName) {
  if (!rawName) return null;

  const matches = [...rawName.matchAll(/\(([^)]+)\)/g)].map((m) => m[1].trim());
  if (!matches.length) return null;

  const genericBracketTerms = new Set([
    "hons",
    "honours",
    "honors",
    "mbbs",
    "llb",
    "l l b",
  ]);

  if (universityShortName === "NUS") {
    for (const item of matches) {
      const cleaned = cleanText(item);
      if (!cleaned) continue;
      if (genericBracketTerms.has(cleaned)) continue;
      return cleaned;
    }
  }

  return null;
}

function normalizeCourseNameForMatching(universityShortName, rawName) {
  const preferredBracket = extractPreferredBracketContent(rawName, universityShortName);

  if (preferredBracket) {
    return normalizeGenericCourseName(preferredBracket);
  }

  return normalizeGenericCourseName(rawName);
}

function applyKnownCourseRenames(universityShortName, normalizedName) {
  const knownRenames = {
    // NUS
    "NUS::information systems": "business artificial intelligence systems",
    "NUS::computer science": "computer science",
    "NUS::medicine and surgery": "medicine",
    "NUS::medicine and surgery mbbs": "medicine",
    "NUS::dental surgery": "dentistry",
    "NUS::law": "law",
    "NUS::laws": "law",
    "NUS::llb": "law",
    "NUS::l l b": "law",
    "NUS::business administration": "business administration",
    "NUS::accountancy": "business administration",
    "NUS::arts": "humanities and sciences",
    "NUS::science": "humanities and sciences",
    "NUS::social sciences": "humanities and sciences",
    "NUS::applied science": "humanities and sciences",
    "NUS::data science and analytics": "data science and economics",
    "NUS::chemical engineering": "engineering",
    "NUS::civil engineering": "engineering",
    "NUS::electrical engineering": "engineering",
    "NUS::engineering science": "engineering",
    "NUS::environmental engineering": "engineering",
    "NUS::industrial and systems engineering": "engineering",
    "NUS::materials science and engineering": "engineering",
    "NUS::mechanical engineering": "engineering",
    "NUS::bioengineering": "engineering",
    "NUS::biomedical engineering": "engineering",
    "NUS::project and facilities management": "engineering",
    "NUS::real estate": "engineering",
    "NUS::communications and media": "computer science",
    "NUS::electronic commerce": "computer science",
    "NUS::computational biology": "computer science",

    // NTU
    "NTU::mathematical science": "mathematical sciences",
    "NTU::mathematics and mathematical sciences": "mathematical sciences",
    "NTU::sports science and management": "sport science and management",
    "NTU::physics and applied physics": "physics applied physics",
    "NTU::physics applied physics": "physics applied physics",
    "NTU::environmental earth systems sciences": "environmental earth systems science",
    "NTU::arts with education": "arts academic discipline and education",
    "NTU::science with education": "science academic discipline and education",
    "NTU::biomedical science": "biological sciences",
    "NTU::biomedical sciences": "biological sciences",
    "NTU::biological and biomedical sciences": "biological sciences",
    "NTU::biomedical sciences and chinese medicine": "chinese medicine",
    "NTU::biomedical science traditional chinese medicine": "chinese medicine",
    "NTU::art design and media": "art design and media design art",
    "NTU::fine arts": "art design and media design art",
    "NTU::education": "arts academic discipline and education",

    // SMU
    "SMU::information systems management": "information systems",
    "SMU::accountancy 4 years": "accountancy",
    "SMU::business management 4 years": "business management",
    "SMU::economics 4 years": "economics",
    "SMU::social sciences 4 years": "social sciences",
    "SMU::law 4 years": "law",
    "SMU::information systems management 4 years": "information systems",

    // SIT
    "SIT::bachelor of early childhood education": "bachelor of early childhood education",
    "SIT::early childhood education": "bachelor of early childhood education",
    "SIT::hospitality business": "hospitality and tourism management",
    "SIT::criminology and security": "bachelor of public safety and security",
    "SIT::sustainable infrastructure engineering land": "infrastructure and systems engineering",
    "SIT::sustainable infrastructure engineering building services": "infrastructure and systems engineering",
    "SIT::telematics intelligent transportation systems engineering": "engineering systems",
    "SIT::systems engineering electromechanical systems": "engineering systems",
    "SIT::in food business management": "food business management culinary arts",
    "SIT::air transport management": "aviation management",
    "SIT::aerospace engineering": "aircraft systems engineering",

    // SUSS
    "SUSS::law": "bachelor of law",
  };

  return knownRenames[`${universityShortName}::${normalizedName}`] || normalizedName;
}

function applyAlias(universityShortName, normalizedName) {
  const aliases = {
    // NTU
    "NTU::accountancy 3 yr": "accountancy",
    "NTU::accountancy 3 yr direct": "accountancy",
    "NTU::accountancy 3 yr direct programme": "accountancy",
    "NTU::business 3 yr": "business",
    "NTU::business 3 yr direct": "business",
    "NTU::business 3 yr direct programme": "business",

    // SIT
    "SIT::game design": "user experience and game design",
    "SIT::digital arts and animation": "digital art and animation",
    "SIT::digital art and animation": "digital art and animation",
    "SIT::computer science and game design": "computer science in interactive media and game development",
    "SIT::computer science in real time interactive simulation": "computer science in real-time interactive simulation",
    "SIT::real time interactive simulation": "computer science in real-time interactive simulation",
    "SIT::communication design": "communication and digital media",
    "SIT::interior design": "communication and digital media",
    "SIT::chemical engineering": "chemical engineering",
    "SIT::marine engineering": "mechanical design and manufacturing engineering",
    "SIT::mechanical design and manufacturing engineering": "mechanical design and manufacturing engineering",
    "SIT::naval architecture": "naval architecture and marine engineering",
    "SIT::offshore engineering": "naval architecture and marine engineering",
    "SIT::food and human nutrition": "dietetics and nutrition",
    "SIT::electrical engineering and information technology": "electronics and data engineering",
    "SIT::culinary arts management": "food business management culinary arts",
    "SIT::occupational therapy": "occupational therapy",
    "SIT::physiotherapy": "physiotherapy",
    "SIT::radiation therapy": "radiation therapy",
    "SIT::diagnostic radiography": "diagnostic radiography",
    "SIT::aeronautical engineering": "aircraft systems engineering",
    "SIT::aerospace systems": "aircraft systems engineering",
    "SIT::mechanical design engineering": "mechanical engineering",
    "SIT::mechatronics": "robotics systems",
    "SIT::computing science": "computing science",
    "SIT::nursing practice": "nursing",
    "SIT::hospitality management": "hospitality and tourism management",

    // SUTD
    "SUTD::engineering product development": "engineering product development",
    "SUTD::engineering systems and design": "engineering systems and design",
    "SUTD::architecture and sustainable design": "architecture and sustainable design",
    "SUTD::design and artificial intelligence": "design and artificial intelligence",
    "SUTD::computer science and design": "computer science and design",
  };

  return aliases[`${universityShortName}::${normalizedName}`] || normalizedName;
}

function isLikelyDoubleDegree(rawName, normalizedName) {
  const s = `${rawName || ""} ${normalizedName || ""}`.toLowerCase();
  return (
    s.includes("double degree") ||
    s.includes(" and economics") ||
    s.includes("accountancy and business") ||
    s.includes("business and computing") ||
    s.includes("business and computer engineering") ||
    s.includes("aerospace engineering and economics") ||
    s.includes("materials engineering and economics") ||
    s.includes("mechanical engineering and economics") ||
    s.includes("mathematics and economics")
  );
}

module.exports.syncGESOutcomes = async function syncGESOutcomes() {
  const rawRows = await runPythonFetch();

  const courses = await prisma.course.findMany({
    include: { university: true },
  });

  const courseMap = new Map();

  for (const course of courses) {
    const shortName = course.university?.short_name;
    if (!shortName) continue;

    const normalizedCourseName = normalizeGenericCourseName(course.course_name);
    const key = `${shortName}::${normalizedCourseName}`;

    // avoid accidental overlap overwrite by keeping the first inserted mapping
    if (!courseMap.has(key)) {
      courseMap.set(key, {
        course_id: course.course_id,
        course_name: course.course_name,
        university_short_name: shortName,
      });
    }
  }

  const unmatched = [];
  let insertedOrUpdated = 0;

  for (const row of rawRows) {
    let normalizedName = normalizeCourseNameForMatching(row.university_name, row.raw_course_name);
    normalizedName = applyKnownCourseRenames(row.university_name, normalizedName);
    normalizedName = applyAlias(row.university_name, normalizedName);

    const key = `${row.university_name}::${normalizedName}`;
    const matchedCourse = courseMap.get(key);

    if (!matchedCourse) {
      unmatched.push({
        university_name: row.university_name,
        raw_course_name: row.raw_course_name,
        normalized_course_name: normalizedName,
        source_year: row.source_year,
        likely_double_degree: isLikelyDoubleDegree(row.raw_course_name, normalizedName),
      });
      continue;
    }

    await prisma.courseOutcome.upsert({
      where: {
        course_id_source_year: {
          course_id: matchedCourse.course_id,
          source_year: row.source_year,
        },
      },
      update: {
        basic_monthly_median: row.basic_monthly_median,
        gross_monthly_median: row.gross_monthly_median,
        employment_rate_overall: row.employment_rate_overall,
        employment_rate_ft_perm: row.employment_rate_ft_perm,
        career_prospects_score: row.career_prospects_score,
        source_type: row.source_type,
      },
      create: {
        course_id: matchedCourse.course_id,
        basic_monthly_median: row.basic_monthly_median,
        gross_monthly_median: row.gross_monthly_median,
        employment_rate_overall: row.employment_rate_overall,
        employment_rate_ft_perm: row.employment_rate_ft_perm,
        career_prospects_score: row.career_prospects_score,
        source_year: row.source_year,
        source_type: row.source_type,
      },
    });

    insertedOrUpdated++;
  }

  return {
    fetched: rawRows.length,
    insertedOrUpdated,
    unmatchedCount: unmatched.length,
    unmatched,
  };
};