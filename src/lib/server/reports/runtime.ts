import { getAuthDatabase } from '../db/auth-database';
import { buildPeopleCsv, buildTaskCsv, createReportService } from './service';

export const reportService = createReportService(getAuthDatabase());
export { buildPeopleCsv, buildTaskCsv };
