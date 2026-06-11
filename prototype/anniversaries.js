const ADMIN_SESSION_KEY = "family-admin-ok";

if (sessionStorage.getItem(ADMIN_SESSION_KEY) !== "1") {
  window.location.replace("./start.html");
  throw new Error("Parent password required");
}

let state = { events: [], responses: [], anniversaries: [] };
const rows = document.querySelector("#anniversaryRows");
const form = document.querySelector("#anniversaryForm");
const addRowButton = document.querySelector("#addRowButton");
const anniversaryList = document.querySelector("#anniversaryList");

function saveState() {
  return window.familyStorage.saveState(state);
}

function addRow() {
  const row = document.createElement("div");
  row.className = "anniversary-row";
  row.innerHTML = `
    <label>
      <span>이름</span>
      <input name="title" placeholder="예: 엄마 생일" required />
    </label>
    <label>
      <span>날짜</span>
      <input name="date" type="date" required />
    </label>
    <label>
      <span>달력</span>
      <select name="calendarType">
        <option value="solar">양력</option>
        <option value="lunar">음력</option>
      </select>
    </label>
  `;
  rows.append(row);
}

function renderList() {
  if (state.anniversaries.length === 0) {
    const empty = document.createElement("div");
    empty.className = "empty-state";
    empty.textContent = "아직 등록된 기념일이 없습니다.";
    anniversaryList.replaceChildren(empty);
    return;
  }

  anniversaryList.replaceChildren(
    ...state.anniversaries.map((anniversary) => {
      const card = document.createElement("article");
      card.className = "event-card";
      card.innerHTML = `
        <div class="event-card-main">
          <div>
            <p class="event-date">매년 ${anniversary.monthDay.replace("-", "월 ")}일 · ${
              anniversary.calendarType === "lunar" ? "음력" : "양력"
            }</p>
            <h3 class="event-title">${anniversary.title}</h3>
          </div>
          <button class="danger-button" type="button">삭제</button>
        </div>
      `;
      card.querySelector("button").addEventListener("click", async () => {
        if (!window.confirm("이 기념일을 삭제할까요?")) {
          return;
        }
        state.anniversaries = state.anniversaries.filter(
          (item) => item.id !== anniversary.id
        );
        await saveState();
        renderList();
      });
      return card;
    })
  );
}

addRowButton.addEventListener("click", addRow);

form.addEventListener("submit", async (event) => {
  event.preventDefault();
  const titleInputs = [...form.querySelectorAll('input[name="title"]')];
  const dateInputs = [...form.querySelectorAll('input[name="date"]')];
  const calendarTypeInputs = [
    ...form.querySelectorAll('select[name="calendarType"]'),
  ];
  const nextAnniversaries = titleInputs
    .map((titleInput, index) => ({
      title: titleInput.value,
      date: dateInputs[index].value,
      calendarType: calendarTypeInputs[index].value,
    }))
    .filter((item) => item.title.trim() && item.date)
    .map((item) => window.scheduleCore.createAnniversary(item));

  state.anniversaries.push(...nextAnniversaries);
  await saveState();
  rows.replaceChildren();
  addRow();
  renderList();
});

async function init() {
  state = await window.familyStorage.loadState();
  addRow();
  renderList();
}

init();
