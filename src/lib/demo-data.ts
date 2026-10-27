// Demo data for testing Vault features
import { db } from '@/lib/db'

export async function createDemoUser() {
  try {
    // Check if demo user already exists
    const existingUser = await db.user.findUnique({
      where: { email: 'demo@vault.com' }
    })

    if (existingUser) {
      console.log('Demo user already exists')
      return existingUser
    }

    // Create demo user (sign-in is Google-only; no credential is stored - see ADR-007 D4/D6)
    const user = await db.user.create({
      data: {
        email: 'demo@vault.com',
        name: 'Demo User',
        preferences: {
          create: {
            theme: 'system',
            language: 'en',
            timezone: 'UTC'
          }
        }
      }
    })

    // Create demo categories
    const categories = await Promise.all([
      db.category.create({
        data: {
          name: 'Work',
          description: 'Work-related content',
          color: '#3b82f6',
          userId: user.id
        }
      }),
      db.category.create({
        data: {
          name: 'Personal',
          description: 'Personal projects and notes',
          color: '#10b981',
          userId: user.id
        }
      }),
      db.category.create({
        data: {
          name: 'Learning',
          description: 'Educational content and courses',
          color: '#f59e0b',
          userId: user.id
        }
      })
    ])

    // Create demo tags
    const tags = await Promise.all([
      db.tag.create({
        data: {
          name: 'urgent',
          color: '#ef4444',
          userId: user.id
        }
      }),
      db.tag.create({
        data: {
          name: 'idea',
          color: '#8b5cf6',
          userId: user.id
        }
      }),
      db.tag.create({
        data: {
          name: 'meeting',
          color: '#06b6d4',
          userId: user.id
        }
      })
    ])

    // Create demo project
    const project = await db.project.create({
      data: {
        title: 'Vault Command Center',
        description: 'Personal productivity application development',
        status: 'ACTIVE',
        priority: 'HIGH',
        progress: 75,
        userId: user.id,
        tasks: {
          create: [
            {
              title: 'Setup authentication system',
              description: 'Implement user registration and login',
              status: 'COMPLETED',
              priority: 'HIGH'
            },
            {
              title: 'Build project management features',
              description: 'Create Kanban board and task management',
              status: 'IN_PROGRESS',
              priority: 'HIGH'
            },
            {
              title: 'Add calendar integration',
              description: 'Integrate with Google and Outlook calendars',
              status: 'TODO',
              priority: 'MEDIUM'
            }
          ]
        }
      }
    })

    // Create demo job opportunity
    await db.jobOpportunity.create({
      data: {
        title: 'Senior Full Stack Developer',
        company: 'Tech Innovations Inc.',
        content: 'Exciting opportunity to work on cutting-edge web applications',
        location: 'San Francisco, CA',
        salary: '$120,000 - $150,000',
        applicationStatus: 'APPLIED',
        priority: 'HIGH',
        applicationDeadline: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000), // 30 days from now
        notes: 'Great company culture, remote-friendly',
        userId: user.id
      }
    })

    // Create demo calendar events
    await Promise.all([
      db.calendarEvent.create({
        data: {
          title: 'Team Standup',
          description: 'Daily team synchronization meeting',
          startTime: new Date(Date.now() + 24 * 60 * 60 * 1000), // Tomorrow
          endTime: new Date(Date.now() + 24 * 60 * 60 * 1000 + 30 * 60 * 1000), // Tomorrow + 30 min
          location: 'Conference Room A',
          allDay: false,
          userId: user.id
        }
      }),
      db.calendarEvent.create({
        data: {
          title: 'Project Planning',
          description: 'Quarterly project planning session',
          startTime: new Date(Date.now() + 2 * 24 * 60 * 60 * 1000 + 9 * 60 * 60 * 1000), // Day after tomorrow at 9 AM
          endTime: new Date(Date.now() + 2 * 24 * 60 * 60 * 1000 + 11 * 60 * 60 * 1000), // Day after tomorrow at 11 AM
          location: 'Main Office',
          allDay: false,
          userId: user.id
        }
      }),
      db.calendarEvent.create({
        data: {
          title: 'Company All-Hands',
          description: 'Monthly company-wide meeting',
          startTime: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000), // Next week
          endTime: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000 + 60 * 60 * 1000), // Next week + 1 hour
          location: 'Virtual - Zoom',
          allDay: false,
          userId: user.id
        }
      })
    ])

    // Create demo content items
    await Promise.all([
      db.contentItem.create({
        data: {
          title: 'Project Ideas',
          content: '# Project Ideas\n\n- Personal finance tracker\n- Recipe organizer\n- Workout planner',
          type: 'NOTE',
          categoryId: categories[1].id, // Personal
          userId: user.id
        }
      }),
      db.contentItem.create({
        data: {
          title: 'Meeting Notes - Q1 Planning',
          content: '# Q1 Planning Meeting\n\n## Key Points\n- Focus on user experience\n- Implement mobile app\n- Expand team',
          type: 'NOTE',
          categoryId: categories[0].id, // Work
          userId: user.id
        }
      })
    ])

    console.log('Demo data created successfully!')
    return user

  } catch (error) {
    console.error('Error creating demo data:', error)
    throw error
  }
}

export async function seedDemoData() {
  console.log('🌱 Seeding demo data...')
  await createDemoUser()
  console.log('✅ Demo data seeded successfully!')
}