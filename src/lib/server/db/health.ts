import { getDatabase } from './client';

export type DatabaseHealth = { ok: true } | { ok: false; message: string };

export const checkDatabase = async (): Promise<DatabaseHealth> => {
  try {
    await getDatabase()`SELECT 1`;
    return { ok: true };
  } catch {
    return {
      ok: false,
      message: 'Chưa cấu hình hoặc chưa thể kết nối cơ sở dữ liệu.'
    };
  }
};
