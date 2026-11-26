export const isPostgresDb = (): boolean =>
  (process.env.DB_TYPE || 'sqlite').toLowerCase() === 'postgres';

export const dateColumnType = (): 'timestamptz' | 'datetime' =>
  isPostgresDb() ? 'timestamptz' : 'datetime';
