import { Pool } from "pg";

const STATE_ID = "family-schedule";
const EMPTY_STATE = { events: [], responses: [], anniversaries: [] };

let pool;
let tableReady;

function getConnectionString() {
  return (
    process.env.DATABASE_URL ||
    process.env.POSTGRES_URL ||
    process.env.PRISMA_DATABASE_URL
  );
}

function getPool() {
  const connectionString = getConnectionString();
  if (!connectionString) {
    throw new Error(
      "DATABASE_URL, POSTGRES_URL, or PRISMA_DATABASE_URL is not configured."
    );
  }

  if (!pool) {
    pool = new Pool({
      connectionString,
      ssl:
        process.env.NODE_ENV === "production"
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

export async function GET() {
  try {
    await ensureTable();
    const result = await getPool().query(
      "SELECT data FROM family_app_state WHERE id = $1",
      [STATE_ID]
    );

    return Response.json(normalizeState(result.rows[0]?.data), {
      headers: { "Cache-Control": "no-store" },
    });
  } catch (error) {
    return Response.json(
      { error: error.message || "Unexpected server error" },
      { status: 500 }
    );
  }
}

export async function PUT(request) {
  try {
    await ensureTable();
    const state = normalizeState(await request.json());
    await getPool().query(
      `
        INSERT INTO family_app_state (id, data, updated_at)
        VALUES ($1, $2::jsonb, NOW())
        ON CONFLICT (id)
        DO UPDATE SET data = EXCLUDED.data, updated_at = NOW()
      `,
      [STATE_ID, JSON.stringify(state)]
    );

    return Response.json(state, {
      headers: { "Cache-Control": "no-store" },
    });
  } catch (error) {
    return Response.json(
      { error: error.message || "Unexpected server error" },
      { status: 500 }
    );
  }
}
