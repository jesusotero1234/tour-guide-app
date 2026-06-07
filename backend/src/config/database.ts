const INVALID_DATABASE_URL_MESSAGE =
  'DATABASE_URL is required for DB-enabled phases. See backend/.env.example.';

export function getDatabaseUrl(): string {
  const databaseUrl = process.env.DATABASE_URL;

  if (!databaseUrl) {
    throw new Error(INVALID_DATABASE_URL_MESSAGE);
  }

  if (!(databaseUrl.startsWith('postgresql://') || databaseUrl.startsWith('postgres://'))) {
    throw new Error(INVALID_DATABASE_URL_MESSAGE);
  }

  return databaseUrl;
}
