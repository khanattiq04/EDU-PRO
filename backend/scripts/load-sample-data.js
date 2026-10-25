// Prepares the local database for testing:
//   1. creates the database (DB_NAME) if it does not exist
//   2. imports database/edu-pro.sql when the tables are missing
//   3. imports database/sample-data.sql (safe to run again; nothing duplicates)
// Usage:  npm run seed:samples      (uses the DB_* settings in backend/.env)
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import mysql from 'mysql2/promise';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const dbName = process.env.DB_NAME || 'danistan_network';
const config = {
  host: process.env.DB_HOST || '127.0.0.1',
  port: Number(process.env.DB_PORT || 3306),
  user: process.env.DB_USER || 'root',
  password: process.env.DB_PASSWORD || '',
  multipleStatements: true,
  charset: 'utf8mb4_unicode_ci'
};

async function main() {
  const connection = await mysql.createConnection(config);
  try {
    await connection.query(`CREATE DATABASE IF NOT EXISTS \`${dbName.replace(/`/g, '')}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`);
    await connection.changeUser({ database: dbName });
    const [[{ count }]] = await connection.query(
      "SELECT COUNT(*) AS count FROM information_schema.tables WHERE table_schema = ? AND table_name = 'students'", [dbName]
    );
    if (!Number(count)) {
      console.log(`Importing database/edu-pro.sql into ${dbName} ...`);
      await connection.query(fs.readFileSync(path.join(root, 'database', 'edu-pro.sql'), 'utf8'));
    }
    console.log('Loading sample students, quizzes and course material ...');
    await connection.query(fs.readFileSync(path.join(root, 'database', 'sample-data.sql'), 'utf8'));
    const [[students]] = await connection.query("SELECT COUNT(*) AS n FROM students WHERE email LIKE 'student%@danistan.network'");
    const [[quizzes]] = await connection.query("SELECT COUNT(*) AS n FROM quizzes WHERE title LIKE '[Sample]%'");
    console.log(`Done: ${students.n} sample students, ${quizzes.n} sample quizzes in ${dbName}.`);
  } finally {
    await connection.end();
  }
}

main().catch(error => {
  console.error(`[ERROR] ${error.sqlMessage || error.message}`);
  console.error('Check DB_HOST / DB_PORT / DB_USER / DB_PASSWORD / DB_NAME in backend/.env and that MySQL is running.');
  process.exit(1);
});
