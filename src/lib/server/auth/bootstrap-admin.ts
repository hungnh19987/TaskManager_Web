import type { TransactionalDatabase } from '../db/transactional';
import { AuthError, type PasswordCodec } from './service';

type BootstrapInput = { username: string; fullName: string; password: string };

export const bootstrapFirstAdmin = async (
  database: TransactionalDatabase,
  passwords: PasswordCodec,
  input: BootstrapInput
): Promise<void> => {
  const username = input.username.trim().toLowerCase();
  const fullName = input.fullName.trim();
  if (!/^[a-z0-9._-]{3,32}$/.test(username)) {
    throw new AuthError(
      'VALIDATION',
      'Username must contain 3-32 lowercase letters, digits, dot, underscore, or dash.'
    );
  }
  if (!fullName || fullName.length > 120) {
    throw new AuthError(
      'VALIDATION',
      'Full name is required and must be at most 120 characters.'
    );
  }
  if (input.password.length < 12 || input.password.length > 128) {
    throw new AuthError(
      'VALIDATION',
      'Password must contain 12-128 characters.'
    );
  }

  await database.transaction(async (transaction) => {
    await transaction.query(
      'SELECT id FROM account_admin_guard WHERE id = 1 FOR UPDATE'
    );
    const existing = await transaction.query<{ id: string }>(
      "SELECT id FROM users WHERE role = 'ADMIN' AND is_active = true LIMIT 1"
    );
    if (existing.rows.length) {
      throw new AuthError(
        'CONFLICT',
        'An active ADMIN already exists; bootstrap refused.'
      );
    }
    const passwordHash = await passwords.hash(input.password);
    const { rows } = await transaction.query<{ id: string }>(
      `INSERT INTO users (username, full_name, password_hash, role, is_active)
       VALUES ($1, $2, $3, 'ADMIN', true) RETURNING id`,
      [username, fullName, passwordHash]
    );
    const adminId = String(rows[0].id);
    await transaction.query(
      `INSERT INTO account_logs (actor_id, target_user_id, action, detail)
       VALUES ($1, $1, 'ACCOUNT_CREATED', $2::jsonb)`,
      [adminId, JSON.stringify({ username, role: 'ADMIN', bootstrap: true })]
    );
  });
};
