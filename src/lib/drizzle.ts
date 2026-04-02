import { drizzle } from 'drizzle-orm/node-postgres';


export const db = drizzle({
  connection: {
    user: process.env.DATABASE_USER!,
    password: process.env.DATABASE_PASSWORD!,
    host: process.env.DATABASE_HOST!,
    port: Number.parseInt(process.env.DATABASE_PORT!, 10),
    database: process.env.DATABASE_NAME!,
    ssl: process.env.DATABASE_SSL === 'true',
  },
});
