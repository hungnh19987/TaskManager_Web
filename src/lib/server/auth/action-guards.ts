import { AuthError } from './service';
import { error } from '@sveltejs/kit';

export const requireSameOrigin = (request: Request, url: URL): void => {
  const origin = request.headers.get('origin');
  if (origin !== url.origin) {
    error(403, 'Yêu cầu không hợp lệ.');
  }
};

export const actionErrorMessage = (error: unknown): string => {
  if (error instanceof AuthError) return error.message;
  return 'Không thể hoàn tất thao tác. Vui lòng thử lại.';
};
