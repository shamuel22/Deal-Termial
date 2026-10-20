import { runMigrations } from './migrate.js';

const url = process.env.DATABASE_URL;
if (!url) {
  console.error('DATABASE_URL is not defined');
  process.exit(1);
}
const result = await runMigrations(url);
console.log(result.applied ? 'Migrations applied' : 'No migrations');
