const prisma = require("../lib/prisma");

module.exports.getUserProfile = async function getUserProfile(userId) {
  const parsedUserId = Number(userId);

  if (Number.isNaN(parsedUserId)) {
    throw new Error("Invalid userId");
  }

  return prisma.user.findUnique({
    where: { user_id: parsedUserId },
    select: {
      user_id: true,
      first_name: true,
      full_name: true,
      citizenship: true,
      email: true,
      academic_profiles: {
        orderBy: { created_at: "desc" },
        take: 1,
      },
      preferences: {
        orderBy: { created_at: "desc" },
        take: 1,
      },
    },
  });
};