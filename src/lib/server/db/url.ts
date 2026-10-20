export const validateDatabaseUrl = (value: string): void => {
  let parsed: URL;
  try {
    parsed = new URL(value);
  } catch {
    throw new Error('DATABASE_URL must be a valid PostgreSQL URL');
  }
  if (!['postgres:', 'postgresql:'].includes(parsed.protocol)) {
    throw new Error('DATABASE_URL must use the postgres protocol');
  }
  if (!parsed.hostname || parsed.pathname.length < 2) {
    throw new Error('DATABASE_URL must include a host and database name');
  }
};
