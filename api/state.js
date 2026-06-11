const { Pool } = require("pg");

const STATE_ID = "family-schedule";
const EMPTY_STATE = { events: [], responses: [], anniversaries: [] };

let pool;
let tableReady;

function getPool() {
  const connectionString =
    process.env.DATABASE_URL ||
    process.env.POSTGRES_URL ||
    process.env.PRISMA_DATABASE_URL;

  if (!connectionString) {
    const error = new Error(
      "DATABASE_URL, POSTGRES_URL, or PRISMA_DATABASE_URL is not configured."
    );
    error.statusCode = 500;
    throw error;
  }

  if (!pool) {
    pool = new Pool({
      connectionString,
      ssl: process.env.NODE_ENV === "production"
        ? { rejectUnauthorized: false }
        : undefined,
    });
  }

  return pool;
}

function normalizeState(value) {
  const state = value && typeof value === "object" ? value : EMPTY_STATE;
  return {
    events: Array.isArray(state.events) ? state.events : [],
    responses: Array.isArray(state.responses) ? state.responses : [],
    anniversaries: Array.isArray(state.anniversaries)
      ? state.anniversaries
      : [],
  };
}

async function ensureTable() {
  if (!tableReady) {
    tableReady = getPool().query(`
      CREATE TABLE IF NOT EXISTS family_app_state (
        id TEXT PRIMARY KEY,
        data JSONB NOT NULL,
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);
  }
  await tableReady;
}

async function readState() {
  await ensureTable();
  const result = await getPool().query(
    "SELECT data FROM family_app_state WHERE id = $1",
    [STATE_ID]
  );
  return normalizeState(result.rows[0]?.data);
}

async function writeState(state) {
  await ensureTable();
  const nextState = normalizeState(state);
  await getPool().query(
    `
      INSERT INTO family_app_state (id, data, updated_at)
      VALUES ($1, $2::jsonb, NOW())
      ON CONFLICT (id)
      DO UPDATE SET data = EXCLUDED.data, updated_at = NOW()
    `,
    [STATE_ID, JSON.stringify(nextState)]
  );
  return nextState;
}

function getRequestBody(request) {
  if (Buffer.isBuffer(request.body)) {
    return JSON.parse(request.body.toString("utf8"));
  }

  if (request.body && typeof request.body === "object") {
    return request.body;
  }

  if (typeof request.body === "string") {
    return JSON.parse(request.body);
  }

  return new Promise((resolve, reject) => {
    let body = "";
    request.on("data", (chunk) => {
      body += chunk;
      if (body.length > 1_500_000) {
        reject(new Error("Request body is too large."));
        request.destroy();
      }
    });
    request.on("end", () => {
      try {
        resolve(body ? JSON.parse(body) : {});
      } catch (error) {
        reject(error);
      }
    });
    request.on("error", reject);
  });
}

module.exports = async function handler(request, response) {
  response.setHeader("Content-Type", "application/json; charset=utf-8");
  response.setHeader("Cache-Control", "no-store");

  try {
    if (request.method === "GET") {
      response.status(200).json(await readState());
      return;
    }

    if (request.method === "PUT") {
      const body = await getRequestBody(request);
      response.status(200).json(await writeState(body));
      return;
    }

    response.setHeader("Allow", "GET, PUT");
    response.status(405).json({ error: "Method not allowed" });
  } catch (error) {
    response.status(error.statusCode || 500).json({
      error: error.message || "Unexpected server error",
    });
  }
};
