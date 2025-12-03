import { PrismaClient, Prisma } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import pg from 'pg';
import * as fs from 'fs';
import * as path from 'path';
import 'dotenv/config';

async function insertPatients() {
  // Parse the DATABASE_URL to ensure all components are strings
  const connectionString = process.env.DATABASE_URL;

  if (!connectionString) {
    throw new Error('DATABASE_URL environment variable is not set');
  }

  const pool = new pg.Pool({
    connectionString: connectionString,
  });

  const adapter = new PrismaPg(pool);
  const prisma = new PrismaClient({ adapter });

  try {
    const outputFile = path.join(process.cwd(), 'output.json');

    // Check if file exists
    if (!fs.existsSync(outputFile)) {
      console.error(`Error: ${outputFile} does not exist`);
      console.error('Please run "npm start" first to generate the output.json file');
      process.exit(1);
    }

    console.log('Reading output.json file...');
    const fileContent = fs.readFileSync(outputFile, 'utf-8');

    // Parse JSON content
    const patientsToCreate: Prisma.PatientCreateManyInput[] = JSON.parse(fileContent);

    if (!Array.isArray(patientsToCreate) || patientsToCreate.length === 0) {
      console.log('No patients to insert. The output.json file is empty or invalid.');
      return;
    }

    console.log(`Found ${patientsToCreate.length} patients to insert`);

    // Check if the createdById user exists in the database
    const samplePatient = patientsToCreate[0];
    const createdById = samplePatient.createdById;

    if (createdById) {
      console.log(`\nChecking if user ${createdById} exists...`);
      const userExists = await prisma.user.findUnique({
        where: { id: createdById },
      });

      if (!userExists) {
        console.error(`❌ Error: User with ID ${createdById} does not exist in the database.`);
        console.error(`\nPlease either:`);
        console.error(`1. Create a user with this ID in the database, OR`);
        console.error(`2. Update the CREATED_BY_ID in your .env file to an existing user ID`);
        console.error(`\nTo find existing users, run: npx prisma studio`);
        process.exit(1);
      }
      console.log(`✓ User exists`);
    }

    // Convert date strings back to Date objects
    const patientsWithDates = patientsToCreate.map(patient => ({
      ...patient,
      dob: new Date(patient.dob as string),
      createdAt: patient.createdAt ? new Date(patient.createdAt) : new Date(),
      updatedAt: patient.updatedAt ? new Date(patient.updatedAt) : new Date(),
    }));

    // Check for existing patients before inserting
    const patientIds = patientsWithDates.map(p => p.id).filter((id): id is string => id !== undefined);
    const existingPatients = await prisma.patient.findMany({
      where: {
        id: {
          in: patientIds
        }
      },
      select: {
        id: true,
        firstName: true,
        lastName: true,
        email: true
      }
    });

    if (existingPatients.length > 0) {
      console.log(`\n⚠️  Found ${existingPatients.length} duplicate(s):`);
      existingPatients.forEach(patient => {
        console.log(`   - ${patient.firstName} ${patient.lastName} (${patient.email}) - ID: ${patient.id}`);
      });
    }

    // Filter out duplicates before inserting
    const existingPatientIds = new Set(existingPatients.map(p => p.id));
    const patientsToInsert = patientsWithDates.filter(p => p.id && !existingPatientIds.has(p.id));

    // Insert patients into database
    console.log(`\nInserting ${patientsToInsert.length} patients into database...`);

    for (let i = 0; i < patientsToInsert.length; i++) {
      const patient = patientsToInsert[i];
      try {
        await prisma.patient.create({
          data: patient,
        })
        console.log(`Patient Inserted - ${patient.firstName} ${patient.lastName} (${patient.email}) - ID: ${patient.id}`);
      } catch (e) {
        console.error('Error inserting patients:', patient, JSON.stringify(e));
      }
    }

    if (existingPatients.length > 0) {
      console.log(`⊘ Skipped ${existingPatients.length} duplicate(s)`);
    }
    console.log(`\nInsert completed!`);

  } catch (error) {
    console.error('Error inserting patients:', error);
    throw error;
  } finally {
    await prisma.$disconnect();
    await pool.end();
  }
}

// Run the script
insertPatients()
  .then(() => {
    console.log('Script completed successfully');
    process.exit(0);
  })
  .catch((error) => {
    console.error('Fatal error:', error);
    process.exit(1);
  });
