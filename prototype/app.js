const { members: MEMBERS, categories: CATEGORIES, anniversaries: ANNIVERSARIES } =
  window.familyConfig;

const IS_PARENT_PAGE = window.location.pathname.endsWith("/parent.html");
const ADMIN_SESSION_KEY = "family-admin-ok";
const CURRENT_MEMBER_KEY = "family-current-member";
const IS_PARENT_SESSION = sessionStorage.getItem(ADMIN_SESSION_KEY) === "1";
const CURRENT_MEMBER_ID = sessionStorage.getItem(CURRENT_MEMBER_KEY) || "sowon";

if (IS_PARENT_PAGE && !IS_PARENT_SESSION) {
  window.location.replace("./start.html");
  throw new Error("Parent password required");
}

const defaultState = { events: [], responses: [], anniversaries: [] };

let state = structuredClone(defaultState);
let selectedMonth = getInitialMonth();

const eventsList = document.querySelector("#eventsList");
const template = document.querySelector("#eventCardTemplate");
const calendarTitle = document.querySelector("#calendarTitle");
const calendarGrid = document.querySelector("#calendarGrid");
const prevMonthButton = document.querySelector("#prevMonthButton");
const nextMonthButton = document.querySelector("#nextMonthButton");
const logoutButton = document.querySelector("#logoutButton");
const parentActionRow = document.querySelector("#parentActionRow");

if (logoutButton && sessionStorage.getItem(CURRENT_MEMBER_KEY)) {
  logoutButton.classList.remove("hidden");
}

if (parentActionRow && IS_PARENT_SESSION) {
  parentActionRow.classList.remove("hidden");
}

function normalizeState(savedState) {
  const validMemberIds = new Set(MEMBERS.map((member) => member.id));
  return {
    events: Array.isArray(savedState.events) ? savedState.events : [],
    responses: Array.isArray(savedState.responses)
      ? savedState.responses.filter((response) =>
          validMemberIds.has(response.memberId)
        )
      : [],
    anniversaries: Array.isArray(savedState.anniversaries)
      ? savedState.anniversaries
      : [],
  };
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

function getDisplayEventsForYear(year) {
  return [
    ...window.scheduleCore.getVisibleEvents(state.events, CURRENT_MEMBER_ID),
    ...window.scheduleCore.getAnnualEventsForYear(ANNIVERSARIES, year),
    ...window.scheduleCore.getAnnualEventsForYear(state.anniversaries, year),
  ];
}

function getCategory(event) {
  return (
    CATEGORIES.find((category) => category.id === event.category) ||
    CATEGORIES[0]
  );
}

function formatMonthTitle(monthLabel) {
  const [year, month] = monthLabel.split("-").map(Number);
  return new Intl.DateTimeFormat("ko-KR", {
    year: "numeric",
    month: "long",
  }).format(new Date(year, month - 1, 1));
}

function formatEventDate(event) {
  const formatOptions = {
    month: "long",
    day: "numeric",
    weekday: "short",
  };

  if (event.time) {
    formatOptions.hour = "2-digit";
    formatOptions.minute = "2-digit";
  }

  const date = new Date(`${event.date}T${event.time || "00:00"}`);
  return new Intl.DateTimeFormat("ko-KR", formatOptions).format(date);
}

function renderSummary(event, container) {
  const summary = window.scheduleCore.getResponseSummary(
    MEMBERS,
    state.responses,
    event.id
  );

  const chips = [
    `가능 ${summary.available}`,
    `불가 ${summary.unavailable}`,
    `대기 ${summary.waiting}`,
  ];

  container.replaceChildren(
    ...chips.map((label) => {
      const chip = document.createElement("span");
      chip.className = "summary-chip";
      chip.textContent = label;
      return chip;
    })
  );
}

function renderCalendar() {
  calendarTitle.textContent = formatMonthTitle(selectedMonth);
  const year = Number(selectedMonth.slice(0, 4));
  const calendar = window.scheduleCore.buildMonthCalendar(
    getDisplayEventsForYear(year),
    selectedMonth
  );

  calendarGrid.replaceChildren(
    ...calendar.weeks.flatMap((week) =>
      week.map((cell) => {
        const link = document.createElement("a");
        link.className = "calendar-cell";
        link.href = `./day.html?date=${cell.date}`;

        if (!cell.isCurrentMonth) link.classList.add("muted");
        if (cell.dayOfWeek === 6) link.classList.add("saturday");
        if (cell.dayOfWeek === 0 || cell.isHoliday) link.classList.add("holiday");

        const day = document.createElement("span");
        day.className = "calendar-day";
        day.textContent = cell.day;

        const eventCount = document.createElement("span");
        eventCount.className = "calendar-count";
        eventCount.textContent = cell.events.length > 1 ? `+${cell.events.length - 1}` : "";

        const firstEvent = document.createElement("span");
        firstEvent.className = "calendar-event-title";
        firstEvent.textContent = cell.events[0]
          ? `${cell.events[0].category === "anniversary" ? "🎂 " : ""}${cell.events[0].title}`
          : "";
        if (cell.events[0]) {
          firstEvent.style.borderLeftColor = getCategory(cell.events[0]).color;
        }

        link.append(day, eventCount, firstEvent);
        return link;
      })
    )
  );
}

function renderTodayEvents() {
  const today = new Date().toISOString().slice(0, 10);
  const todayYear = new Date().getFullYear();
  const todayEvents = window.scheduleCore.getEventsForDate(
    getDisplayEventsForYear(todayYear),
    today
  );

  if (todayEvents.length === 0) {
    const empty = document.createElement("div");
    empty.className = "empty-state";
    empty.textContent = "오늘 등록된 일정이 없습니다.";
    eventsList.replaceChildren(empty);
    return;
  }

  eventsList.replaceChildren(
    ...todayEvents.map((eventItem) => {
      const category = getCategory(eventItem);
      const card = template.content.firstElementChild.cloneNode(true);
      const detailHref = `./day.html?date=${eventItem.date}`;

      card.classList.add("clickable-card");
      card.style.borderTopColor = category.color;
      card.setAttribute("role", "link");
      card.tabIndex = 0;

      const badge = document.createElement("span");
      badge.className = "today-badge";
      badge.textContent = "오늘의 약속";
      card.querySelector(".event-date").before(badge);

      card.querySelector(".event-date").textContent = formatEventDate(eventItem);
      card.querySelector(".event-title").textContent = eventItem.title;
      card.querySelector(".event-note").textContent =
        eventItem.note || "메모 없음";

      const meta = document.createElement("div");
      meta.className = "event-meta";
      meta.innerHTML = `<span>${category.name}</span>${
        eventItem.needsResponse ? "<span>참석 체크</span>" : ""
      }`;
      card.querySelector(".event-note").after(meta);

      card.addEventListener("click", () => {
        window.location.href = detailHref;
      });
      card.addEventListener("keydown", (event) => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          window.location.href = detailHref;
        }
      });

      if (eventItem.readonly || !eventItem.needsResponse) {
        card.querySelector(".summary-row").remove();
      } else {
        renderSummary(eventItem, card.querySelector(".summary-row"));
      }
      card.querySelector(".member-grid").remove();
      card.querySelector(".event-actions").remove();

      return card;
    })
  );
}

function render() {
  renderCalendar();
  renderTodayEvents();
}

prevMonthButton.addEventListener("click", () => {
  selectedMonth = shiftMonth(selectedMonth, -1);
  render();
});

nextMonthButton.addEventListener("click", () => {
  selectedMonth = shiftMonth(selectedMonth, 1);
  render();
});

logoutButton?.addEventListener("click", () => {
  sessionStorage.removeItem(ADMIN_SESSION_KEY);
  sessionStorage.removeItem(CURRENT_MEMBER_KEY);
  window.location.href = "./start.html";
});

async function init() {
  state = normalizeState(await window.familyStorage.loadState(defaultState));
  render();
}

init();
