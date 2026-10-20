import { env } from '$env/dynamic/private';
import { createAuthService } from './service';
import { passwords } from './passwords';
import { getAuthDatabase } from '../db/auth-database';
import { createLoginRateLimiter } from './login-rate-limit';

const authDatabase = getAuthDatabase();

export const authService = createAuthService({
  database: authDatabase,
  passwords
});

const rateLimitSecret = env.LOGIN_RATE_LIMIT_SECRET ?? env.DATABASE_URL;
if (!rateLimitSecret)
  throw new Error('Server database configuration is required.');
if (process.env.NODE_ENV === 'production' && !env.LOGIN_RATE_LIMIT_SECRET) {
  throw new Error('LOGIN_RATE_LIMIT_SECRET is required in production.');
}
export const loginRateLimiter = createLoginRateLimiter(
  authDatabase,
  rateLimitSecret
);

export const SESSION_COOKIE = 'task_manager_session';
export const SESSION_MAX_AGE_SECONDS = 12 * 60 * 60;

export const sessionCookieOptions = {
  httpOnly: true,
  secure: process.env.NODE_ENV === 'production',
  sameSite: 'lax' as const,
  path: '/',
  maxAge: SESSION_MAX_AGE_SECONDS
};
