const ADMIN_SESSION_KEY = "family-admin-ok";
const CURRENT_MEMBER_KEY = "family-current-member";
let selectedName = "";

const passwordPanel = document.querySelector("#passwordPanel");
const passwordTitle = document.querySelector("#passwordTitle");
const passwordForm = document.querySelector("#passwordForm");
const passwordError = document.querySelector("#passwordError");

document.querySelectorAll(".person-button").forEach((button) => {
  button.addEventListener("click", () => {
    selectedName = button.dataset.name;

    if (button.dataset.role === "child") {
      sessionStorage.removeItem(ADMIN_SESSION_KEY);
      sessionStorage.setItem(CURRENT_MEMBER_KEY, "sowon");
      window.location.href = "./index.html";
      return;
    }

    passwordTitle.textContent = `${selectedName} 확인`;
    passwordPanel.classList.remove("hidden");
    document.querySelector("#startPassword").focus();
  });
});

passwordForm.addEventListener("submit", (event) => {
  event.preventDefault();
  const password = document.querySelector("#startPassword").value;

  if (window.scheduleCore.isAdminPassword(password)) {
    sessionStorage.setItem(ADMIN_SESSION_KEY, "1");
    sessionStorage.setItem(
      CURRENT_MEMBER_KEY,
      selectedName === "엄마" ? "mom" : "dad"
    );
    window.location.href = "./parent.html";
  } else {
    passwordError.classList.remove("hidden");
  }
});
