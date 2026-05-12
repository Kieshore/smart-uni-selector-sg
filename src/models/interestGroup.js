const prisma = require("../lib/prisma");

module.exports.getAllInterestGroups = async function getAllInterestGroups() {
  return prisma.interestGroup.findMany({
    orderBy: { interest_name: "asc" },
  });
};