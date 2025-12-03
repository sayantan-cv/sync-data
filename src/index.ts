import { PrismaClient, Gender, Patient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import pg from 'pg';
import * as fs from 'fs';
import * as path from 'path';
import { randomUUID } from 'crypto';
import 'dotenv/config';

interface PatientRecord {
  patient_id: string;
  partner_external_id: string;
  patient_first_name: string;
  patient_last_name: string;
  patient_dob: string;
  patient_gender: string;
  patient_email: string;
  patient_phone_number: string;
  partner_id: string;
  external_id_created_timestamp: string;
  update_partner_external_id: string;
}

// UUID validation regex
function isValidUUID(str: string): boolean {
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
  return uuidRegex.test(str);
}

// Convert gender to enum
function convertGender(gender: string): Gender {
  const normalized = gender.toLowerCase().trim();
  if (normalized === 'm' || normalized === 'male') return Gender.MALE;
  if (normalized === 'f' || normalized === 'female') return Gender.FEMALE;
  return Gender.OTHER; // Default to OTHER if not recognized
}

// Format phone number with +1
function formatPhoneNumber(phone: string): string {
  const cleaned = phone.trim();
  if (cleaned.startsWith('+1')) return cleaned;
  if (cleaned.startsWith('1')) return `+${cleaned}`;
  return `+1${cleaned}`;
}

async function processCSV() {
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
  let patientsToCreate: Patient[] = [];

  try {
    const inputFile = path.join(process.cwd(), 'PerfectRx.csv');
    const outputFile = path.join(process.cwd(), 'output.csv');
    const outputFileToBeCreated = path.join(process.cwd(), 'output.json');

    console.log('Reading CSV file...');
    const fileContent = fs.readFileSync(inputFile, 'utf-8');
    const lines = fileContent.split('\n');

    if (lines.length === 0) {
      console.error('CSV file is empty');
      return;
    }

    // Get headers and add the new column
    const headers = lines[0].trim();
    const outputHeaders = `${headers},update_partner_external_id\n`;

    console.log(`Total records to process: ${lines.length - 1}`);

    // Step 1: Extract all unique email addresses from CSV
    console.log('Extracting email addresses from CSV...');
    const emailSet = new Set<string>();

    for (let i = 1; i < lines.length; i++) {
      const line = lines[i].trim();
      if (!line) continue;

      const columns = line.split(',');
      if (columns.length >= 10) {
        const email = columns[6]?.trim().toLowerCase();
        if (email && email !== '') {
          emailSet.add(email);
        }
      }
    }

    console.log(`Found ${emailSet.size} unique email addresses`);

    // Step 2: Fetch all patients from database in bulk
    console.log('Fetching patients from database...');
    const emails = Array.from(emailSet);

    const patients = await prisma.patient.findMany({
      where: {
        email: {
          in: emails,
          mode: 'insensitive'
        }
      },
      select: {
        id: true,
        email: true
      }
    });

    console.log(`Found ${patients.length} matching patients in database`);

    // Step 3: Create a Map for O(1) lookup (email -> patient UUID)
    const patientEmailMap = new Map<string, string>();
    patients.forEach(patient => {
      if (patient.email) {
        patientEmailMap.set(patient.email.toLowerCase(), patient.id);
      }
    });

    // Step 4: Process CSV and write output
    console.log('Processing CSV and writing output...');
    const writeStream = fs.createWriteStream(outputFile);
    writeStream.write(outputHeaders);

    let processedCount = 0;
    let foundCount = 0;
    let notFoundCount = 0;

    for (let i = 1; i < lines.length; i++) {
      const line = lines[i].trim();

      // Skip empty lines
      if (!line) {
        continue;
      }

      const columns = line.split(',');

      // Ensure we have enough columns
      if (columns.length < 10) {
        console.warn(`Skipping line ${i + 1}: insufficient columns`);
        continue;
      }

      const email = columns[6]?.trim().toLowerCase();
      const partnerExternalId = columns[1]?.trim();
      let updatePartnerExternalId = '';

      // Check if email is found in database
      if (email && email !== '' && patientEmailMap.has(email)) {
        // Email found: use the patient UUID from database
        const existingId = columns[1]?.trim();
        if (existingId !== patientEmailMap.get(email)) {
          updatePartnerExternalId = patientEmailMap.get(email) || '';
        }
        foundCount++;
      } else {
        // Email not found
        notFoundCount++;

        // Prepare user data with transformations
        const firstName = columns[2]?.trim();
        const lastName = columns[3]?.trim();
        const dob = columns[4]?.trim();
        const gender = convertGender(columns[5]?.trim() || '');
        const phone = formatPhoneNumber(columns[7]?.trim() || '');

        // Check if partner_external_id is a valid UUID
        if (partnerExternalId && isValidUUID(partnerExternalId)) {
          // Use the existing UUID
          updatePartnerExternalId = partnerExternalId;
        } else {
          // Generate a new UUID
          updatePartnerExternalId = randomUUID();
        }

        // Create user in pharma backend system
        try {
          // Get required environment variables
          const tenantId = process.env.TENANT_ID;
          const createdById = process.env.CREATED_BY_ID;

          if (!tenantId || !createdById) {
            console.error(`Missing required environment variables: TENANT_ID or CREATED_BY_ID`);
            throw new Error('Missing required environment variables');
          }

          // await prisma.patient.create({
          //   data: {
          //     id: updatePartnerExternalId,
          //     tenantId: tenantId,
          //     email: email.toLowerCase(),
          //     firstName: firstName,
          //     lastName: lastName,
          //     dob: new Date(dob),
          //     gender: gender,
          //     phoneNumber: phone,
          //     createdById: createdById,
          //   }
          // });
          patientsToCreate.push({
            id: updatePartnerExternalId,
            tenantId: tenantId,
            email: email.toLowerCase(),
            firstName: firstName,
            lastName: lastName,
            dob: new Date(dob),
            gender: gender,
            phoneNumber: phone,
            createdById: createdById,
            ssn: null,
            metadata: null,
            createdAt: new Date(),
            updatedAt: new Date(),
          })
          updatePartnerExternalId = '';
        } catch (error) {
          console.error(`Error creating patient for email ${email}:`, error);
          // Continue processing even if creation fails
        }
      }

      // Write the output line with the update_partner_external_id column
      writeStream.write(`${line},${updatePartnerExternalId}\n`);
      processedCount++;

      // Log progress every 100 records
      if (processedCount % 100 === 0) {
        console.log(`Processed ${processedCount} / ${lines.length - 1} records...`);
      }
    }
    const writeStream2 = fs.createWriteStream(outputFileToBeCreated);
    writeStream2.write(JSON.stringify(patientsToCreate));

    // Wait for both streams to finish writing
    await Promise.all([
      new Promise<void>((resolve, reject) => {
        writeStream.end(() => {
          resolve();
        });
        writeStream.on('error', reject);
      }),
      new Promise<void>((resolve, reject) => {
        writeStream2.end(() => {
          resolve();
        });
        writeStream2.on('error', reject);
      })
    ]);

    console.log('\n Processing completed!');
    console.log(`Output file created: ${outputFile}`);
    console.log(`\nSummary:`);
    console.log(`Total processed: ${processedCount}`);
    console.log(`Users found: ${foundCount}`);
    console.log(`Users not found: ${notFoundCount}`);

  } catch (error) {
    console.error('Error processing CSV:', error);
    throw error;
  } finally {
    await prisma.$disconnect();
    await pool.end();
  }
}

// Run the script
processCSV()
  .then(() => {
    console.log('Script completed successfully');
    process.exit(0);
  })
  .catch((error) => {
    console.error('Fatal error:', error);
    process.exit(1);
  });
