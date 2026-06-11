const { members: MEMBERS, categories: CATEGORIES } = window.familyConfig;
const ADMIN_SESSION_KEY = "family-admin-ok";
const CURRENT_MEMBER_KEY = "family-current-member";

if (sessionStorage.getItem(ADMIN_SESSION_KEY) !== "1") {
  window.location.replace("./start.html");
  throw new Error("Parent password required");
}

const params = new URLSearchParams(window.location.search);
const editId = params.get("edit");
const presetDate = params.get("date");
let state = { events: [], responses: [], anniversaries: [] };
const currentMemberId = sessionStorage.getItem(CURRENT_MEMBER_KEY) || "";
let editingEvent = null;

const pageTitle = document.querySelector("#pageTitle");
const formTitle = document.querySelector("#formTitle");
const form = document.querySelector("#eventForm");
const deleteButton = document.querySelector("#deleteButton");
const categorySelect = document.querySelector("#eventCategory");
const visibleAll = document.querySelector("#visibleAll");
const visibilityMembers = document.querySelector("#visibilityMembers");
const attachmentInput = document.querySelector("#eventAttachment");
const attachmentName = document.querySelector("#attachmentName");

let attachmentData = {
  attachmentName: "",
  attachmentDataUrl: "",
};

function saveState() {
  return window.familyStorage.saveState(state);
}

function redirectAfterSave(date) {
  window.location.href = `./day.html?date=${date}`;
}

function renderSelectOptions() {
  categorySelect.replaceChildren(
    ...CATEGORIES.map((category) => {
      const option = document.createElement("option");
      option.value = category.id;
      option.textContent = category.name;
      return option;
    })
  );

  visibilityMembers.replaceChildren(
    ...MEMBERS.map((member) => {
      const label = document.createElement("label");
      label.className = "toggle-row";
      label.innerHTML = `
        <input name="visibleMember" type="checkbox" value="${member.id}" />
        <span>${member.name}</span>
      `;
      return label;
    })
  );
}

function setVisibilityControls(visibleTo) {
  const values = Array.isArray(visibleTo) && visibleTo.length > 0
    ? visibleTo
    : ["all"];
  visibleAll.checked = values.includes("all");
  form.querySelectorAll('input[name="visibleMember"]').forEach((input) => {
    input.checked =
      input.value === currentMemberId || values.includes(input.value);
    input.disabled = visibleAll.checked || input.value === currentMemberId;
  });
}

function checklistToText(checklist) {
  return Array.isArray(checklist)
    ? checklist.map((item) => item.text).join("\n")
    : "";
}

function fillInitialForm() {
  renderSelectOptions();

  if (editingEvent) {
    pageTitle.textContent = "일정 수정";
    formTitle.textContent = "일정 고치기";
    form.querySelector("#eventTitle").value = editingEvent.title;
    form.querySelector("#eventCategory").value =
      editingEvent.category || "family";
    form.querySelector("#eventNeedsResponse").checked = Boolean(
      editingEvent.needsResponse
    );
    setVisibilityControls(editingEvent.visibleTo);
    form.querySelector("#eventDate").value = editingEvent.date;
    form.querySelector("#eventTime").value = editingEvent.time || "";
    form.querySelector("#eventNote").value = editingEvent.note || "";
    form.querySelector("#eventChecklist").value = checklistToText(
      editingEvent.checklist
    );
    attachmentName.textContent = editingEvent.attachmentName
      ? `첨부됨: ${editingEvent.attachmentName}`
      : "";
    deleteButton.classList.remove("hidden");
    return;
  }

  const today = new Date().toISOString().slice(0, 10);
  form.querySelector("#eventDate").value = presetDate || today;
  form.querySelector("#eventTime").value = "";
  setVisibilityControls(["all"]);
}

function getVisibleToFromForm(formData) {
  if (formData.get("visibleAll") === "on") {
    return ["all"];
  }

  const selectedMembers = [...form.querySelectorAll('input[name="visibleMember"]')]
    .filter((input) => input.checked)
    .map((input) => input.value);

  const visibleTo = currentMemberId
    ? [...new Set([currentMemberId, ...selectedMembers])]
    : selectedMembers;

  return visibleTo.length > 0 ? visibleTo : ["all"];
}

function readAttachment(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.addEventListener("load", () => resolve(reader.result));
    reader.addEventListener("error", reject);
    reader.readAsDataURL(file);
  });
}

visibleAll.addEventListener("change", () => {
  form.querySelectorAll('input[name="visibleMember"]').forEach((input) => {
    input.disabled = visibleAll.checked || input.value === currentMemberId;
    if (visibleAll.checked) {
      input.checked = input.value === currentMemberId;
    }
  });
});

attachmentInput.addEventListener("change", async () => {
  const file = attachmentInput.files?.[0];
  if (!file) {
    return;
  }

  if (!file.type.startsWith("image/")) {
    window.alert("사진 파일만 첨부할 수 있어요.");
    attachmentInput.value = "";
    return;
  }

  if (file.size > 700 * 1024) {
    window.alert("프로토타입에서는 700KB 이하 사진만 첨부할 수 있어요.");
    attachmentInput.value = "";
    return;
  }

  attachmentData = {
    attachmentName: file.name,
    attachmentDataUrl: await readAttachment(file),
  };
  attachmentName.textContent = `첨부됨: ${file.name}`;
});

form.addEventListener("submit", async (event) => {
  event.preventDefault();

  const formData = new FormData(form);
  const checklist = String(formData.get("checklist") || "")
    .split("\n")
    .map((item) => item.trim())
    .filter(Boolean);
  const input = {
    title: String(formData.get("title")).trim(),
    category: String(formData.get("category") || "family"),
    needsResponse: formData.get("needsResponse") === "on",
    visibleTo: getVisibleToFromForm(formData),
    date: String(formData.get("date")),
    time: String(formData.get("time") || ""),
    note: String(formData.get("note") || "").trim(),
    checklist,
    ...attachmentData,
  };

  if (editingEvent) {
    const updatedChecklist = checklist.map((text, index) => ({
      id: editingEvent.checklist?.[index]?.id || `item-${index + 1}`,
      text,
      done: editingEvent.checklist?.[index]?.done || false,
    }));
    state.events = state.events.map((eventItem) =>
      eventItem.id === editingEvent.id
        ? { ...eventItem, ...input, checklist: updatedChecklist }
        : eventItem
    );
  } else {
    state.events.push(window.scheduleCore.createEvent(input));
  }

  await saveState();
  redirectAfterSave(input.date);
});

deleteButton.addEventListener("click", async () => {
  if (!editingEvent) {
    return;
  }

  if (!window.confirm("이 일정을 삭제할까요?")) {
    return;
  }

  state.events = state.events.filter((event) => event.id !== editingEvent.id);
  state.responses = state.responses.filter(
    (response) => response.eventId !== editingEvent.id
  );
  await saveState();
  window.location.href = "./index.html";
});

async function init() {
  state = await window.familyStorage.loadState();
  editingEvent = editId
    ? state.events.find((event) => event.id === editId)
    : null;
  attachmentData = {
    attachmentName: editingEvent?.attachmentName || "",
    attachmentDataUrl: editingEvent?.attachmentDataUrl || "",
  };
  fillInitialForm();
}

init();
