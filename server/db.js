// Keep all runtime D1 access here. Schema changes are handled only by migrations.
export function database(env) {
  if (!env.DB) throw new Error('Missing database binding');
  const query = (sql, args = []) => env.DB.prepare(sql).bind(...args);
  return {
    first: (sql, args) => query(sql, args).first(),
    all: async (sql, args) => (await query(sql, args).all()).results,
    run: (sql, args) => query(sql, args).run(),
    batch: items => env.DB.batch(items.map(([sql, args]) => query(sql, args))),
  };
}
