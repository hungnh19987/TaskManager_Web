import type { Sql, TransactionSql } from 'postgres';
import type { QueryExecutor, TransactionalDatabase } from './transactional';

type PostgresExecutor = Pick<Sql, 'unsafe'> | Pick<TransactionSql, 'unsafe'>;

const executor = (connection: PostgresExecutor): QueryExecutor => ({
  query: async <Row extends Record<string, unknown>>(
    statement: string,
    parameters: readonly unknown[] = []
  ) => ({
    rows: (await connection.unsafe(statement, [
      ...parameters
    ] as never[])) as Row[]
  })
});

export const createPostgresDatabase = (
  database: Sql
): TransactionalDatabase => ({
  query: async <Row extends Record<string, unknown>>(
    statement: string,
    parameters: readonly unknown[] = []
  ) => executor(database).query<Row>(statement, parameters),
  transaction: async <Result>(
    callback: (transaction: QueryExecutor) => Promise<Result>
  ) => {
    const result = await database.begin((transaction) =>
      callback(executor(transaction))
    );
    return result as Result;
  }
});
