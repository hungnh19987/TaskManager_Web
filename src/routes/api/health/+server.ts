import { checkDatabase } from '../../../lib/server/db/health';
import { createHealthResponse } from '../../../lib/server/db/health-response';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async () =>
  createHealthResponse(checkDatabase);
