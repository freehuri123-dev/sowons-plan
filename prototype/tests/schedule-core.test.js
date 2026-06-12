const test = require("node:test");
const assert = require("node:assert/strict");

const {
  sortEvents,
  setResponse,
  getResponseSummary,
  createEvent,
  buildMonthCalendar,
  getNextUpcomingEvent,
  getEventsForDate,
  isKoreanPublicHoliday,
  getAnnualEventsForYear,
  getRecurringAnniversaryEventsForYear,
  createAnniversary,
  getVisibleEvents,
  isAdminPassword,
  normalizeState,
} = require("../schedule-core");

test("sortEvents orders events by date and time", () => {
  const events = [
    { id: "late", date: "2026-06-12", time: "19:00" },
    { id: "early", date: "2026-06-11", time: "09:00" },
    { id: "middle", date: "2026-06-11", time: "18:00" },
  ];

  assert.deepEqual(sortEvents(events).map((event) => event.id), [
    "early",
    "middle",
    "late",
  ]);
});

test("setResponse replaces a member response for the same event", () => {
  const responses = [
    { eventId: "event-1", memberId: "mom", status: "unsure" },
  ];

  const updated = setResponse(responses, "event-1", "mom", "available");

  assert.deepEqual(updated, [
    { eventId: "event-1", memberId: "mom", status: "available" },
  ]);
});

test("getResponseSummary counts available, unavailable, and waiting members", () => {
  const members = [
    { id: "mom" },
    { id: "dad" },
    { id: "child" },
    { id: "grandma" },
  ];
  const responses = [
    { eventId: "event-1", memberId: "mom", status: "available" },
    { eventId: "event-1", memberId: "dad", status: "unavailable" },
    { eventId: "event-1", memberId: "child", status: "unsure" },
    { eventId: "event-2", memberId: "grandma", status: "available" },
  ];

  assert.deepEqual(getResponseSummary(members, responses, "event-1"), {
    available: 1,
    unavailable: 1,
    waiting: 2,
  });
});

test("createEvent trims fields and assigns an id", () => {
  const event = createEvent({
    title: "  Dinner  ",
    date: "2026-06-11",
    time: "18:30",
    note: "  bring dessert  ",
    category: "family",
    needsResponse: true,
    checklist: [" umbrella ", "", "gift"],
  });

  assert.equal(event.title, "Dinner");
  assert.equal(event.note, "bring dessert");
  assert.equal(event.category, "family");
  assert.equal(event.needsResponse, true);
  assert.deepEqual(event.checklist, [
    { id: "item-1", text: "umbrella", done: false },
    { id: "item-2", text: "gift", done: false },
  ]);
  assert.match(event.id, /^event-/);
});

test("buildMonthCalendar creates calendar cells with events for a target month", () => {
  const events = [
    { id: "june-early", title: "Early", date: "2026-06-01", time: "09:00" },
    { id: "june-late", title: "Late", date: "2026-06-15", time: "18:00" },
    { id: "july", title: "Other", date: "2026-07-01", time: "10:00" },
  ];

  const calendar = buildMonthCalendar(events, "2026-06");

  assert.equal(calendar.monthLabel, "2026-06");
  assert.equal(calendar.weeks.length, 5);
  assert.equal(calendar.weeks[0][0].date, "2026-05-31");
  assert.equal(calendar.weeks[0][0].dayOfWeek, 0);
  assert.equal(calendar.weeks[0][1].date, "2026-06-01");
  assert.equal(calendar.weeks[0][6].dayOfWeek, 6);
  assert.equal(calendar.weeks[0][1].isCurrentMonth, true);
  assert.deepEqual(calendar.weeks[0][1].events.map((event) => event.id), [
    "june-early",
  ]);
  assert.equal(calendar.weeks[4][3].date, "2026-07-01");
  assert.deepEqual(calendar.weeks[4][3].events, []);
});

test("buildMonthCalendar marks Korean public holidays", () => {
  const calendar = buildMonthCalendar([], "2026-05");
  const childrenDay = calendar.weeks
    .flat()
    .find((cell) => cell.date === "2026-05-05");

  assert.equal(childrenDay.isHoliday, true);
});

test("getNextUpcomingEvent returns the nearest event on or after today", () => {
  const events = [
    { id: "past", date: "2026-06-10", time: "20:00" },
    { id: "later", date: "2026-06-12", time: "09:00" },
    { id: "next", date: "2026-06-11", time: "18:00" },
  ];

  assert.equal(getNextUpcomingEvent(events, "2026-06-11").id, "next");
});

test("getNextUpcomingEvent returns null when there are no upcoming events", () => {
  const events = [{ id: "past", date: "2026-06-10", time: "20:00" }];

  assert.equal(getNextUpcomingEvent(events, "2026-06-11"), null);
});

test("getEventsForDate returns sorted events for one date", () => {
  const events = [
    { id: "late", date: "2026-06-11", time: "20:00" },
    { id: "other", date: "2026-06-12", time: "09:00" },
    { id: "early", date: "2026-06-11", time: "08:00" },
  ];

  assert.deepEqual(getEventsForDate(events, "2026-06-11").map((event) => event.id), [
    "early",
    "late",
  ]);
});

test("isKoreanPublicHoliday recognizes configured 2026 holidays", () => {
  assert.equal(isKoreanPublicHoliday("2026-01-01"), true);
  assert.equal(isKoreanPublicHoliday("2026-06-11"), false);
});

test("getAnnualEventsForYear generates birthday and anniversary events", () => {
  const anniversaries = [
    {
      id: "sowon-birthday",
      title: "소원이 생일",
      monthDay: "04-12",
      calendarType: "solar",
    },
  ];

  assert.deepEqual(getAnnualEventsForYear(anniversaries, 2027), [
    {
      id: "annual-sowon-birthday-2027",
      annualId: "sowon-birthday",
      title: "소원이 생일",
      date: "2027-04-12",
      time: "",
      note: "매년 돌아오는 기념일",
      category: "anniversary",
      needsResponse: false,
      checklist: [],
      readonly: true,
    },
  ]);
});

test("createAnniversary trims title and stores month-day from a date", () => {
  const anniversary = createAnniversary({
    title: " 엄마 생일 ",
    date: "2026-03-10",
    calendarType: "lunar",
  });

  assert.equal(anniversary.title, "엄마 생일");
  assert.equal(anniversary.monthDay, "03-10");
  assert.equal(anniversary.calendarType, "lunar");
  assert.match(anniversary.id, /^anniversary-/);
});

test("getAnnualEventsForYear converts lunar anniversaries to solar dates in the target year", () => {
  const anniversaries = [
    {
      id: "lunar-birthday",
      title: "음력 생일",
      monthDay: "12-12",
      calendarType: "lunar",
    },
  ];

  assert.equal(
    getAnnualEventsForYear(anniversaries, 2027)[0].date,
    "2027-01-19"
  );
});

test("getRecurringAnniversaryEventsForYear repeats user anniversary events in another year", () => {
  const events = [
    {
      id: "event-birthday",
      title: "엄마 생일",
      date: "2026-03-10",
      time: "",
      note: "케이크 준비",
      category: "anniversary",
      needsResponse: false,
      checklist: [],
    },
    {
      id: "event-dinner",
      title: "가족 저녁",
      date: "2026-03-10",
      time: "18:00",
      note: "",
      category: "family",
      needsResponse: true,
      checklist: [],
    },
  ];

  assert.deepEqual(getRecurringAnniversaryEventsForYear(events, 2027), [
    {
      id: "annual-event-birthday-2027",
      annualId: "event-birthday",
      title: "엄마 생일",
      date: "2027-03-10",
      time: "",
      note: "케이크 준비",
      category: "anniversary",
      needsResponse: false,
      checklist: [],
      readonly: true,
    },
  ]);
});

test("isAdminPassword only accepts the family admin password", () => {
  assert.equal(isAdminPassword("1234"), true);
  assert.equal(isAdminPassword(" 1234 "), true);
  assert.equal(isAdminPassword("1111"), false);
});

test("getVisibleEvents includes all-family events and member-specific events", () => {
  const events = [
    { id: "all", visibleTo: ["all"] },
    { id: "mom", visibleTo: ["mom"] },
    { id: "dad", visibleTo: ["dad"] },
    { id: "legacy" },
  ];

  assert.deepEqual(getVisibleEvents(events, "mom").map((event) => event.id), [
    "all",
    "mom",
    "legacy",
  ]);
});

test("normalizeState preserves member location history", () => {
  const normalized = normalizeState({
    events: [],
    responses: [],
    anniversaries: [],
    locations: {
      sowon: {
        latest: { id: "loc-2", latitude: 37.5665, longitude: 126.978 },
        history: [
          { id: "loc-1", latitude: 37.565, longitude: 126.977 },
          { id: "loc-2", latitude: 37.5665, longitude: 126.978 },
        ],
      },
    },
  });

  assert.equal(normalized.locations.sowon.latest.id, "loc-2");
  assert.deepEqual(
    normalized.locations.sowon.history.map((location) => location.id),
    ["loc-1", "loc-2"]
  );
});

test("normalizeState migrates a legacy latest-only member location", () => {
  const normalized = normalizeState({
    locations: {
      sowon: {
        latitude: 37.5665,
        longitude: 126.978,
        accuracy: 20,
        updatedAt: "2026-06-12T06:00:00.000Z",
      },
    },
  });

  assert.equal(normalized.locations.sowon.latest.latitude, 37.5665);
  assert.equal(normalized.locations.sowon.history.length, 1);
});

test("normalizeState preserves location requests", () => {
  const normalized = normalizeState({
    locationRequests: {
      sowon: {
        id: "request-1",
        status: "pending",
        requestedAt: "2026-06-12T09:00:00.000Z",
        requestedBy: "mom",
      },
    },
  });

  assert.deepEqual(normalized.locationRequests.sowon, {
    id: "request-1",
    status: "pending",
    requestedAt: "2026-06-12T09:00:00.000Z",
    requestedBy: "mom",
    completedAt: "",
    locationId: "",
    message: "",
  });
});
