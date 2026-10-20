import argon2 from 'argon2';

export const hashDemoAdminPassword = async (
  password: string
): Promise<string> => {
  if (password.length < 12)
    throw new Error('Demo password must contain at least 12 characters.');
  return argon2.hash(password, { type: argon2.argon2id });
};

export const seedDemoAdmin = async (
  insertIfAbsent: (passwordHash: string) => Promise<void>,
  password: string
): Promise<void> => insertIfAbsent(await hashDemoAdminPassword(password));
