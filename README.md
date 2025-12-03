# Sync Patients - Node.js TypeScript Prisma Project

A simple Node.js backend project with TypeScript and Prisma to fetch and display user data from a PostgreSQL database.

## Setup

1. **Install dependencies** (already done):
   ```bash
   npm install
   ```

2. **Configure database connection**:
   - Open `.env` file
   - Replace the `DATABASE_URL` with your actual PostgreSQL connection string
   - Format: `postgresql://USER:PASSWORD@HOST:PORT/DATABASE?schema=public`

3. **Update User ID**:
   - Open `src/index.ts`
   - Replace `YOUR_USER_ID_HERE` with an actual user ID from your database

## Running the Project

To run the project:

```bash
npm start
```

or

```bash
npm run dev
```

This will:
- Connect to your PostgreSQL database
- Fetch the user with the specified ID
- Display the user data including related tenant, patients, prescribers, orders, and webhooks

## Database Schema

The project includes a Prisma schema with the following models:
- User (with all fields as specified)
- Tenant
- Patient
- Prescriber
- Order
- TenantWebhook

## Project Structure

```
sync_patients/
├── prisma/
│   └── schema.prisma       # Database schema
├── prisma.config.ts        # Prisma configuration
├── src/
│   └── index.ts           # Main application file
├── .env                   # Environment variables
├── package.json           # Project dependencies
└── tsconfig.json          # TypeScript configuration
```

## Available Scripts

- `npm start` - Run the application
- `npm run dev` - Run the application (same as start)
- `npm run build` - Compile TypeScript to JavaScript
- `npm run prisma:generate` - Generate Prisma Client

## Notes

- Make sure your database is running and accessible
- The database should already have the tables created (users, tenants, patients, prescribers, orders, tenant_webhooks)
- The User model includes all specified fields including role, tenant relationship, and related models
