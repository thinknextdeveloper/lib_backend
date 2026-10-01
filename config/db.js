require("dotenv").config();

const useWindowsAuth =
  String(process.env.DB_TRUSTED_CONNECTION || "").toLowerCase() === "true";

// Windows login needs the msnodesqlv8 driver; SQL login uses the default one
const sql = useWindowsAuth ? require("mssql/msnodesqlv8") : require("mssql");

const poolOptions = { max: 10, min: 0, idleTimeoutMillis: 30000 };

let config;

if (useWindowsAuth) {
  const odbcDriver = process.env.DB_ODBC_DRIVER || "ODBC Driver 17 for SQL Server";
  const server = process.env.DB_PORT
    ? `${process.env.DB_SERVER},${process.env.DB_PORT}`
    : process.env.DB_SERVER;

  config = {
    connectionString:
      `Driver={${odbcDriver}};Server=${server};Database=${process.env.DB_DATABASE};` +
      `Trusted_Connection=Yes;TrustServerCertificate=Yes;`,
    pool: poolOptions,
  };
} else {
  config = {
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    server: process.env.DB_SERVER,
    database: process.env.DB_DATABASE,
    port: Number(process.env.DB_PORT || 1433),
    options: {
      encrypt: true,
      trustServerCertificate: true,
    },
    pool: poolOptions,
  };
}

console.log(
  "SQL Server target -> database:",
  process.env.DB_DATABASE,
  "| auth:",
  useWindowsAuth ? "Windows" : "SQL login"
);

let pool = null;

async function connectDB() {
  try {
    if (pool && pool.connected) return pool;

    console.log("🔄 Connecting to SQL Server...");
    pool = await sql.connect(config);
    console.log("✅ SQL Server Connected Successfully");

    return pool;
  } catch (err) {
    console.error("❌ Database Connection Error:", err.message);
    throw err;
  }
}

async function getPool() {
  if (!pool || !pool.connected) {
    if (pool) {
      try {
        await pool.close();
      } catch (e) {}
    }
    pool = await connectDB();
  }
  return pool;
}

async function withRetry(callback, retries = 3) {
  let lastError;

  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      const currentPool = await getPool();
      return await callback(currentPool);
    } catch (err) {
      // SQL/query errors won't be fixed by retrying
      if (err.code === "EREQUEST") throw err;

      lastError = err;
      console.error(
        `❌ Database operation failed (Attempt ${attempt}/${retries}):`,
        err.message
      );

      if (pool) {
        try {
          await pool.close();
        } catch (e) {}
        pool = null;
      }

      if (attempt < retries) {
        await new Promise((resolve) => setTimeout(resolve, 1000));
      }
    }
  }

  throw lastError;
}

async function closeDB() {
  if (pool) {
    try {
      await pool.close();
      pool = null;
      console.log("🔒 SQL Server Connection Closed");
    } catch (err) {
      console.error("Error closing database:", err.message);
    }
  }
}

module.exports = { sql, config, connectDB, getPool, withRetry, closeDB };