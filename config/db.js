const { Pool } = require("pg");

const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false }
});

pool.connect()
    .then(() => console.log("🐘 PostgreSQL Supabase Connected"))
    .catch(err => console.error("❌ PostgreSQL Error:", err));

module.exports = pool;