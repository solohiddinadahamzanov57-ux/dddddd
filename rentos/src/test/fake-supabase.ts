type Row = Record<string, unknown>;

/**
 * A stand-in for the Supabase client that returns canned rows for each table
 * and canned results for each rpc, ignoring filters. Enough to render a page
 * from realistic data and catch crashes, not to test queries (the database
 * tests cover those).
 */
export function fakeSupabase(options: {
  tables?: Record<string, Row[]>;
  rpc?: Record<string, unknown>;
  user?: { id: string; email?: string } | null;
}) {
  const tables = options.tables ?? {};
  const rpcResults = options.rpc ?? {};

  function chain(rows: Row[]): unknown {
    const handler: ProxyHandler<object> = {
      get(_target, prop) {
        if (prop === "then") {
          return (resolve: (v: unknown) => unknown, reject: (e: unknown) => unknown) =>
            Promise.resolve({ data: rows, error: null }).then(resolve, reject);
        }
        if (prop === "maybeSingle" || prop === "single") {
          return async () => ({ data: rows[0] ?? null, error: null });
        }
        // select / eq / in / order / limit / ... all keep chaining.
        return () => proxy;
      },
    };
    const proxy: unknown = new Proxy({}, handler);
    return proxy;
  }

  return {
    from: (table: string) => chain(tables[table] ?? []),
    rpc: (name: string) => ({
      then: (resolve: (v: unknown) => unknown, reject: (e: unknown) => unknown) =>
        Promise.resolve({ data: rpcResults[name] ?? null, error: null }).then(resolve, reject),
    }),
    auth: { getUser: async () => ({ data: { user: options.user ?? null }, error: null }) },
    storage: {
      from: () => ({
        createSignedUrls: async (paths: string[]) => ({
          data: paths.map((path) => ({ path, signedUrl: `https://signed.test/${path}` })),
          error: null,
        }),
      }),
    },
  };
}
