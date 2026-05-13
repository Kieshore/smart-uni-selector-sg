const prisma = require("../lib/prisma");

module.exports.getAllCourses = async function getAllCourses(search = "") {
  return prisma.course.findMany({
    where: search
      ? {
          course_name: {
            contains: search,
            mode: "insensitive",
          },
        }
      : {},
    include: {
      university: {
        select: {
          short_name: true,
          university_name: true,
        },
      },
      admissions: {
        orderBy: { year_recorded: "desc" },
        take: 1,
      },
      outcomes: {
        orderBy: { source_year: "desc" },
        take: 1,
      },
      related_interests: {
        include: {
          interest_group: true,
        },
      },
    },
    orderBy: {
      course_name: "asc",
    },
  });
};