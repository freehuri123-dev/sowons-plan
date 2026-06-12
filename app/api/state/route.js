import { Pool } from "pg";

const STATE_ID = "family-schedule";
const EMPTY_STATE = {
  events: [],
  responses: [],
  anniversaries: [],
  locations: {},
  locationRequests: {},
};

let pool;
let tableReady;
let memoryState = EMPTY_STATE;

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

function normalizeLocationEntry(value) {
  if (!value || typeof value !== "object") return null;
  const latitude = Number(value.latitude);
  const longitude = Number(value.longitude);
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return null;

  return {
    id: value.id || `location-${value.updatedAt || Date.now()}-${latitude}-${longitude}`,
    latitude,
    longitude,
    accuracy: Number.isFinite(Number(value.accuracy))
      ? Number(value.accuracy)
      : null,
    updatedAt: value.updatedAt || new Date().toISOString(),
    address: value.address || "",
    source: value.source || "",
  };
}

function normalizeMemberLocation(value) {
  if (!value || typeof value !== "object") {
    return { latest: null, history: [] };
  }

  const history = Array.isArray(value.history)
    ? value.history.map(normalizeLocationEntry).filter(Boolean)
    : [];
  const legacyEntry = normalizeLocationEntry(value);
  const mergedHistory = history.length > 0 ? history : legacyEntry ? [legacyEntry] : [];
  const latest =
    normalizeLocationEntry(value.latest) ||
    mergedHistory
      .slice()
      .sort((left, right) => String(left.updatedAt).localeCompare(String(right.updatedAt)))
      .at(-1) ||
    null;

  return { latest, history: mergedHistory };
}

function normalizeLocationRequest(value) {
  if (!value || typeof value !== "object") return null;
  const requestLog = Array.isArray(value.requestLog)
    ? value.requestLog.filter(Boolean).map(String)
    : [];
  return {
    id: value.id || `request-${Date.now()}`,
    status: ["pending", "completed", "failed"].includes(value.status)
      ? value.status
      : "pending",
    requestedAt: value.requestedAt || new Date().toISOString(),
    requestedBy: value.requestedBy || "",
    completedAt: value.completedAt || "",
    locationId: value.locationId || "",
    message: value.message || "",
    requestLog,
  };
}

function normalizeState(value) {
  const state = value && typeof value === "object" ? value : EMPTY_STATE;
  const rawLocations =
    state.locations && typeof state.locations === "object" && !Array.isArray(state.locations)
      ? state.locations
      : {};
  const locations = Object.fromEntries(
    Object.entries(rawLocations).map(([memberId, location]) => [
      memberId,
      normalizeMemberLocation(location),
    ])
  );
  const rawLocationRequests =
    state.locationRequests &&
    typeof state.locationRequests === "object" &&
    !Array.isArray(state.locationRequests)
      ? state.locationRequests
      : {};
  const locationRequests = Object.fromEntries(
    Object.entries(rawLocationRequests)
      .map(([memberId, request]) => [memberId, normalizeLocationRequest(request)])
      .filter(([, request]) => request)
  );

  return {
    events: Array.isArray(state.events) ? state.events : [],
    responses: Array.isArray(state.responses) ? state.responses : [],
    anniversaries: Array.isArray(state.anniversaries)
      ? state.anniversaries
      : [],
    locations,
    locationRequests,
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
    if (!getConnectionString()) {
      return Response.json(normalizeState(memoryState), {
        headers: { "Cache-Control": "no-store" },
      });
    }

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
    if (!getConnectionString()) {
      memoryState = normalizeState(await request.json());
      return Response.json(memoryState, {
        headers: { "Cache-Control": "no-store" },
      });
    }

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
