// Simple demo data seeder
const { PrismaClient } = require('@prisma/client')

const prisma = new PrismaClient()

async function main() {
  console.log('🌱 Seeding demo data...')

  // Check if demo user exists
  const existingUser = await prisma.user.findUnique({
    where: { email: 'demo@vault.com' }
  })

  if (existingUser) {
    console.log('✅ Demo user already exists')
    return
  }

  // Create demo user (sign-in is Google-only; no credential is stored - see ADR-007 D4/D6)
  const user = await prisma.user.create({
    data: {
      email: 'demo@vault.com',
      name: 'Demo User'
    }
  })

  // Create user preferences
  await prisma.userPreferences.create({
    data: {
      userId: user.id,
      theme: 'system',
      language: 'en',
      timezone: 'UTC'
    }
  })

  // Create demo project with tasks
  await prisma.project.create({
    data: {
      title: 'Vault Command Center',
      description: 'Personal productivity application',
      status: 'ACTIVE',  // Correct ProjectStatus enum value
      priority: 'HIGH',   // Correct Priority enum value
      progress: 75,
      userId: user.id,
      tasks: {
        create: [
          {
            title: 'Setup authentication',
            status: 'COMPLETED',  // Correct TaskStatus enum value
            priority: 'HIGH',     // Correct Priority enum value
            userId: user.id
          },
          {
            title: 'Build Kanban board',
            status: 'IN_PROGRESS', // Correct TaskStatus enum value
            priority: 'HIGH',      // Correct Priority enum value
            userId: user.id
          },
          {
            title: 'Add calendar features',
            status: 'TODO',       // Correct TaskStatus enum value
            priority: 'MEDIUM',   // Correct Priority enum value
            userId: user.id
          }
        ]
      }
    }
  })

  console.log('✅ Demo data created!')
  console.log('Sign-in is Google-only. This row exists for verification (see ADR-007 D7).')
}

main()
  .catch((e) => {
    console.error(e)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })