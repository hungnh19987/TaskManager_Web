export type QueryResult<Row> = { rows: Row[] };

export interface QueryExecutor {
  query<Row extends Record<string, unknown> = Record<string, unknown>>(
    statement: string,
    parameters?: readonly unknown[]
  ): Promise<QueryResult<Row>>;
}

export interface TransactionalDatabase extends QueryExecutor {
  transaction<Result>(
    callback: (transaction: QueryExecutor) => Promise<Result>
  ): Promise<Result>;
}
