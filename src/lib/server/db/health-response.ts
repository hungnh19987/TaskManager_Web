type DatabaseHealth = { ok: true } | { ok: false; message: string };

export const createHealthResponse = async (
  check: () => Promise<DatabaseHealth>
): Promise<Response> => {
  const database = await check();
  return new Response(
    JSON.stringify({
      status: database.ok ? 'ok' : 'degraded',
      database: database.ok ? 'ok' : 'unavailable'
    }),
    {
      status: database.ok ? 200 : 503,
      headers: {
        'cache-control': 'no-store',
        'content-type': 'application/json'
      }
    }
  );
};
