import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import pg from 'pg';
import 'dotenv/config';

async function main() {
  const pool = new pg.Pool({
    connectionString: process.env.DATABASE_URL,
  });

  const adapter = new PrismaPg(pool);
  const prisma = new PrismaClient({ adapter });

  try {
    // Replace this with your actual user ID from the database
    const userId = '0788dbd3-ccca-46fc-af1b-311a8dfab077';

    console.log('Connecting to database...');

    // Fetch user by ID
    const user = await prisma.patient.findUnique({
      where: {
        id: userId,
      },
    });

    if (user) {
      console.log('\Patient found:');
      console.log('='.repeat(50));
      console.log(JSON.stringify(user, null, 2));
      console.log('='.repeat(50));
    } else {
      console.log(`\Patient with ID "${userId}" not found.`);
    }
  } catch (error) {
    console.error('Error fetching user:', error);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
    await pool.end();
  }
}

main()
  .then(() => {
    console.log('Script completed successfully');
    process.exit(0);
  })
  .catch((error) => {
    console.error('Fatal error:', error);
    process.exit(1);
  });
