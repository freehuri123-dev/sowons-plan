function getEventTimestamp(event) {
  return `${event.date || "9999-12-31"}T${event.time || "23:59"}`;
}

function sortEvents(events) {
  return [...events].sort((left, right) =>
    getEventTimestamp(left).localeCompare(getEventTimestamp(right))
  );
}

function setResponse(responses, eventId, memberId, status) {
  const nextResponses = responses.filter(
    (response) =>
      !(response.eventId === eventId && response.memberId === memberId)
  );

  return [...nextResponses, { eventId, memberId, status }];
}

function getResponseSummary(members, responses, eventId) {
  const summary = {
    available: 0,
    unavailable: 0,
    waiting: 0,
  };

  for (const member of members) {
    const response = responses.find(
      (item) => item.eventId === eventId && item.memberId === member.id
    );

    if (!response || !["available", "unavailable"].includes(response.status)) {
      summary.waiting += 1;
    } else {
      summary[response.status] += 1;
    }
  }

  return summary;
}

function createEvent(input) {
  const checklist = Array.isArray(input.checklist)
    ? input.checklist
        .map((item) => String(item).trim())
        .filter(Boolean)
        .map((text, index) => ({
          id: `item-${index + 1}`,
          text,
          done: false,
        }))
    : [];

  return {
    id: `event-${Date.now()}-${Math.random().toString(16).slice(2)}`,
    title: input.title.trim(),
    date: input.date,
    time: input.time || "",
    note: input.note.trim(),
    category: input.category || "family",
    needsResponse: Boolean(input.needsResponse),
    visibleTo: Array.isArray(input.visibleTo) && input.visibleTo.length > 0
      ? input.visibleTo
      : ["all"],
    checklist,
    attachmentName: input.attachmentName || "",
    attachmentDataUrl: input.attachmentDataUrl || "",
  };
}

const KOREAN_PUBLIC_HOLIDAYS = new Set([
  "2026-01-01",
  "2026-02-16",
  "2026-02-17",
  "2026-02-18",
  "2026-03-01",
  "2026-03-02",
  "2026-05-05",
  "2026-05-24",
  "2026-05-25",
  "2026-06-06",
  "2026-08-15",
  "2026-09-24",
  "2026-09-25",
  "2026-09-26",
  "2026-09-27",
  "2026-10-03",
  "2026-10-05",
  "2026-10-09",
  "2026-12-25",
]);

function isKoreanPublicHoliday(date) {
  return KOREAN_PUBLIC_HOLIDAYS.has(date);
}

function toDateKey(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function buildMonthCalendar(events, monthLabel) {
  const [year, month] = monthLabel.split("-").map(Number);
  const firstDay = new Date(year, month - 1, 1);
  const lastDay = new Date(year, month, 0);
  const calendarStart = new Date(firstDay);
  calendarStart.setDate(firstDay.getDate() - firstDay.getDay());

  const calendarEnd = new Date(lastDay);
  calendarEnd.setDate(lastDay.getDate() + (6 - lastDay.getDay()));

  const sortedEvents = sortEvents(events);
  const weeks = [];
  let cursor = new Date(calendarStart);

  while (cursor <= calendarEnd) {
    const week = [];

    for (let dayIndex = 0; dayIndex < 7; dayIndex += 1) {
      const date = toDateKey(cursor);
      week.push({
        date,
        day: cursor.getDate(),
        dayOfWeek: cursor.getDay(),
        isCurrentMonth: cursor.getMonth() === month - 1,
        isHoliday: isKoreanPublicHoliday(date),
        events: sortedEvents.filter(
          (event) => event.date === date && event.date.startsWith(monthLabel)
        ),
      });
      cursor.setDate(cursor.getDate() + 1);
    }

    weeks.push(week);
  }

  return {
    monthLabel,
    weeks,
  };
}

function getNextUpcomingEvent(events, today) {
  return sortEvents(events).find((event) => event.date >= today) || null;
}

function getEventsForDate(events, date) {
  return sortEvents(events).filter((event) => event.date === date);
}

function getLunarMonthDay(date) {
  const formatter = new Intl.DateTimeFormat("ko-KR-u-ca-chinese", {
    month: "numeric",
    day: "numeric",
  });
  const parts = formatter.formatToParts(date);
  const month = parts.find((part) => part.type === "month")?.value;
  const day = parts.find((part) => part.type === "day")?.value;
  return `${String(Number(month)).padStart(2, "0")}-${String(Number(day)).padStart(2, "0")}`;
}

function findSolarDateForLunarMonthDay(year, monthDay) {
  const cursor = new Date(year, 0, 1);

  while (cursor.getFullYear() === year) {
    if (getLunarMonthDay(cursor) === monthDay) {
      return toDateKey(cursor);
    }
    cursor.setDate(cursor.getDate() + 1);
  }

  return `${year}-${monthDay}`;
}

function getAnnualEventsForYear(anniversaries, year) {
  return anniversaries.map((anniversary) => ({
    id: `annual-${anniversary.id}-${year}`,
    annualId: anniversary.id,
    title: anniversary.title,
    date:
      anniversary.calendarType === "lunar"
        ? findSolarDateForLunarMonthDay(year, anniversary.monthDay)
        : `${year}-${anniversary.monthDay}`,
    time: "",
    note:
      anniversary.note ||
      (anniversary.calendarType === "lunar"
        ? "매년 음력으로 돌아오는 기념일"
        : "매년 돌아오는 기념일"),
    category: "anniversary",
    needsResponse: false,
    checklist: [],
    readonly: true,
  }));
}

function createAnniversary(input) {
  return {
    id: `anniversary-${Date.now()}-${Math.random().toString(16).slice(2)}`,
    title: input.title.trim(),
    monthDay: input.date.slice(5),
    calendarType: input.calendarType === "lunar" ? "lunar" : "solar",
  };
}

function getRecurringAnniversaryEventsForYear(events, year) {
  return events
    .filter((event) => event.category === "anniversary")
    .filter((event) => Number(event.date.slice(0, 4)) !== year)
    .map((event) => ({
      id: `annual-${event.id}-${year}`,
      annualId: event.id,
      title: event.title,
      date: `${year}-${event.date.slice(5)}`,
      time: event.time || "",
      note: event.note || "매년 돌아오는 기념일",
      category: "anniversary",
      needsResponse: false,
      checklist: Array.isArray(event.checklist) ? event.checklist : [],
      readonly: true,
    }));
}

function isAdminPassword(password) {
  return String(password).trim() === "1234";
}

function isEventVisibleTo(event, memberId) {
  if (!Array.isArray(event.visibleTo) || event.visibleTo.length === 0) {
    return true;
  }

  return event.visibleTo.includes("all") || event.visibleTo.includes(memberId);
}

function getVisibleEvents(events, memberId) {
  return events.filter((event) => isEventVisibleTo(event, memberId));
}

const EMPTY_STATE = {
  events: [],
  responses: [],
  anniversaries: [],
  locations: {},
  locationRequests: {},
};

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

function canRequestLocation(request, now = new Date().toISOString()) {
  const currentTime = new Date(now).getTime();
  const requestLog = Array.isArray(request?.requestLog) ? request.requestLog : [];
  const recentCount = requestLog.filter((requestedAt) => {
    const requestedTime = new Date(requestedAt).getTime();
    return (
      Number.isFinite(requestedTime) &&
      currentTime - requestedTime < 10 * 60 * 1000
    );
  }).length;

  return recentCount < 3;
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

const scheduleCore = {
  sortEvents,
  setResponse,
  getResponseSummary,
  createEvent,
  buildMonthCalendar,
  getNextUpcomingEvent,
  getEventsForDate,
  isKoreanPublicHoliday,
  getAnnualEventsForYear,
  createAnniversary,
  getRecurringAnniversaryEventsForYear,
  isAdminPassword,
  getVisibleEvents,
  normalizeState,
  canRequestLocation,
};

if (typeof module !== "undefined") {
  module.exports = scheduleCore;
}

if (typeof window !== "undefined") {
  window.scheduleCore = scheduleCore;
}
