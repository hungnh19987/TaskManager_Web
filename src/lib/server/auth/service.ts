import { createHash, randomBytes } from 'node:crypto';
import type {
  QueryExecutor,
  TransactionalDatabase
} from '../../server/db/transactional';

export type Role = 'ADMIN' | 'MANAGER' | 'STAFF';

export type AuthUser = {
  id: string;
  username: string;
  fullName: string;
  role: Role;
  isActive: boolean;
  authVersion: number;
};

export type AccountSummary = Omit<AuthUser, 'authVersion'> & {
  createdAt: Date;
};

export type PasswordCodec = {
  hash(password: string): Promise<string>;
  verify(hash: string, password: string): Promise<boolean>;
};

export type AuthErrorCode =
  | 'INVALID_CREDENTIALS'
  | 'FORBIDDEN'
  | 'NOT_FOUND'
  | 'VALIDATION'
  | 'LAST_ADMIN'
  | 'SELF_LOCK'
  | 'CONFLICT';

export class AuthError extends Error {
  constructor(
    readonly code: AuthErrorCode,
    message: string
  ) {
    super(message);
    this.name = 'AuthError';
  }
}

type UserRow = {
  id: string;
  username: string;
  full_name: string;
  role: Role;
  is_active: boolean;
  auth_version: number;
  created_at?: Date;
  password_hash?: string;
};

type AuthOptions = {
  database: TransactionalDatabase;
  passwords: PasswordCodec;
  now?: () => Date;
  createToken?: () => string;
};

const SESSION_DURATION_MS = 12 * 60 * 60 * 1000;
const USERNAME_PATTERN = /^[a-z0-9._-]{3,32}$/;
const ROLES: Role[] = ['ADMIN', 'MANAGER', 'STAFF'];

const normalizeUsername = (value: string): string => {
  const username = value.trim().toLowerCase();
  if (!USERNAME_PATTERN.test(username)) {
    throw new AuthError(
      'VALIDATION',
      'Tên đăng nhập gồm 3-32 ký tự: chữ thường không dấu, số, dấu chấm, gạch dưới hoặc gạch ngang.'
    );
  }
  return username;
};

const validateFullName = (value: string): string => {
  const fullName = value.trim();
  if (!fullName || fullName.length > 120) {
    throw new AuthError(
      'VALIDATION',
      'Họ tên không được để trống và tối đa 120 ký tự.'
    );
  }
  return fullName;
};

const validatePassword = (value: string): void => {
  if (value.length < 12 || value.length > 128) {
    throw new AuthError('VALIDATION', 'Mật khẩu phải có từ 12 đến 128 ký tự.');
  }
};

const validateRole = (role: string): Role => {
  if (!ROLES.includes(role as Role))
    throw new AuthError('VALIDATION', 'Vai trò không hợp lệ.');
  return role as Role;
};

const userDto = (row: UserRow): AuthUser => ({
  id: row.id,
  username: row.username,
  fullName: row.full_name,
  role: row.role,
  isActive: row.is_active,
  authVersion: row.auth_version
});

const accountDto = (row: UserRow): AccountSummary => ({
  id: row.id,
  username: row.username,
  fullName: row.full_name,
  role: row.role,
  isActive: row.is_active,
  createdAt: row.created_at ?? new Date(0)
});

const tokenDigest = (token: string): Buffer =>
  createHash('sha256').update(token).digest();

const requireActiveAdmin = async (
  transaction: QueryExecutor,
  actorId: string
): Promise<void> => {
  const { rows } = await transaction.query<UserRow>(
    'SELECT id, role, is_active FROM users WHERE id = $1 FOR UPDATE',
    [actorId]
  );
  if (!rows[0]?.is_active || rows[0].role !== 'ADMIN') {
    throw new AuthError(
      'FORBIDDEN',
      'Chỉ ADMIN đang hoạt động mới được quản lý tài khoản.'
    );
  }
};

const lockAdminGuard = async (transaction: QueryExecutor): Promise<void> => {
  await transaction.query(
    'SELECT id FROM account_admin_guard WHERE id = 1 FOR UPDATE'
  );
};

const writeAccountLog = async (
  transaction: QueryExecutor,
  actorId: string,
  targetId: string,
  action: string,
  detail: Record<string, unknown>
): Promise<void> => {
  await transaction.query(
    'INSERT INTO account_logs (actor_id, target_user_id, action, detail) VALUES ($1, $2, $3, $4::jsonb)',
    [actorId, targetId, action, JSON.stringify(detail)]
  );
};

export const createAuthService = ({
  database,
  passwords,
  now = () => new Date(),
  createToken = () => randomBytes(32).toString('base64url')
}: AuthOptions) => {
  let dummyHash: Promise<string> | undefined;
  const getDummyHash = () =>
    (dummyHash ??= passwords.hash(randomBytes(32).toString('base64url')));

  const login = async (usernameInput: string, password: string) => {
    const username = (usernameInput ?? '').trim().toLowerCase();
    const validUsername = USERNAME_PATTERN.test(username);
    const { rows } = validUsername
      ? await database.query<UserRow>(
          'SELECT id, username, full_name, role, is_active, auth_version, password_hash FROM users WHERE username = $1',
          [username]
        )
      : { rows: [] as UserRow[] };
    const row = rows[0];
    let passwordMatches = false;
    try {
      passwordMatches = await passwords.verify(
        row?.password_hash ?? (await getDummyHash()),
        typeof password === 'string' && password.length <= 128 ? password : ''
      );
    } catch {
      passwordMatches = false;
    }
    if (!row || !row.is_active || !passwordMatches) {
      throw new AuthError(
        'INVALID_CREDENTIALS',
        'Tên đăng nhập hoặc mật khẩu không đúng, hoặc tài khoản đã bị khóa.'
      );
    }

    const token = createToken();
    const expiresAt = new Date(now().getTime() + SESSION_DURATION_MS);
    const { rows: sessions } = await database.query<{ id: string }>(
      `INSERT INTO sessions (user_id, token_hash, auth_version, expires_at)
			 SELECT id, $2, auth_version, $4 FROM users
			 WHERE id = $1 AND is_active = true AND auth_version = $3
			 RETURNING id`,
      [row.id, tokenDigest(token), row.auth_version, expiresAt]
    );
    if (!sessions[0]) {
      throw new AuthError(
        'INVALID_CREDENTIALS',
        'Tên đăng nhập hoặc mật khẩu không đúng, hoặc tài khoản đã bị khóa.'
      );
    }
    return { user: userDto(row), token, expiresAt };
  };

  const getCurrentUser = async (token: string): Promise<AuthUser | null> => {
    if (!token || token.length > 128) return null;
    const { rows } = await database.query<UserRow>(
      `SELECT u.id, u.username, u.full_name, u.role, u.is_active, u.auth_version
			 FROM sessions s JOIN users u ON u.id = s.user_id
			 WHERE s.token_hash = $1 AND s.revoked_at IS NULL AND s.expires_at > $2
			 AND u.is_active = true AND s.auth_version = u.auth_version`,
      [tokenDigest(token), now()]
    );
    return rows[0] ? userDto(rows[0]) : null;
  };

  const revokeSession = async (token: string): Promise<void> => {
    if (!token || token.length > 128) return;
    await database.query(
      'UPDATE sessions SET revoked_at = $2 WHERE token_hash = $1 AND revoked_at IS NULL',
      [tokenDigest(token), now()]
    );
  };

  const changePassword = async (
    actorId: string,
    currentPassword: string,
    newPassword: string
  ): Promise<void> => {
    validatePassword(newPassword);
    await database.transaction(async (transaction) => {
      const { rows } = await transaction.query<UserRow>(
        'SELECT id, password_hash, is_active FROM users WHERE id = $1 FOR UPDATE',
        [actorId]
      );
      const user = rows[0];
      if (!user?.is_active)
        throw new AuthError('FORBIDDEN', 'Tài khoản không còn hoạt động.');
      let matches = false;
      try {
        if (
          typeof currentPassword !== 'string' ||
          currentPassword.length > 128
        ) {
          throw new Error('Invalid password length');
        }
        matches = await passwords.verify(
          user.password_hash ?? '',
          currentPassword ?? ''
        );
      } catch {
        matches = false;
      }
      if (!matches)
        throw new AuthError(
          'INVALID_CREDENTIALS',
          'Mật khẩu hiện tại không đúng.'
        );

      const passwordHash = await passwords.hash(newPassword);
      const changedAt = now();
      await transaction.query(
        'UPDATE users SET password_hash = $2, auth_version = auth_version + 1, updated_at = $3 WHERE id = $1',
        [actorId, passwordHash, changedAt]
      );
      await transaction.query(
        'UPDATE sessions SET revoked_at = $2 WHERE user_id = $1 AND revoked_at IS NULL',
        [actorId, changedAt]
      );
      await writeAccountLog(
        transaction,
        actorId,
        actorId,
        'PASSWORD_CHANGED',
        {}
      );
    });
  };

  const listAccounts = async (actorId: string): Promise<AccountSummary[]> => {
    return database.transaction(async (transaction) => {
      await requireActiveAdmin(transaction, actorId);
      const { rows } = await transaction.query<UserRow>(
        'SELECT id, username, full_name, role, is_active, created_at FROM users ORDER BY lower(full_name), id'
      );
      return rows.map(accountDto);
    });
  };

  const createAccount = async (
    actorId: string,
    input: { username: string; fullName: string; password: string; role: Role }
  ): Promise<void> => {
    const username = normalizeUsername(input.username);
    const fullName = validateFullName(input.fullName);
    validatePassword(input.password);
    const role = validateRole(input.role);
    await database.transaction(async (transaction) => {
      await lockAdminGuard(transaction);
      await requireActiveAdmin(transaction, actorId);
      const passwordHash = await passwords.hash(input.password);
      const { rows } = await transaction.query<UserRow>(
        `INSERT INTO users (username, full_name, password_hash, role)
				 VALUES ($1, $2, $3, $4)
				 RETURNING id, username`,
        [username, fullName, passwordHash, role]
      );
      if (!rows[0]) throw new AuthError('CONFLICT', 'Không thể tạo tài khoản.');
      await writeAccountLog(
        transaction,
        actorId,
        rows[0].id,
        'ACCOUNT_CREATED',
        {
          username,
          role
        }
      );
    });
  };

  const resetPassword = async (
    actorId: string,
    targetId: string,
    newPassword: string
  ): Promise<void> => {
    validatePassword(newPassword);
    await database.transaction(async (transaction) => {
      await lockAdminGuard(transaction);
      await requireActiveAdmin(transaction, actorId);
      const { rows } = await transaction.query<UserRow>(
        'SELECT id FROM users WHERE id = $1 FOR UPDATE',
        [targetId]
      );
      if (!rows[0])
        throw new AuthError('NOT_FOUND', 'Không tìm thấy tài khoản.');
      const passwordHash = await passwords.hash(newPassword);
      const changedAt = now();
      await transaction.query(
        'UPDATE users SET password_hash = $2, auth_version = auth_version + 1, updated_at = $3 WHERE id = $1',
        [targetId, passwordHash, changedAt]
      );
      await transaction.query(
        'UPDATE sessions SET revoked_at = $2 WHERE user_id = $1 AND revoked_at IS NULL',
        [targetId, changedAt]
      );
      await writeAccountLog(
        transaction,
        actorId,
        targetId,
        'PASSWORD_RESET',
        {}
      );
    });
  };

  const setRole = async (
    actorId: string,
    targetId: string,
    role: Role
  ): Promise<void> => {
    role = validateRole(role);
    await database.transaction(async (transaction) => {
      await lockAdminGuard(transaction);
      await requireActiveAdmin(transaction, actorId);
      const { rows } = await transaction.query<UserRow>(
        'SELECT id, role, is_active FROM users WHERE id = $1 FOR UPDATE',
        [targetId]
      );
      const target = rows[0];
      if (!target)
        throw new AuthError('NOT_FOUND', 'Không tìm thấy tài khoản.');
      if (target.role === role) return;
      if (target.role === 'ADMIN' && target.is_active && role !== 'ADMIN') {
        const { rows: counts } = await transaction.query<{ count: number }>(
          "SELECT count(*)::int AS count FROM users WHERE role = 'ADMIN' AND is_active = true"
        );
        if ((counts[0]?.count ?? 0) <= 1) {
          throw new AuthError(
            'LAST_ADMIN',
            'Không thể hạ quyền ADMIN hoạt động cuối cùng.'
          );
        }
      }
      const changedAt = now();
      await transaction.query(
        'UPDATE users SET role = $2, auth_version = auth_version + 1, updated_at = $3 WHERE id = $1',
        [targetId, role, changedAt]
      );
      await transaction.query(
        'UPDATE sessions SET revoked_at = $2 WHERE user_id = $1 AND revoked_at IS NULL',
        [targetId, changedAt]
      );
      await writeAccountLog(transaction, actorId, targetId, 'ROLE_CHANGED', {
        role
      });
    });
  };

  const setActive = async (
    actorId: string,
    targetId: string,
    isActive: boolean
  ): Promise<void> => {
    await database.transaction(async (transaction) => {
      await lockAdminGuard(transaction);
      await requireActiveAdmin(transaction, actorId);
      const { rows } = await transaction.query<UserRow>(
        'SELECT id, role, is_active FROM users WHERE id = $1 FOR UPDATE',
        [targetId]
      );
      const target = rows[0];
      if (!target)
        throw new AuthError('NOT_FOUND', 'Không tìm thấy tài khoản.');
      if (target.is_active === isActive) return;
      if (!isActive && actorId === targetId) {
        throw new AuthError(
          'SELF_LOCK',
          'Không thể tự khóa tài khoản của chính mình.'
        );
      }
      if (!isActive && target.role === 'ADMIN') {
        const { rows: counts } = await transaction.query<{ count: number }>(
          "SELECT count(*)::int AS count FROM users WHERE role = 'ADMIN' AND is_active = true"
        );
        if ((counts[0]?.count ?? 0) <= 1) {
          throw new AuthError(
            'LAST_ADMIN',
            'Không thể khóa ADMIN hoạt động cuối cùng.'
          );
        }
      }
      const changedAt = now();
      await transaction.query(
        'UPDATE users SET is_active = $2, auth_version = auth_version + 1, updated_at = $3 WHERE id = $1',
        [targetId, isActive, changedAt]
      );
      if (!isActive) {
        await transaction.query(
          'UPDATE sessions SET revoked_at = $2 WHERE user_id = $1 AND revoked_at IS NULL',
          [targetId, changedAt]
        );
      }
      await writeAccountLog(
        transaction,
        actorId,
        targetId,
        isActive ? 'ACCOUNT_ACTIVATED' : 'ACCOUNT_DEACTIVATED',
        {}
      );
    });
  };

  return {
    login,
    getCurrentUser,
    revokeSession,
    changePassword,
    listAccounts,
    createAccount,
    resetPassword,
    setRole,
    setActive
  };
};
