import { execFileSync } from 'node:child_process';
import { Client } from 'pg';
import { URL } from 'node:url';

function requiredTestUrl() {
  const raw = process.env.TEST_DATABASE_URL;
  if (!raw) throw new Error('TEST_DATABASE_URL is required for integration tests');
  const url = new URL(raw);
  const database = decodeURIComponent(url.pathname.slice(1));
  if (!database.toLowerCase().includes('test')) {
    throw new Error(`Refusing integration tests: database name must contain "test", got "${database}"`);
  }
  return { raw, url, database };
}

async function main() {
  const { url, database } = requiredTestUrl();
  const admin = new URL(url.toString());
  admin.pathname = '/postgres';
  const client = new Client({ connectionString: admin.toString() });
  await client.connect();
  await client.query(`DROP DATABASE IF EXISTS "${database.replaceAll('"', '""')}" WITH (FORCE)`);
  await client.query(`CREATE DATABASE "${database.replaceAll('"', '""')}"`);
  await client.end();

  const env = {
    ...process.env,
    DB_HOST: url.hostname,
    DB_PORT: url.port || '5432',
    DB_USERNAME: decodeURIComponent(url.username),
    DB_PASSWORD: decodeURIComponent(url.password),
    DB_NAME: database,
    DB_SYNCHRONIZE: 'false',
    NODE_ENV: 'test',
  };
  execFileSync('npm', ['run', 'migration:run'], {
    cwd: process.cwd(),
    env,
    stdio: 'inherit',
  });
  for (let i = 0; i < 4; i += 1) {
    execFileSync('npm', ['run', 'migration:revert'], { cwd: process.cwd(), env, stdio: 'inherit' });
  }
  execFileSync('npm', ['run', 'migration:run'], { cwd: process.cwd(), env, stdio: 'inherit' });
}

void main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
