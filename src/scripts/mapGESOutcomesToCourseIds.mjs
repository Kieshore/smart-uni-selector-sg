import fs from "fs";
import path from "path";
import { PrismaClient } from "../generated/prisma/index.js";

const prisma = new PrismaClient();

const INPUT_PATH = path.resolve("src/scripts/output/ges_normalized.json");
const UNMATCHED_PATH = path.resolve("src/scripts/output/ges_unmatched.json");

const UNIVERSITY_SHORT_TO_ID = {
  NUS: 1,
  NTU: 2,
  SMU: 3,
  SUTD: 4,
  SIT: 5,
  SUSS: 6,
};

function normalizeCourseName(name) {
  if (!name) return "";

  let s = name.trim().toLowerCase();

  s = s.replace(/[\*\#]+/g, "");
  s = s.replace(/\bcum laude and above\b/g, "");
  s = s.replace(/\bcum laude\b/g, "");
  s = s.replace(/\bbachelor of\b/g, "");
  s = s.replace(/\bbachelor in\b/g, "");
  s = s.replace(/\bbachelor\b/g, "");
  s = s.replace(/\bwith honours\b/g, "");
  s = s.replace(/\bwith honors\b/g, "");
  s = s.replace(/\bhonours\b/g, "");
  s = s.replace(/\bhonors\b/g, "");
  s = s.replace(/\bhons\b/g, "");

  s = s.replace(/&/g, " and ");
  s = s.replace(/[\/\-\(\)]/g, " ");
  s = s.replace(/[^a-z0-9\s]/g, " ");
  s = s.replace(/\s+/g, " ").trim();

  return s;
}

function applyAlias(universityShort, normalizedName) {
  const aliases = {
    // NUS
    "NUS::law": "law",
    "NUS::medicine and bachelor of surgery mbbs": "medicine",
    "NUS::music": "music",
    "NUS::nursing": "nursing",
    "NUS::pharmacy": "pharmacy",
    "NUS::architecture": "architecture",
    "NUS::business administration": "business administration",
    "NUS::computer science": "computer science",
    "NUS::information security": "information security",
    "NUS::business analytics": "business analytics",

    // NTU
    "NTU::computer science": "computer science",
    "NTU::computer engineering": "computer engineering",
    "NTU::business": "business",
    "NTU::accountancy": "accountancy",
    "NTU::economics": "economics",
    "NTU::communication studies": "communication studies",

    // SMU
    "SMU::accountancy": "bachelor of accountancy",
    "SMU::business management": "bachelor of business management",
    "SMU::laws": "bachelor of laws",
    "SMU::economics": "bachelor of science economics",
    "SMU::information systems": "bachelor of science information systems",
    "SMU::computer science": "bachelor of science computer science",
    "SMU::software engineering": "bachelor of science software engineering",
    "SMU::social sciences": "bachelor of social sciences",

    // SUTD
    "SUTD::computer science and design": "computer science and design",
    "SUTD::engineering product development": "engineering product development",
    "SUTD::engineering systems and design": "engineering systems and design",
    "SUTD::architecture and sustainable design": "architecture and sustainable design",
    "SUTD::design and artificial intelligence": "design and artificial intelligence",
  };

  return aliases[`${universityShort}::${normalizedName}`] ?? normalizedName;
}

async function main() {
  const raw = fs.readFileSync(INPUT_PATH, "utf-8");
  const gesRows = JSON.parse(raw);

  const courses = await prisma.course.findMany({
    select: {
      course_id: true,
      university_id: true,
      course_name: true,
    },
  });

  const courseIndex = new Map();

  for (const course of courses) {
    const normalized = normalizeCourseName(course.course_name);
    const key = `${course.university_id}::${normalized}`;
    courseIndex.set(key, course);
  }

  const unmatched = [];
  let matchedCount = 0;

  for (const row of gesRows) {
    const universityId = UNIVERSITY_SHORT_TO_ID[row.university_name];
    if (!universityId) {
      unmatched.push({ reason: "unknown_university", row });
      continue;
    }

    let normalizedName = normalizeCourseName(row.raw_course_name);
    normalizedName = applyAlias(row.university_name, normalizedName);

    const key = `${universityId}::${normalizedName}`;
    const matchedCourse = courseIndex.get(key);

    if (!matchedCourse) {
      unmatched.push({
        reason: "no_match",
        university_id: universityId,
        normalized_name: normalizedName,
        row,
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
        employment_rate_overall: row.employment_rate_overall,
        employment_rate_ft_perm: row.employment_rate_ft_perm,
        career_prospects_score: row.career_prospects_score,
        source_type: row.source_type,
      },
      create: {
        course_id: matchedCourse.course_id,
        basic_monthly_median: row.basic_monthly_median,
        employment_rate_overall: row.employment_rate_overall,
        employment_rate_ft_perm: row.employment_rate_ft_perm,
        career_prospects_score: row.career_prospects_score,
        source_year: row.source_year,
        source_type: row.source_type,
      },
    });

    matchedCount += 1;
  }

  fs.writeFileSync(UNMATCHED_PATH, JSON.stringify(unmatched, null, 2), "utf-8");

  console.log(`Matched and inserted/updated: ${matchedCount}`);
  console.log(`Unmatched rows: ${unmatched.length}`);
  console.log(`Unmatched rows saved to: ${UNMATCHED_PATH}`);
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });