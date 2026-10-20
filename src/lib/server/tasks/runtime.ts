import { getAuthDatabase } from '../db/auth-database';
import { createTaskService } from './service';

export const taskService = createTaskService(getAuthDatabase());
