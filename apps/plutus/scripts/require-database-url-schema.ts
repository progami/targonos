const databaseUrl = process.env.DATABASE_URL;

if (databaseUrl === undefined) {
  console.error('DATABASE_URL is required for Plutus Prisma migrations');
  process.exit(1);
}

if (databaseUrl.trim() === '') {
  console.error('DATABASE_URL is required for Plutus Prisma migrations');
  process.exit(1);
}

let parsedUrl: URL;

try {
  parsedUrl = new URL(databaseUrl);
} catch {
  console.error('DATABASE_URL must be a valid PostgreSQL URL for Plutus Prisma migrations');
  process.exit(1);
}

if (parsedUrl.protocol !== 'postgresql:') {
  console.error('DATABASE_URL must be a valid PostgreSQL URL for Plutus Prisma migrations');
  process.exit(1);
}

const schema = parsedUrl.searchParams.get('schema');

if (schema === null) {
  console.error('DATABASE_URL must include ?schema=<schema> for Plutus Prisma migrations');
  process.exit(1);
}

if (schema.trim() === '') {
  console.error('DATABASE_URL must include ?schema=<schema> for Plutus Prisma migrations');
  process.exit(1);
}
