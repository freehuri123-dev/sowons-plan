"use client";

import { useEffect, useRef, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";

const MEMBERS = [
  { id: "mom", name: "엄마", color: "#d9578f" },
  { id: "dad", name: "아빠", color: "#2f6fab" },
  { id: "sowon", name: "소원이", color: "#2f9b73" },
];

const CATEGORIES = [
  { id: "family", name: "가족", color: "#ffcb4d" },
  { id: "school", name: "학교", color: "#7cc7ff" },
  { id: "hospital", name: "병원", color: "#ff8fa3" },
  { id: "outing", name: "외출", color: "#8ee6c3" },
];

const STORAGE_KEY = "family-schedule-prototype";
const ADMIN_SESSION_KEY = "family-admin-ok";
const CURRENT_MEMBER_KEY = "family-current-member";
const EMPTY_STATE = {
  events: [],
  responses: [],
  anniversaries: [],
  locations: {},
  locationRequests: {},
};
const STATUS_LABELS = { available: "가능", unavailable: "불가" };
const NAVER_MAP_CLIENT_ID =
  process.env.NEXT_PUBLIC_NAVER_MAP_CLIENT_ID ||
  "u250WCxCRCRisrg3CCIhhq2lk1cMpKCWBn7Il3r3";

function normalizePath(pathname) {
  const last = pathname.split("/").filter(Boolean).at(-1) || "start";
  return last.replace(".html", "") || "start";
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

function loadCachedState() {
  try {
    const savedState = localStorage.getItem(STORAGE_KEY);
    return savedState ? normalizeState(JSON.parse(savedState)) : EMPTY_STATE;
  } catch {
    return EMPTY_STATE;
  }
}

async function refreshState() {
  const response = await fetch("/api/state", { cache: "no-store" });
  if (!response.ok) throw new Error(`Load failed: ${response.status}`);
  const state = normalizeState(await response.json());
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  return state;
}

async function persistState(state) {
  const normalizedState = normalizeState(state);
  localStorage.setItem(STORAGE_KEY, JSON.stringify(normalizedState));
  const response = await fetch("/api/state", {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(normalizedState),
  });
  if (!response.ok) throw new Error(`Save failed: ${response.status}`);
  return normalizedState;
}

async function getCurrentPosition() {
  const locationModule = await import("../mobile-location");
  return locationModule.getCurrentMobilePosition();
}

function getLocationDateKey(location) {
  return toDateKey(new Date(location.updatedAt || Date.now()));
}

function sortLocations(locations) {
  return [...locations].sort((left, right) =>
    String(left.updatedAt || "").localeCompare(String(right.updatedAt || ""))
  );
}

function sortLocationsRecentFirst(locations) {
  return [...locations].sort((left, right) =>
    String(right.updatedAt || "").localeCompare(String(left.updatedAt || ""))
  );
}

function getLocationsForDate(locations, dateKey) {
  return sortLocations(locations).filter(
    (location) => getLocationDateKey(location) === dateKey
  );
}

function appendMemberLocation(current, memberId, location) {
  const memberLocation = normalizeMemberLocation(current.locations?.[memberId]);
  const entry = normalizeLocationEntry(location);
  if (!entry) return current;

  const history = sortLocations([...memberLocation.history, entry]).slice(-200);
  return {
    ...current,
    locations: {
      ...(current.locations || {}),
      [memberId]: {
        latest: history.at(-1) || entry,
        history,
      },
    },
  };
}

function sortEvents(events) {
  return [...events].sort((left, right) =>
    `${left.date || "9999-12-31"}T${left.time || "23:59"}`.localeCompare(
      `${right.date || "9999-12-31"}T${right.time || "23:59"}`
    )
  );
}

function toDateKey(date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

function todayKey() {
  return toDateKey(new Date());
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

function buildMonthCalendar(events, monthLabel) {
  const [year, month] = monthLabel.split("-").map(Number);
  const firstDay = new Date(year, month - 1, 1);
  const lastDay = new Date(year, month, 0);
  const cursor = new Date(firstDay);
  cursor.setDate(firstDay.getDate() - firstDay.getDay());
  const calendarEnd = new Date(lastDay);
  calendarEnd.setDate(lastDay.getDate() + (6 - lastDay.getDay()));

  const weeks = [];
  const sortedEvents = sortEvents(events);
  while (cursor <= calendarEnd) {
    const week = [];
    for (let index = 0; index < 7; index += 1) {
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
  return weeks;
}

function createEvent(input) {
  return {
    id: `event-${Date.now()}-${Math.random().toString(16).slice(2)}`,
    title: input.title.trim(),
    date: input.date,
    time: input.time || "",
    note: input.note.trim(),
    category: input.category || "family",
    needsResponse: Boolean(input.needsResponse),
    visibleTo:
      Array.isArray(input.visibleTo) && input.visibleTo.length > 0
        ? input.visibleTo
        : ["all"],
    checklist: (input.checklist || []).map((text, index) => ({
      id: `item-${index + 1}`,
      text,
      done: false,
    })),
    attachmentName: input.attachmentName || "",
    attachmentDataUrl: input.attachmentDataUrl || "",
  };
}

function createAnniversary(input) {
  return {
    id: `anniversary-${Date.now()}-${Math.random().toString(16).slice(2)}`,
    title: input.title.trim(),
    monthDay: input.date.slice(5),
    calendarType: input.calendarType === "lunar" ? "lunar" : "solar",
  };
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
    if (getLunarMonthDay(cursor) === monthDay) return toDateKey(cursor);
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
      anniversary.calendarType === "lunar"
        ? "매년 음력으로 찾아오는 기념일"
        : "매년 찾아오는 기념일",
    category: "anniversary",
    needsResponse: false,
    checklist: [],
    readonly: true,
  }));
}

function getVisibleEvents(events, memberId) {
  return events.filter((event) => {
    if (!Array.isArray(event.visibleTo) || event.visibleTo.length === 0) {
      return true;
    }
    return event.visibleTo.includes("all") || event.visibleTo.includes(memberId);
  });
}

function getEventsForDate(events, date) {
  return sortEvents(events).filter((event) => event.date === date);
}

function setResponse(responses, eventId, memberId, status) {
  return [
    ...responses.filter(
      (response) =>
        !(response.eventId === eventId && response.memberId === memberId)
    ),
    { eventId, memberId, status },
  ];
}

function getResponseSummary(members, responses, eventId) {
  const summary = { available: 0, unavailable: 0, waiting: 0 };
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

function formatMonthTitle(monthLabel) {
  const [year, month] = monthLabel.split("-").map(Number);
  return new Intl.DateTimeFormat("ko-KR", {
    year: "numeric",
    month: "long",
  }).format(new Date(year, month - 1, 1));
}

function formatDateTitle(dateLabel) {
  return new Intl.DateTimeFormat("ko-KR", {
    month: "long",
    day: "numeric",
    weekday: "long",
  }).format(new Date(`${dateLabel}T00:00`));
}

function formatEventDate(event) {
  const options = { month: "long", day: "numeric", weekday: "short" };
  if (event.time) {
    options.hour = "2-digit";
    options.minute = "2-digit";
  }
  return new Intl.DateTimeFormat("ko-KR", options).format(
    new Date(`${event.date}T${event.time || "00:00"}`)
  );
}

function formatEventTime(event) {
  if (!event.time) return "시간 미정";
  return new Intl.DateTimeFormat("ko-KR", {
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(`${event.date}T${event.time}`));
}

function formatLocationTime(value) {
  if (!value) return "확인 안 됨";
  return new Intl.DateTimeFormat("ko-KR", {
    month: "long",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}

function formatLocationRequestStatus(request) {
  if (request.status === "pending") {
    return `${formatLocationTime(request.requestedAt)}에 요청했어요. 소원이 앱이 켜져 있으면 곧 저장돼요.`;
  }
  if (request.status === "completed") {
    return `${formatLocationTime(request.completedAt)}에 현재 위치를 받았어요.`;
  }
  return "위치 요청을 처리하지 못했어요.";
}

function getCategory(event) {
  return (
    CATEGORIES.find((category) => category.id === event.category) ||
    CATEGORIES[0]
  );
}

function readAttachment(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.addEventListener("load", () => resolve(reader.result));
    reader.addEventListener("error", reject);
    reader.readAsDataURL(file);
  });
}

function getInitialMonth() {
  const today = new Date();
  return `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}`;
}

function shiftMonth(monthLabel, offset) {
  const [year, month] = monthLabel.split("-").map(Number);
  const date = new Date(year, month - 1 + offset, 1);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
}

export default function ClientApp() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const route = normalizePath(pathname);
  const [state, setState] = useState(EMPTY_STATE);
  const [admin, setAdmin] = useState(false);
  const [memberId, setMemberId] = useState("sowon");
  const [selectedMonth, setSelectedMonth] = useState(getInitialMonth);
  const [loaded, setLoaded] = useState(false);
  const [nativeApp, setNativeApp] = useState(false);
  const locationSavedRef = useRef(false);
  const handledLocationRequestRef = useRef("");

  useEffect(() => {
    setAdmin(sessionStorage.getItem(ADMIN_SESSION_KEY) === "1");
    setMemberId(sessionStorage.getItem(CURRENT_MEMBER_KEY) || "sowon");
    setNativeApp(Boolean(window.Capacitor?.isNativePlatform?.()));
    setState(loadCachedState());
    setLoaded(true);
    refreshState()
      .then((nextState) => setState(nextState))
      .catch((error) => console.info("Using cached schedule state.", error));
  }, []);

  useEffect(() => {
    document.body.classList.toggle("entrance-page", route === "start");
    return () => document.body.classList.remove("entrance-page");
  }, [route]);

  const navigate = (href) => router.push(href);
  const saveState = async (updater) => {
    const nextState =
      typeof updater === "function" ? updater(state) : normalizeState(updater);
    setState(nextState);
    await persistState(nextState);
  };

  async function saveSowonLocation({ request } = {}) {
    const position = await getCurrentPosition();
    if (!position) return null;

    const current = await refreshState().catch(() => state);
    const updatedAt = new Date(position.timestamp || Date.now()).toISOString();
    const locationId = `location-${updatedAt}-${Math.random().toString(16).slice(2)}`;
    const nextState = normalizeState(
      appendMemberLocation(current, "sowon", {
        id: locationId,
        latitude: position.latitude,
        longitude: position.longitude,
        accuracy: position.accuracy,
        updatedAt,
        source: request ? "android-request" : "android",
      })
    );

    if (request) {
      nextState.locationRequests = {
        ...(nextState.locationRequests || {}),
        sowon: {
          ...request,
          status: "completed",
          completedAt: updatedAt,
          locationId,
          message: "",
        },
      };
    }

    setState(nextState);
    await persistState(nextState);
    return nextState;
  }

  useEffect(() => {
    if (
      !loaded ||
      memberId !== "sowon" ||
      locationSavedRef.current ||
      !window.Capacitor?.isNativePlatform?.()
    ) {
      return;
    }

    locationSavedRef.current = true;
    saveSowonLocation()
      .catch((error) =>
        console.info("Sowon location auto-save skipped.", error)
      );
  }, [loaded, memberId, nativeApp]);

  useEffect(() => {
    if (!loaded || memberId !== "sowon" || !nativeApp) return;

    let stopped = false;
    async function checkLocationRequest() {
      try {
        const current = await refreshState();
        const request = normalizeLocationRequest(
          current.locationRequests?.sowon
        );
        if (
          stopped ||
          !request ||
          request.status !== "pending" ||
          handledLocationRequestRef.current === request.id
        ) {
          return;
        }

        handledLocationRequestRef.current = request.id;
        await saveSowonLocation({ request });
      } catch (error) {
        console.info("Sowon location request check skipped.", error);
      }
    }

    checkLocationRequest();
    const timerId = window.setInterval(checkLocationRequest, 15000);
    return () => {
      stopped = true;
      window.clearInterval(timerId);
    };
  }, [loaded, memberId, nativeApp]);

  const context = {
    admin,
    memberId,
    route,
    state,
    setState,
    saveState,
    selectedMonth,
    setSelectedMonth,
    navigate,
    searchParams,
    nativeApp,
    setSession(nextMemberId, isAdmin) {
      if (isAdmin) {
        sessionStorage.setItem(ADMIN_SESSION_KEY, "1");
      } else {
        sessionStorage.removeItem(ADMIN_SESSION_KEY);
      }
      sessionStorage.setItem(CURRENT_MEMBER_KEY, nextMemberId);
      setAdmin(isAdmin);
      setMemberId(nextMemberId);
    },
    logout() {
      sessionStorage.removeItem(ADMIN_SESSION_KEY);
      sessionStorage.removeItem(CURRENT_MEMBER_KEY);
      setAdmin(false);
      setMemberId("sowon");
      navigate("/");
    },
  };

  let view = <StartView {...context} />;
  if (["index", "parent"].includes(route)) {
    view = <HomeView {...context} isParentPage={route === "parent"} />;
  } else if (route === "day") {
    view = <DayView {...context} />;
  } else if (route === "add") {
    view = <AddView {...context} />;
  } else if (route === "anniversaries") {
    view = <AnniversariesView {...context} />;
  } else if (route === "location") {
    view = <LocationView {...context} />;
  }

  return <div className="next-view">{loaded ? view : null}</div>;
}

function StartView({ nativeApp, setSession, navigate }) {
  const [selectedName, setSelectedName] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState(false);
  const passwordPanelRef = useRef(null);

  useEffect(() => {
    if (!selectedName) return;
    window.setTimeout(() => {
      passwordPanelRef.current?.scrollIntoView({
        behavior: "smooth",
        block: "center",
      });
    }, 40);
  }, [selectedName]);

  function enterChild() {
    setSession("sowon", false);
    navigate("/index");
  }

  function submitPassword(event) {
    event.preventDefault();
    if (password.trim() !== "1234") {
      setError(true);
      return;
    }
    setSession(selectedName === "엄마" ? "mom" : "dad", true);
    navigate("/parent");
  }

  return (
    <main className="app-shell entrance-shell">
      <header className="entrance-logo" aria-label="SOWON'S HAPPY PLAN">
        <p className="eyebrow">SOWON&apos;S HAPPY PLAN</p>
      </header>
      <section className="entrance-hero" aria-label="소원이네 가족 그림">
        <img
          src="/assets/family-entrance-mobile.webp"
          alt="소원이네 가족 그림"
          width="1000"
          height="1522"
          fetchPriority="high"
          decoding="async"
        />
      </section>
      <section className="entrance-actions">
        <div className="person-grid">
          {nativeApp ? (
            <button
              className="person-button"
              data-name="소원이"
              type="button"
              onClick={enterChild}
            >
              입장하기
            </button>
          ) : (
            ["엄마", "아빠"].map((name) => (
              <button
                className="person-button"
                data-name={name}
                key={name}
                type="button"
                onClick={() => {
                  setSelectedName(name);
                  setError(false);
                }}
              >
                {name} 입장
              </button>
            ))
          )}
        </div>
      </section>
      {!nativeApp && selectedName ? (
        <section className="entrance-password" ref={passwordPanelRef}>
          <div className="section-heading">
            <h2>{selectedName} 확인</h2>
          </div>
          <form className="event-form" onSubmit={submitPassword}>
            <label>
              <span>비밀번호</span>
              <input
                type="password"
                inputMode="numeric"
                required
                value={password}
                onChange={(event) => setPassword(event.target.value)}
              />
            </label>
            {error ? (
              <p className="helper-text">비밀번호가 맞지 않아요.</p>
            ) : null}
            <button className="primary-button" type="submit">
              들어가기
            </button>
          </form>
        </section>
      ) : null}
    </main>
  );
}

function Header({ title, admin, memberId, logout }) {
  return (
    <header className="top-bar">
      <div>
        <p className="eyebrow">Sowon&apos;s Happy Plan</p>
        <h1>{title}</h1>
      </div>
      {memberId ? (
        <button className="ghost-button compact-link" type="button" onClick={logout}>
          나가기
        </button>
      ) : null}
    </header>
  );
}

function getDisplayEvents(state, memberId, year) {
  return [
    ...getVisibleEvents(state.events, memberId),
    ...getAnnualEventsForYear(state.anniversaries, year),
  ];
}

function HomeView(props) {
  const {
    admin,
    memberId,
    isParentPage,
    logout,
    navigate,
    selectedMonth,
    setSelectedMonth,
    state,
  } = props;

  useEffect(() => {
    if (isParentPage && !admin) navigate("/");
  }, [admin, isParentPage, navigate]);

  const year = Number(selectedMonth.slice(0, 4));
  const displayEvents = getDisplayEvents(state, memberId, year);
  const weeks = buildMonthCalendar(displayEvents, selectedMonth);
  const todayEvents = getEventsForDate(
    getDisplayEvents(state, memberId, new Date().getFullYear()),
    todayKey()
  );

  return (
    <main className="app-shell">
      <Header
        title={isParentPage ? "엄마 아빠 일정판" : "소원이네 일정판"}
        admin={admin}
        memberId={memberId}
        logout={logout}
      />
      <section className="calendar-panel" aria-labelledby="calendarTitle">
        <div className="section-heading">
          <button
            className="icon-button"
            type="button"
            title="이전 달"
            onClick={() => setSelectedMonth(shiftMonth(selectedMonth, -1))}
          >
            ‹
          </button>
          <h2 id="calendarTitle">{formatMonthTitle(selectedMonth)}</h2>
          <button
            className="icon-button"
            type="button"
            title="다음 달"
            onClick={() => setSelectedMonth(shiftMonth(selectedMonth, 1))}
          >
            ›
          </button>
        </div>
        <div className="weekday-row" aria-hidden="true">
          {["일", "월", "화", "수", "목", "금", "토"].map((day) => (
            <span key={day}>{day}</span>
          ))}
        </div>
        <div className="calendar-grid">
          {weeks.flat().map((cell) => {
            const event = cell.events[0];
            const category = event ? getCategory(event) : null;
            return (
              <button
                className={[
                  "calendar-cell",
                  !cell.isCurrentMonth ? "muted" : "",
                  cell.dayOfWeek === 6 ? "saturday" : "",
                  cell.dayOfWeek === 0 || cell.isHoliday ? "holiday" : "",
                ].join(" ")}
                key={cell.date}
                type="button"
                onClick={() => navigate(`/day?date=${cell.date}`)}
              >
                <span className="calendar-day">{cell.day}</span>
                <span className="calendar-count">
                  {cell.events.length > 1 ? `+${cell.events.length - 1}` : ""}
                </span>
                <span
                  className="calendar-event-title"
                  style={{ borderLeftColor: category?.color || "transparent" }}
                >
                  {event
                    ? `${event.category === "anniversary" ? "🎂 " : ""}${event.title}`
                    : ""}
                </span>
              </button>
            );
          })}
        </div>
      </section>
      <section className="events-section" aria-labelledby="eventsTitle">
        <div className="section-heading">
          <h2 id="eventsTitle">오늘의 일정</h2>
          {admin ? (
            <div className="action-row">
              <button
                className="ghost-link"
                type="button"
                onClick={() => navigate("/location")}
              >
                소원이 위치
              </button>
              <button
                className="ghost-link"
                type="button"
                onClick={() => navigate("/anniversaries")}
              >
                기념일 등록
              </button>
              <button
                className="primary-link"
                type="button"
                onClick={() => navigate("/add")}
              >
                일정 추가
              </button>
            </div>
          ) : null}
        </div>
        <div className="events-list">
          {todayEvents.length === 0 ? (
            <div className="empty-state">오늘 등록된 일정이 없습니다.</div>
          ) : (
            todayEvents.map((event) => (
              <EventCard
                key={event.id}
                event={event}
                state={state}
                compact
                onClick={() => navigate(`/day?date=${event.date}`)}
              />
            ))
          )}
        </div>
      </section>
    </main>
  );
}

function EventCard({ event, state, compact, onClick, children }) {
  const category = getCategory(event);
  const summary = getResponseSummary(MEMBERS, state.responses, event.id);
  return (
    <article
      className={`event-card ${onClick ? "clickable-card" : ""}`}
      role={onClick ? "link" : undefined}
      tabIndex={onClick ? 0 : undefined}
      style={{ borderTopColor: category.color }}
      onClick={onClick}
      onKeyDown={(keyboardEvent) => {
        if (onClick && ["Enter", " "].includes(keyboardEvent.key)) {
          keyboardEvent.preventDefault();
          onClick();
        }
      }}
    >
      <div className="event-card-main">
        <div>
          {compact ? <span className="today-badge">오늘의 약속</span> : null}
          <p className="event-date">
            {compact ? formatEventDate(event) : formatEventTime(event)}
          </p>
          <h3 className="event-title">{event.title}</h3>
          <p className="event-note">{event.note || "메모 없음"}</p>
          <div className="event-meta">
            <span>{category.name}</span>
            {event.needsResponse ? <span>참석 체크</span> : null}
          </div>
        </div>
      </div>
      {!event.readonly && event.needsResponse && !compact ? (
        <div className="summary-row">
          <span className="summary-chip">가능 {summary.available}</span>
          <span className="summary-chip">불가 {summary.unavailable}</span>
          <span className="summary-chip">대기 {summary.waiting}</span>
        </div>
      ) : null}
      {children}
    </article>
  );
}

function DayView(props) {
  const { admin, memberId, navigate, saveState, searchParams, state } = props;
  const selectedDate = searchParams.get("date") || todayKey();
  const year = Number(selectedDate.slice(0, 4));
  const events = getEventsForDate(
    getDisplayEvents(state, memberId, year),
    selectedDate
  );

  async function deleteEvent(eventId) {
    if (!window.confirm("이 일정을 삭제할까요?")) return;
    await saveState((current) => ({
      ...current,
      events: current.events.filter((event) => event.id !== eventId),
      responses: current.responses.filter(
        (response) => response.eventId !== eventId
      ),
    }));
  }

  async function updateChecklist(eventId, itemId, checked) {
    await saveState((current) => ({
      ...current,
      events: current.events.map((event) =>
        event.id === eventId
          ? {
              ...event,
              checklist: (event.checklist || []).map((item) =>
                item.id === itemId ? { ...item, done: checked } : item
              ),
            }
          : event
      ),
    }));
  }

  async function updateResponse(eventId, status) {
    await saveState((current) => ({
      ...current,
      responses: setResponse(current.responses, eventId, memberId, status),
    }));
  }

  return (
    <main className="app-shell">
      <header className="top-bar">
        <div>
          <p className="eyebrow">Sowon&apos;s Happy Plan</p>
          <h1>{formatDateTitle(selectedDate)}</h1>
        </div>
        <button className="ghost-button" type="button" onClick={() => navigate(admin ? "/parent" : "/index")}>
          돌아가기
        </button>
      </header>
      {admin ? (
        <div className="action-row">
          <button
            className="primary-link"
            type="button"
            onClick={() => navigate(`/add?date=${selectedDate}`)}
          >
            일정 추가
          </button>
        </div>
      ) : null}
      <div className="events-list">
        {events.length === 0 ? (
          <div className="empty-state">이 날짜에는 등록된 일정이 없습니다.</div>
        ) : (
          events.map((event) => (
            <EventCard event={event} key={event.id} state={state}>
              {event.attachmentDataUrl ? (
                <div className="attachment-box">
                  <img
                    className="photo-preview"
                    src={event.attachmentDataUrl}
                    alt={event.attachmentName || "첨부 사진"}
                  />
                </div>
              ) : null}
              {!event.readonly && event.checklist?.length ? (
                <div className="checklist">
                  <h4>준비물</h4>
                  {event.checklist.map((item) => (
                    <label className="check-item" key={item.id}>
                      <input
                        type="checkbox"
                        checked={Boolean(item.done)}
                        onChange={(changeEvent) =>
                          updateChecklist(event.id, item.id, changeEvent.target.checked)
                        }
                      />
                      <span>{item.text}</span>
                    </label>
                  ))}
                </div>
              ) : null}
              {!event.readonly && event.needsResponse ? (
                <div className="member-grid">
                  {MEMBERS.map((member) => {
                    const response = state.responses.find(
                      (item) =>
                        item.eventId === event.id && item.memberId === member.id
                    );
                    return (
                      <div
                        className={`member-row ${member.id !== memberId ? "locked-member-row" : ""}`}
                        key={member.id}
                      >
                        <div className="member-name">
                          <span
                            className="member-dot"
                            style={{ backgroundColor: member.color }}
                          />
                          <span>{member.name}</span>
                        </div>
                        <div className="response-buttons">
                          {Object.entries(STATUS_LABELS).map(([status, label]) => (
                            <button
                              className={`response-button ${response?.status === status ? "active" : ""}`}
                              data-status={status}
                              disabled={member.id !== memberId}
                              key={status}
                              type="button"
                              onClick={() => updateResponse(event.id, status)}
                            >
                              {label}
                            </button>
                          ))}
                        </div>
                      </div>
                    );
                  })}
                </div>
              ) : null}
              {!event.readonly && admin ? (
                <div className="detail-actions">
                  <button
                    className="ghost-link"
                    type="button"
                    onClick={() => navigate(`/add?edit=${event.id}`)}
                  >
                    일정 수정
                  </button>
                  <button
                    className="danger-button"
                    type="button"
                    onClick={() => deleteEvent(event.id)}
                  >
                    일정 삭제
                  </button>
                </div>
              ) : null}
            </EventCard>
          ))
        )}
      </div>
    </main>
  );
}

function LocationView({ admin, memberId, navigate, saveState, state }) {
  const [selectedDate, setSelectedDate] = useState(todayKey());
  const [requesting, setRequesting] = useState(false);
  const sowonLocation = normalizeMemberLocation(state.locations?.sowon);
  const latestLocation = sowonLocation.latest;
  const locationRequest = normalizeLocationRequest(
    state.locationRequests?.sowon
  );
  const selectedLocations = getLocationsForDate(
    sowonLocation.history,
    selectedDate
  );
  const recentSelectedLocations = sortLocationsRecentFirst(selectedLocations);
  const isSowon = memberId === "sowon";

  useEffect(() => {
    if (!admin) navigate(isSowon ? "/index" : "/");
  }, [admin, isSowon, navigate]);

  async function requestCurrentLocation() {
    setRequesting(true);
    const requestedAt = new Date().toISOString();
    await saveState((current) => ({
      ...current,
      locationRequests: {
        ...(current.locationRequests || {}),
        sowon: {
          id: `request-${requestedAt}-${Math.random().toString(16).slice(2)}`,
          status: "pending",
          requestedAt,
          requestedBy: memberId,
          completedAt: "",
          locationId: "",
          message: "",
        },
      },
    }));
    setRequesting(false);
  }

  return (
    <main className="app-shell">
      <header className="top-bar">
        <div>
          <p className="eyebrow">Sowon&apos;s Happy Plan</p>
          <h1>소원이 위치</h1>
        </div>
        <button
          className="ghost-button"
          type="button"
          onClick={() => navigate(admin ? "/parent" : "/index")}
        >
          돌아가기
        </button>
      </header>

      {admin ? (
        <section className="location-panel">
          <div className="section-heading">
            <h2>지도 확인</h2>
            <button
              className="ghost-link"
              type="button"
              onClick={() => window.location.reload()}
            >
              새로고침
            </button>
          </div>
          <button
            className="primary-button"
            type="button"
            disabled={requesting || locationRequest?.status === "pending"}
            onClick={requestCurrentLocation}
          >
            {locationRequest?.status === "pending"
              ? "소원이 폰 확인 중"
              : "현재 소원이 위치 찾기"}
          </button>
          {locationRequest ? (
            <p className="helper-text">
              {formatLocationRequestStatus(locationRequest)}
            </p>
          ) : null}

          {latestLocation ? (
            <>
              <div className="location-summary">
                <span>마지막 저장</span>
                <strong>{formatLocationTime(latestLocation.updatedAt)}</strong>
                <span>정확도</span>
                <strong>
                  {Number.isFinite(Number(latestLocation.accuracy))
                    ? `약 ${Math.round(Number(latestLocation.accuracy))}m`
                    : "확인 안 됨"}
                </strong>
                <span>전체 기록</span>
                <strong>{sowonLocation.history.length}개</strong>
              </div>
              <div className="location-filter">
                <label>
                  <span>날짜 선택</span>
                  <input
                    type="date"
                    value={selectedDate}
                    onChange={(event) => setSelectedDate(event.target.value)}
                  />
                </label>
              </div>
              {selectedLocations.length > 0 ? (
                <>
                  <NaverMap locations={recentSelectedLocations} />
                  <LocationList locations={recentSelectedLocations} />
                </>
              ) : (
                <div className="empty-state">
                  선택한 날짜에는 위치 기록이 없어요.
                </div>
              )}
            </>
          ) : (
            <div className="empty-state">
              아직 저장된 위치가 없어요. 소원이 폰에서 위치가 저장되면 지도가
              보여요.
            </div>
          )}
        </section>
      ) : null}
    </main>
  );
}

function LocationList({ locations }) {
  return (
    <div className="location-list">
      {locations.map((location, index) => (
        <article className="location-item" key={location.id}>
          <span className="location-number">{index + 1}</span>
          <div>
            <strong>{formatLocationTime(location.updatedAt)}</strong>
            <p>{location.address || "주소 정보 없음"}</p>
            <small>
              {Number.isFinite(Number(location.accuracy))
                ? `정확도 약 ${Math.round(Number(location.accuracy))}m`
                : "정확도 확인 안 됨"}
            </small>
          </div>
        </article>
      ))}
    </div>
  );
}

function NaverMap({ locations }) {
  const mapRef = useRef(null);
  const [status, setStatus] = useState("loading");

  useEffect(() => {
    if (!locations?.length) return;
    let cancelled = false;

    function drawMap() {
      if (cancelled || !mapRef.current || !window.naver?.maps) return;
      const points = locations.map(
        (location) =>
          new window.naver.maps.LatLng(
            Number(location.latitude),
            Number(location.longitude)
          )
      );
      const map = new window.naver.maps.Map(mapRef.current, {
        center: points[0],
        zoom: 16,
        scaleControl: false,
        logoControl: true,
        mapDataControl: false,
      });

      points.forEach((point, index) => {
        new window.naver.maps.Marker({
          position: point,
          map,
          title: `소원이 위치 ${index + 1}`,
          label: {
            content: String(index + 1),
            color: "#253047",
            fontWeight: "900",
          },
        });
      });

      if (points.length > 1) {
        const bounds = new window.naver.maps.LatLngBounds();
        points.forEach((point) => bounds.extend(point));
        map.fitBounds(bounds, { top: 44, right: 44, bottom: 44, left: 44 });
      }
      setStatus("ready");
    }

    if (window.naver?.maps) {
      drawMap();
      return () => {
        cancelled = true;
      };
    }

    const existingScript = document.getElementById("naver-map-script");
    if (existingScript) {
      existingScript.addEventListener("load", drawMap, { once: true });
      existingScript.addEventListener("error", () => setStatus("error"), {
        once: true,
      });
      return () => {
        cancelled = true;
        existingScript.removeEventListener("load", drawMap);
      };
    }

    const script = document.createElement("script");
    script.id = "naver-map-script";
    script.src = `https://oapi.map.naver.com/openapi/v3/maps.js?ncpKeyId=${NAVER_MAP_CLIENT_ID}`;
    script.async = true;
    script.onload = drawMap;
    script.onerror = () => setStatus("error");
    document.head.appendChild(script);

    return () => {
      cancelled = true;
    };
  }, [locations]);

  return (
    <div className="map-shell">
      <div className="naver-map" ref={mapRef} />
      {status === "loading" ? (
        <div className="map-status">지도를 불러오는 중이에요.</div>
      ) : null}
      {status === "error" ? (
        <div className="map-status">
          네이버지도를 불러오지 못했어요. Maps API 설정과 도메인을 확인해
          주세요.
        </div>
      ) : null}
    </div>
  );
}

function AddView({ admin, memberId, navigate, saveState, searchParams, state }) {
  const editId = searchParams.get("edit");
  const presetDate = searchParams.get("date");
  const editingEvent = editId
    ? state.events.find((event) => event.id === editId)
    : null;
  const [form, setForm] = useState(() => ({
    title: "",
    category: "family",
    needsResponse: false,
    visibleAll: true,
    visibleMembers: [memberId],
    date: presetDate || todayKey(),
    time: "",
    note: "",
    checklist: "",
    attachmentName: "",
    attachmentDataUrl: "",
  }));

  useEffect(() => {
    if (!admin) navigate("/");
  }, [admin, navigate]);

  useEffect(() => {
    if (!editingEvent) return;
    setForm({
      title: editingEvent.title,
      category: editingEvent.category || "family",
      needsResponse: Boolean(editingEvent.needsResponse),
      visibleAll:
        !editingEvent.visibleTo || editingEvent.visibleTo.includes("all"),
      visibleMembers: editingEvent.visibleTo || [memberId],
      date: editingEvent.date,
      time: editingEvent.time || "",
      note: editingEvent.note || "",
      checklist: (editingEvent.checklist || []).map((item) => item.text).join("\n"),
      attachmentName: editingEvent.attachmentName || "",
      attachmentDataUrl: editingEvent.attachmentDataUrl || "",
    });
  }, [editingEvent, memberId]);

  function patchForm(patch) {
    setForm((current) => ({ ...current, ...patch }));
  }

  async function submit(event) {
    event.preventDefault();
    const checklist = form.checklist
      .split("\n")
      .map((item) => item.trim())
      .filter(Boolean);
    const visibleTo = form.visibleAll
      ? ["all"]
      : [...new Set([memberId, ...form.visibleMembers])];
    const input = { ...form, checklist, visibleTo };

    await saveState((current) => ({
      ...current,
      events: editingEvent
        ? current.events.map((eventItem) =>
            eventItem.id === editingEvent.id
              ? {
                  ...eventItem,
                  ...input,
                  checklist: checklist.map((text, index) => ({
                    id: eventItem.checklist?.[index]?.id || `item-${index + 1}`,
                    text,
                    done: eventItem.checklist?.[index]?.done || false,
                  })),
                }
              : eventItem
          )
        : [...current.events, createEvent(input)],
    }));
    navigate(`/day?date=${form.date}`);
  }

  async function deleteCurrent() {
    if (!editingEvent || !window.confirm("이 일정을 삭제할까요?")) return;
    await saveState((current) => ({
      ...current,
      events: current.events.filter((event) => event.id !== editingEvent.id),
      responses: current.responses.filter(
        (response) => response.eventId !== editingEvent.id
      ),
    }));
    navigate("/parent");
  }

  async function attach(file) {
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      window.alert("사진 파일만 첨부할 수 있어요.");
      return;
    }
    if (file.size > 700 * 1024) {
      window.alert("프로토타입에서는 700KB 이하 사진만 첨부할 수 있어요.");
      return;
    }
    patchForm({
      attachmentName: file.name,
      attachmentDataUrl: await readAttachment(file),
    });
  }

  return (
    <main className="app-shell">
      <header className="top-bar">
        <div>
          <p className="eyebrow">Sowon&apos;s Happy Plan</p>
          <h1>{editingEvent ? "일정 수정" : "일정 추가"}</h1>
        </div>
        <button className="ghost-button" type="button" onClick={() => navigate("/parent")}>
          돌아가기
        </button>
      </header>
      <section className="form-panel">
        <div className="section-heading">
          <h2>{editingEvent ? "일정 고치기" : "새 약속 적기"}</h2>
          {editingEvent ? (
            <button className="danger-button" type="button" onClick={deleteCurrent}>
              삭제
            </button>
          ) : null}
        </div>
        <form className="event-form" onSubmit={submit}>
          <label>
            <span>제목</span>
            <input
              required
              value={form.title}
              onChange={(event) => patchForm({ title: event.target.value })}
            />
          </label>
          <div className="field-row">
            <label>
              <span>종류</span>
              <select
                value={form.category}
                onChange={(event) => patchForm({ category: event.target.value })}
              >
                {CATEGORIES.map((category) => (
                  <option key={category.id} value={category.id}>
                    {category.name}
                  </option>
                ))}
              </select>
            </label>
            <label>
              <span>날짜</span>
              <input
                required
                type="date"
                value={form.date}
                onChange={(event) => patchForm({ date: event.target.value })}
              />
            </label>
          </div>
          <label className="toggle-row">
            <input
              type="checkbox"
              checked={form.needsResponse}
              onChange={(event) => patchForm({ needsResponse: event.target.checked })}
            />
            <span>참석 여부 받기</span>
          </label>
          <div className="visibility-panel">
            <p className="field-title">보이는 사람</p>
            <label className="toggle-row">
              <input
                type="checkbox"
                checked={form.visibleAll}
                onChange={(event) => patchForm({ visibleAll: event.target.checked })}
              />
              <span>가족 전원</span>
            </label>
            <div className="visibility-members">
              {MEMBERS.map((member) => (
                <label className="toggle-row" key={member.id}>
                  <input
                    type="checkbox"
                    checked={
                      member.id === memberId ||
                      form.visibleMembers.includes(member.id)
                    }
                    disabled={form.visibleAll || member.id === memberId}
                    onChange={(event) => {
                      const next = event.target.checked
                        ? [...form.visibleMembers, member.id]
                        : form.visibleMembers.filter((id) => id !== member.id);
                      patchForm({ visibleMembers: next });
                    }}
                  />
                  <span>{member.name}</span>
                </label>
              ))}
            </div>
          </div>
          <label>
            <span>시간</span>
            <input
              type="time"
              value={form.time}
              onChange={(event) => patchForm({ time: event.target.value })}
            />
          </label>
          <label>
            <span>메모</span>
            <textarea
              rows={3}
              value={form.note}
              onChange={(event) => patchForm({ note: event.target.value })}
            />
          </label>
          <label>
            <span>준비물</span>
            <textarea
              rows={4}
              value={form.checklist}
              onChange={(event) => patchForm({ checklist: event.target.value })}
            />
          </label>
          <label>
            <span>사진</span>
            <input type="file" accept="image/*" onChange={(event) => attach(event.target.files?.[0])} />
          </label>
          {form.attachmentName ? (
            <p className="helper-text">첨부됨: {form.attachmentName}</p>
          ) : null}
          <button className="primary-button" type="submit">
            저장
          </button>
        </form>
      </section>
    </main>
  );
}

function AnniversariesView({ admin, navigate, saveState, state }) {
  const [rows, setRows] = useState([{ title: "", date: "", calendarType: "solar" }]);

  useEffect(() => {
    if (!admin) navigate("/");
  }, [admin, navigate]);

  async function submit(event) {
    event.preventDefault();
    const nextAnniversaries = rows
      .filter((row) => row.title.trim() && row.date)
      .map(createAnniversary);
    await saveState((current) => ({
      ...current,
      anniversaries: [...current.anniversaries, ...nextAnniversaries],
    }));
    setRows([{ title: "", date: "", calendarType: "solar" }]);
  }

  async function deleteAnniversary(id) {
    if (!window.confirm("이 기념일을 삭제할까요?")) return;
    await saveState((current) => ({
      ...current,
      anniversaries: current.anniversaries.filter((item) => item.id !== id),
    }));
  }

  return (
    <main className="app-shell">
      <header className="top-bar">
        <div>
          <p className="eyebrow">Sowon&apos;s Happy Plan</p>
          <h1>기념일 등록</h1>
        </div>
        <button className="ghost-button" type="button" onClick={() => navigate("/parent")}>
          돌아가기
        </button>
      </header>
      <section className="form-panel">
        <form className="event-form" onSubmit={submit}>
          <div className="anniversary-rows">
            {rows.map((row, index) => (
              <div className="anniversary-row" key={index}>
                <label>
                  <span>이름</span>
                  <input
                    required
                    placeholder="예: 엄마 생일"
                    value={row.title}
                    onChange={(event) =>
                      setRows((current) =>
                        current.map((item, rowIndex) =>
                          rowIndex === index
                            ? { ...item, title: event.target.value }
                            : item
                        )
                      )
                    }
                  />
                </label>
                <label>
                  <span>날짜</span>
                  <input
                    required
                    type="date"
                    value={row.date}
                    onChange={(event) =>
                      setRows((current) =>
                        current.map((item, rowIndex) =>
                          rowIndex === index
                            ? { ...item, date: event.target.value }
                            : item
                        )
                      )
                    }
                  />
                </label>
                <label>
                  <span>달력</span>
                  <select
                    value={row.calendarType}
                    onChange={(event) =>
                      setRows((current) =>
                        current.map((item, rowIndex) =>
                          rowIndex === index
                            ? { ...item, calendarType: event.target.value }
                            : item
                        )
                      )
                    }
                  >
                    <option value="solar">양력</option>
                    <option value="lunar">음력</option>
                  </select>
                </label>
              </div>
            ))}
          </div>
          <div className="action-row">
            <button
              className="ghost-button"
              type="button"
              onClick={() =>
                setRows((current) => [
                  ...current,
                  { title: "", date: "", calendarType: "solar" },
                ])
              }
            >
              줄 추가
            </button>
            <button className="primary-button" type="submit">
              저장
            </button>
          </div>
        </form>
      </section>
      <section className="events-section">
        <div className="section-heading">
          <h2>등록된 기념일</h2>
        </div>
        <div className="events-list">
          {state.anniversaries.length === 0 ? (
            <div className="empty-state">아직 등록된 기념일이 없습니다.</div>
          ) : (
            state.anniversaries.map((anniversary) => (
              <article className="event-card" key={anniversary.id}>
                <div className="event-card-main">
                  <div>
                    <p className="event-date">
                      매년 {anniversary.monthDay.replace("-", "월 ")}일 ·{" "}
                      {anniversary.calendarType === "lunar" ? "음력" : "양력"}
                    </p>
                    <h3 className="event-title">{anniversary.title}</h3>
                  </div>
                  <button
                    className="danger-button"
                    type="button"
                    onClick={() => deleteAnniversary(anniversary.id)}
                  >
                    삭제
                  </button>
                </div>
              </article>
            ))
          )}
        </div>
      </section>
    </main>
  );
}
