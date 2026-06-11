const { members: MEMBERS, categories: CATEGORIES, anniversaries: ANNIVERSARIES } =
  window.familyConfig;

const statusLabels = {
  available: "가능",
  unavailable: "불가",
};

const params = new URLSearchParams(window.location.search);
const selectedDate = params.get("date") || new Date().toISOString().slice(0, 10);
const currentMemberId = sessionStorage.getItem("family-current-member") || "sowon";
const isParentMode = sessionStorage.getItem("family-admin-ok") === "1";
let state = { events: [], responses: [], anniversaries: [] };

const dayTitle = document.querySelector("#dayTitle");
const dayEventsList = document.querySelector("#dayEventsList");
const template = document.querySelector("#eventCardTemplate");
const addEventLink = document.querySelector("#addEventLink");

function saveState() {
  return window.familyStorage.saveState(state);
}

function getDisplayEventsForDate(date) {
  const year = Number(date.slice(0, 4));
  return window.scheduleCore.getEventsForDate(
    [
      ...window.scheduleCore.getVisibleEvents(state.events, currentMemberId),
      ...window.scheduleCore.getAnnualEventsForYear(ANNIVERSARIES, year),
      ...window.scheduleCore.getAnnualEventsForYear(state.anniversaries, year),
    ],
    date
  );
}

function getCategory(event) {
  return (
    CATEGORIES.find((category) => category.id === event.category) ||
    CATEGORIES[0]
  );
}

function formatDateTitle(dateLabel) {
  const date = new Date(`${dateLabel}T00:00`);
  return new Intl.DateTimeFormat("ko-KR", {
    month: "long",
    day: "numeric",
    weekday: "long",
  }).format(date);
}

function formatEventDate(event) {
  if (!event.time) {
    return "시간 미정";
  }

  const date = new Date(`${event.date}T${event.time}`);
  return new Intl.DateTimeFormat("ko-KR", {
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

function getMemberResponse(eventId, memberId) {
  return state.responses.find(
    (response) => response.eventId === eventId && response.memberId === memberId
  );
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

function renderMembers(event, container) {
  container.replaceChildren(
    ...MEMBERS.map((member) => {
      const row = document.createElement("div");
      row.className = "member-row";

      const name = document.createElement("div");
      name.className = "member-name";

      const dot = document.createElement("span");
      dot.className = "member-dot";
      dot.style.backgroundColor = member.color;

      const nameText = document.createElement("span");
      nameText.textContent = member.name;

      name.append(dot, nameText);

      const buttons = document.createElement("div");
      buttons.className = "response-buttons";

      for (const status of Object.keys(statusLabels)) {
        const button = document.createElement("button");
        const currentResponse = getMemberResponse(event.id, member.id);
        button.className = "response-button";
        button.dataset.status = status;
        button.type = "button";
        button.textContent = statusLabels[status];
        button.disabled = member.id !== currentMemberId;

        if (currentResponse?.status === status) {
          button.classList.add("active");
        }

        button.addEventListener("click", async () => {
          if (member.id !== currentMemberId) {
            return;
          }

          state.responses = window.scheduleCore.setResponse(
            state.responses,
            event.id,
            member.id,
            status
          );
          await saveState();
          render();
        });

        buttons.append(button);
      }

      row.append(name, buttons);
      if (member.id !== currentMemberId) {
        row.classList.add("locked-member-row");
      }
      return row;
    })
  );
}

function renderMeta(event, card) {
  const category = getCategory(event);
  const meta = document.createElement("div");
  meta.className = "event-meta";
  meta.innerHTML = `<span>${category.name}</span>${
    event.needsResponse ? "<span>참석 체크</span>" : ""
  }`;
  card.querySelector(".event-note").after(meta);
  card.style.borderTopColor = category.color;
}

function renderChecklist(event, card) {
  if (!Array.isArray(event.checklist) || event.checklist.length === 0) {
    return;
  }

  const list = document.createElement("div");
  list.className = "checklist";
  const title = document.createElement("h4");
  title.textContent = "준비물";
  list.append(title);

  for (const item of event.checklist) {
    const label = document.createElement("label");
    label.className = "check-item";
    const checkbox = document.createElement("input");
    checkbox.type = "checkbox";
    checkbox.checked = Boolean(item.done);
    checkbox.addEventListener("change", async () => {
      const storedEvent = state.events.find((stored) => stored.id === event.id);
      const storedItem = storedEvent?.checklist?.find(
        (checklistItem) => checklistItem.id === item.id
      );
      if (storedItem) {
        storedItem.done = checkbox.checked;
        await saveState();
      }
    });
    const text = document.createElement("span");
    text.textContent = item.text;
    label.append(checkbox, text);
    list.append(label);
  }

  card.querySelector(".summary-row")?.before(list);
}

function renderAttachment(event, card) {
  if (!event.attachmentDataUrl) {
    return;
  }

  const wrapper = document.createElement("div");
  wrapper.className = "attachment-box";
  const image = document.createElement("img");
  image.className = "photo-preview";
  image.src = event.attachmentDataUrl;
  image.alt = event.attachmentName || "첨부 사진";
  wrapper.append(image);
  card.querySelector(".summary-row")?.before(wrapper);
}

async function deleteEvent(eventId) {
  state.events = state.events.filter((event) => event.id !== eventId);
  state.responses = state.responses.filter(
    (response) => response.eventId !== eventId
  );
  await saveState();
  render();
}

function render() {
  dayTitle.textContent = formatDateTitle(selectedDate);
  if (isParentMode) {
    addEventLink.href = `./add.html?date=${selectedDate}`;
    addEventLink.classList.remove("hidden");
  } else {
    addEventLink.classList.add("hidden");
  }

  const events = getDisplayEventsForDate(selectedDate);

  if (events.length === 0) {
    const empty = document.createElement("div");
    empty.className = "empty-state";
    empty.textContent = "이 날짜에는 등록된 일정이 없습니다.";
    dayEventsList.replaceChildren(empty);
    return;
  }

  dayEventsList.replaceChildren(
    ...events.map((event) => {
      const card = template.content.firstElementChild.cloneNode(true);
      card.querySelector(".event-date").textContent = formatEventDate(event);
      card.querySelector(".event-title").textContent = event.title;
      card.querySelector(".event-note").textContent = event.note || "메모 없음";
      renderMeta(event, card);

      if (event.readonly) {
        card.querySelector(".summary-row").remove();
        card.querySelector(".member-grid").remove();
        card.querySelector(".detail-actions").remove();
      } else {
        if (isParentMode) {
          const editLink = card.querySelector(".edit-link");
          editLink.href = `./add.html?edit=${event.id}`;
          editLink.addEventListener("click", (clickEvent) => {
            if (!window.confirm("이 일정을 수정할까요?")) {
              clickEvent.preventDefault();
            }
          });

          card.querySelector(".delete-button").addEventListener("click", async () => {
            if (window.confirm("이 일정을 삭제할까요?")) {
              await deleteEvent(event.id);
            }
          });
        } else {
          card.querySelector(".detail-actions").remove();
        }
        renderChecklist(event, card);
        renderAttachment(event, card);
        if (event.needsResponse) {
          renderSummary(event, card.querySelector(".summary-row"));
          renderMembers(event, card.querySelector(".member-grid"));
        } else {
          card.querySelector(".summary-row").remove();
          card.querySelector(".member-grid").remove();
        }
      }

      return card;
    })
  );
}

async function init() {
  state = window.familyStorage.loadCachedState();
  render();

  try {
    state = await window.familyStorage.refreshState();
    render();
  } catch (error) {
    console.info("Using cached schedule state.", error);
  }
}

init();
