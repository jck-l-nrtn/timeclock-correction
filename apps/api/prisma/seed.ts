import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

/** Seed a dev admin so the (dev-login) admin dashboard has an account to attach decisions to. */
async function main() {
  await prisma.admin.upsert({
    where: { email: "admin@example.com" },
    update: {},
    create: { email: "admin@example.com", name: "Dev Admin" },
  });
  console.log("[seed] dev admin ready: admin@example.com");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
