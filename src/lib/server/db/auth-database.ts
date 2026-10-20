import { getDatabase } from './client';
import { createPostgresDatabase } from './postgres-adapter';

export const getAuthDatabase = () => createPostgresDatabase(getDatabase());
