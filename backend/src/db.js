import mysql from 'mysql2/promise';

const pool = mysql.createPool({
  host: process.env.DB_HOST || '127.0.0.1',
  port: Number(process.env.DB_PORT || 3306),
  user: process.env.DB_USER || 'root',
  password: process.env.DB_PASSWORD || '',
  database: process.env.DB_NAME || 'danistan_network',
  waitForConnections: true,
  connectionLimit: Number(process.env.DB_POOL_SIZE || 10),
  queueLimit: 0,
  charset: 'utf8mb4_unicode_ci',
  dateStrings: true,
  decimalNumbers: true
});

async function select(sql, params = []) {
  const [rows] = await pool.query(sql, params);
  return rows;
}

export { select as all };

export async function one(sql, params = []) {
  const rows = await select(sql, params);
  return rows[0];
}

export async function run(sql, params = []) {
  const [result] = await pool.query(sql, params);
  return result;
}

export async function assertConnection() {
  const connection = await pool.getConnection();
  try {
    await connection.ping();
  } finally {
    connection.release();
  }
}

export async function closePool() {
  await pool.end();
}

export default pool;
