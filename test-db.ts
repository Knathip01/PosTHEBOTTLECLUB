import { PrismaClient } from '@prisma/client'
const prisma = new PrismaClient()

async function main() {
  const policies = await prisma.$queryRawUnsafe("SELECT * FROM pg_policies WHERE tablename = 'sales'")
  console.log('RLS Policies for sales:', policies)
}

main().catch(console.error).finally(() => prisma.$disconnect())
