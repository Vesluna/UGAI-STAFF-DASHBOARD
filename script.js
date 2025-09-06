/* script.js
   UGAI Staff Dashboard — consolidated full JS
   - 3-digit numeric login + optional two-step
   - per-user notifications persisted to localStorage
   - per-notification buttons with action handlers
   - modal behaviors fixed (close after actions, re-render + persist)
   - autologin if session exists
*/

/* ============================
   Sample users data
   Each notification can include:
     { id, title, text, UserNotifyDesc, read, buttons: [{ label, action }], type }
   StaffTokens field included but not modified by notification handlers here.
   Types of notifications: info, warning
   ============================ */
const users = [
  {
    ID: "001",
    pass: " ",
    twoStep: false,
    twoStepPass: null,
    notifications: [
      {
        id: "n-001-1",
        title: "Welcome!",
        text: "This is your friendly welcome message...",
        UserNotifyDesc:
          "Thank you for logging in! Please review the 'Instructions' tab under System Info for more information about how to use this dashboard!",
        read: false,
        type: "info",
        buttons: [
          { label: "Acknowledge", action: "markRead" },
          { label: "Close", action: "close" }
        ]
      }
    ],
    StaffTokens: 0
  },
  {
    ID: "002",
    pass: " ",
    twoStep: false,
    twoStepPass: null,
    notifications: [
      {
        id: "n-002-1",
        title: "Welcome!",
        text: "This is your friendly welcome message...",
        UserNotifyDesc:
          "Thank you for logging in! Please review the 'Instructions' tab under System Info for more information about how to use this dashboard!",
        read: false,
        type: "info",
        buttons: [
          { label: "Acknowledge", action: "markRead" },
          { label: "Close", action: "close" }
        ]
      }
    ],
    StaffTokens: 0
  },
];

/* ============================
   LocalStorage keys and helpers
   ============================ */
const LS_PREFIX = "ugai_";
const LS_KEY_LOGGED = LS_PREFIX + "loggedIn"; // saved logged-in ID
const LS_USER_NOTIFS = (id) => `${LS_PREFIX}notifs_${id}`;

function saveNotificationsToStorage(userId, notifications) {
  try {
    localStorage.setItem(LS_USER_NOTIFS(userId), JSON.stringify(notifications));
  } catch (e) {
    console.warn("saveNotificationsToStorage error:", e);
  }
}

function loadNotificationsFromStorage(userId) {
  try {
    const raw = localStorage.getItem(LS_USER_NOTIFS(userId));
    if (!raw) return null;
    return JSON.parse(raw);
  } catch (e) {
    console.warn("loadNotificationsFromStorage error:", e);
    return null;
  }
}

function saveLoggedIn(userId) {
  try {
    localStorage.setItem(LS_KEY_LOGGED, userId);
  } catch (e) {
    /* ignore */
  }
}
function getSavedLoggedIn() {
  try {
    return localStorage.getItem(LS_KEY_LOGGED);
  } catch (e) {
    return null;
  }
}
function clearLoggedIn() {
  try {
    localStorage.removeItem(LS_KEY_LOGGED);
  } catch (e) {}
}

/* ============================
   Action handlers
   Map action names to handlers. Each handler should ensure:
     - state updates (in-memory)
     - save to storage (where relevant)
     - UI re-render (where relevant)
     - close modal if appropriate
   ============================ */
const ACTION_HANDLERS = {
  close: (notifId) => {
    // just close modal
    closeModal();
  },

  delete: (notifId) => {
    // delete then close
    removeNotification(notifId);
    closeModal();
  },

  markRead: (notifId) => {
    markRead(notifId, { save: true, render: true });
    // optionally close modal to show immediate result
    closeModal();
  },

  markUnread: (notifId) => {
    markUnread(notifId);
    closeModal();
  },

  noop: (notifId) => {
    // intentionally do nothing
  }
  // Add more handlers (award tokens, open URL) as needed
};

/* ============================
   DOM refs
   ============================ */
const $ = (id) => document.getElementById(id);

const userID = $("userID");
const password = $("password");
const twoStepBox = $("twoStepBox");
const twoStepInput = $("twoStepInput");
const loginError = $("loginError");
const btnLogin = $("btnLogin");
const loginCard = $("loginCard");

const dashboard = $("dashboard");
const staffLabel = $("staffLabel");
const tokenCount = $("tokenCount");
const btnLogout = $("btnLogout");
const badgeUnread = $("badgeUnread");

const inboxList = $("inboxList");
const inboxEmpty = $("inboxEmpty");
const btnClearRead = $("btnClearRead");
const btnClearAll = $("btnClearAll");

const modal = $("modal");
const modalTitle = $("modalTitle");
const modalBody = $("modalBody");
const modalButtons = $("modalButtons");
const modalClose = $("modalClose");

const navItems = Array.from(document.querySelectorAll(".nav-item"));
const tabs = {
  inbox: $("tab-inbox"),
  tools: $("tab-tools"),
  system: $("tab-system")
};

/* ============================
   State helpers
   ============================ */
let currentUser = null;

function findUserByID(id) {
  return users.find((u) => u.ID === id);
}

function onlyDigits(value) {
  return value.replace(/[^0-9]/g, "");
}

function setHidden(elem, hidden) {
  if (!elem) return;
  if (hidden) elem.classList.add("hidden");
  else elem.classList.remove("hidden");
}

function escapeHtml(unsafe) {
  if (!unsafe) return "";
  return unsafe.replace(/[&<"'>]/g, function (m) {
    return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[m];
  });
}

/* ============================
   UI event bindings (login area)
   ============================ */
userID.addEventListener("input", () => {
  userID.value = onlyDigits(userID.value).slice(0, 3);
  checkTwoStep();
  resetLoginError();
});
password.addEventListener("input", resetLoginError);
twoStepInput.addEventListener("input", resetLoginError);
btnLogin.addEventListener("click", handleLogin);

/* Two-step show/hide */
function checkTwoStep() {
  const id = userID.value.trim();
  const match = findUserByID(id);
  if (match && match.twoStep) setHidden(twoStepBox, false);
  else {
    setHidden(twoStepBox, true);
    twoStepInput.value = "";
  }
}

/* Login helpers */
function resetLoginError() {
  if (!loginError) return;
  loginError.textContent = "";
  loginError.classList.add("hidden");
}
function showLoginError(msg) {
  if (!loginError) return;
  loginError.textContent = msg;
  loginError.classList.remove("hidden");
}

function handleLogin() {
  resetLoginError();
  const id = userID.value.trim();
  const pass = password.value;
  const two = twoStepInput ? twoStepInput.value : "";

  if (id.length !== 3) {
    showLoginError("ID must be 3 digits.");
    return;
  }
  const match = findUserByID(id);
  if (!match) {
    showLoginError("No staff with that ID.");
    return;
  }
  if (match.pass !== pass) {
    showLoginError("Invalid credentials.");
    return;
  }
  if (match.twoStep) {
    if (!two || two.length === 0) {
      showLoginError("Enter two-step code.");
      setHidden(twoStepBox, false);
      return;
    }
    if (two !== match.twoStepPass) {
      showLoginError("Invalid two-step code.");
      return;
    }
  }

  // Load persisted notifications for this user (if any)
  const persisted = loadNotificationsFromStorage(match.ID);
  if (persisted && Array.isArray(persisted)) {
    match.notifications = persisted;
  }

  // Enter dashboard and remember session
  enterDashboard(match);
  saveLoggedIn(match.ID);
}

/* ============================
   Enter dashboard + render
   ============================ */
function enterDashboard(user) {
  currentUser = user;
  if (loginCard) loginCard.classList.add("hidden");
  if (dashboard) dashboard.classList.remove("hidden");

  staffLabel.textContent = `ID ${user.ID}`;
  tokenCount.textContent = user.StaffTokens ?? 0;

  setActiveTab("inbox");
  renderInbox();
  updateUnreadBadge();
  initAccordion(); // Initialize all accordions
}

/* ============================
   Inbox render / interaction
   ============================ */
function renderInbox() {
  if (!currentUser) return;
  inboxList.innerHTML = "";

  const notes = currentUser.notifications ?? [];
  if (!notes || notes.length === 0) {
    setHidden(inboxEmpty, false);
    return;
  } else {
    setHidden(inboxEmpty, true);
  }

  // newest first
  const sorted = [...notes].reverse();
  sorted.forEach((n) => {
    const node = document.createElement("div");
    node.className = `note ${n.read ? "" : "unread"} ${n.type || ""}`;
    node.setAttribute("data-id", n.id);

    node.innerHTML = `
      <div class="left" aria-hidden="true"></div>
      <div class="body">
        <h4>${escapeHtml(n.title || "No title")}</h4>
        <p>${escapeHtml(n.text || "")}</p>
        <div class="meta">
          <span class="muted">ID: ${escapeHtml(n.id)}</span>
          <div style="flex:1"></div>
          <button class="open small">Open</button>
          <button class="mark small">${n.read ? "Mark unread" : "Mark read"}</button>
          <button class="rm small" style="border-color: rgba(255,255,255,0.06)">Delete</button>
        </div>
      </div>
    `;

    const btnOpen = node.querySelector(".open");
    const btnMark = node.querySelector(".mark");
    const btnRm = node.querySelector(".rm");

    btnOpen.addEventListener("click", () => openNotification(n.id));
    btnMark.addEventListener("click", () => toggleRead(n.id));
    btnRm.addEventListener("click", () => {
      removeNotification(n.id);
      // ensure modal is closed if it referenced the removed notification
      closeModal();
    });

    inboxList.appendChild(node);
  });
}

function updateUnreadBadge() {
  if (!currentUser) return;
  const unread = (currentUser.notifications ?? []).filter((x) => !x.read).length;
  badgeUnread.textContent = unread;
  if (unread > 0) badgeUnread.classList.remove("hidden");
  else badgeUnread.classList.add("hidden");
}

/* ============================
   Modal open (shows text + UserNotifyDesc + buttons)
   ============================ */
function openNotification(id) {
  if (!currentUser) return;
  const n = (currentUser.notifications ?? []).find((x) => x.id === id);
  if (!n) return;

  modalTitle.textContent = n.title || "Notification";

  // Build modal body: text + optional UserNotifyDesc
  const parts = [];
  if (n.text) parts.push(`<p>${escapeHtml(n.text)}</p>`);
  if (n.UserNotifyDesc) parts.push(`<hr/><p>${escapeHtml(n.UserNotifyDesc)}</p>`);
  modalBody.innerHTML = parts.join("");

  modalButtons.innerHTML = "";

  const btns = Array.isArray(n.buttons) ? n.buttons : [];
  if (btns.length === 0) {
    const fallback = document.createElement("button");
    fallback.className = "small";
    fallback.textContent = "Close";
    fallback.addEventListener("click", () => closeModal());
    modalButtons.appendChild(fallback);
  } else {
    btns.forEach((b) => {
      const btn = document.createElement("button");
      btn.className = "small";
      btn.textContent = b.label || "Action";
      btn.addEventListener("click", () => {
        const action = b.action || "noop";
        const handler = ACTION_HANDLERS[action] || ACTION_HANDLERS.noop;
        try {
          handler(id);
        } catch (err) {
          console.error("Action handler error:", err);
        }
      });
      modalButtons.appendChild(btn);
    });
  }

  // Mark as read when opened (persist + render)
  markRead(id, { save: true, render: true });

  setHidden(modal, false);
}

/* ============================
   Mark read / unread / toggle / remove (persist & render)
   ============================ */
function markRead(id, opts = { save: true, render: true }) {
  if (!currentUser) return;
  const idx = (currentUser.notifications ?? []).findIndex((x) => x.id === id);
  if (idx === -1) return;
  currentUser.notifications[idx].read = true;
  if (opts.save) saveNotificationsToStorage(currentUser.ID, currentUser.notifications);
  if (opts.render) {
    renderInbox();
    updateUnreadBadge();
  }
}

function markUnread(id) {
  if (!currentUser) return;
  const idx = (currentUser.notifications ?? []).findIndex((x) => x.id === id);
  if (idx === -1) return;
  currentUser.notifications[idx].read = false;
  saveNotificationsToStorage(currentUser.ID, currentUser.notifications);
  renderInbox();
  updateUnreadBadge();
}

function toggleRead(id) {
  if (!currentUser) return;
  const idx = (currentUser.notifications ?? []).findIndex((x) => x.id === id);
  if (idx === -1) return;
  currentUser.notifications[idx].read = !currentUser.notifications[idx].read;
  saveNotificationsToStorage(currentUser.ID, currentUser.notifications);
  renderInbox();
  updateUnreadBadge();
}

function removeNotification(id) {
  if (!currentUser) return;
  const exists = (currentUser.notifications ?? []).some((x) => x.id === id);
  currentUser.notifications = (currentUser.notifications ?? []).filter((x) => x.id !== id);
  if (exists) {
    saveNotificationsToStorage(currentUser.ID, currentUser.notifications);
    renderInbox();
    updateUnreadBadge();
  }
}

/* ============================
   Clear read / clear all
   ============================ */
if (btnClearRead) {
  btnClearRead.addEventListener("click", () => {
    if (!currentUser) return;
    currentUser.notifications = (currentUser.notifications ?? []).filter((x) => !x.read);
    saveNotificationsToStorage(currentUser.ID, currentUser.notifications);
    renderInbox();
    updateUnreadBadge();
  });
}
if (btnClearAll) {
  btnClearAll.addEventListener("click", () => {
    if (!currentUser) return;
    currentUser.notifications = [];
    saveNotificationsToStorage(currentUser.ID, currentUser.notifications);
    renderInbox();
    updateUnreadBadge();
  });
}

/* ============================
   Modal controls (close behavior)
   ============================ */
if (modalClose) modalClose.addEventListener("click", closeModal);
if (modal) {
  modal.addEventListener("click", (ev) => {
    if (ev.target === modal) closeModal();
  });
}
function closeModal() {
  setHidden(modal, true);
  modalTitle.textContent = "";
  modalBody.textContent = "";
  modalButtons.innerHTML = "";
}

/* ============================
   Tabs / Navigation
   ============================ */
navItems.forEach((item) => {
  item.addEventListener("click", () => {
    navItems.forEach((i) => i.classList.remove("active"));
    item.classList.add("active");
    const tab = item.dataset.tab;
    setActiveTab(tab);
  });
});
function setActiveTab(tab) {
  Object.keys(tabs).forEach((k) => tabs[k].classList.remove("active"));
  if (tabs[tab]) tabs[tab].classList.add("active");
}

/* ============================
   Logout behavior
   ============================ */
if (btnLogout) {
  btnLogout.addEventListener("click", () => {
    currentUser = null;
    setHidden(dashboard, true);
    if (loginCard) loginCard.classList.remove("hidden");
    if (userID) userID.value = "";
    if (password) password.value = "";
    if (twoStepInput) twoStepInput.value = "";
    setHidden(twoStepBox, true);
    resetLoginError();
    clearLoggedIn();
  });
}

/* ============================
   Accordion Initialization (for tools and system)
   ============================ */
function initAccordion() {
  // Accordion toggle
  const accordionHeaders = document.querySelectorAll('.accordion-header');
  accordionHeaders.forEach(header => {
    header.addEventListener('click', () => {
      const content = header.nextElementSibling;
      setHidden(content, !content.classList.contains('hidden'));
    });
  });

  // Calculator functionality
  const btnCalc = $('btnCalc');
  if (btnCalc) {
    btnCalc.addEventListener('click', () => {
      const num1 = parseFloat($('calcNum1').value);
      const num2 = parseFloat($('calcNum2').value);
      const op = $('calcOp').value;
      let result;
      if (isNaN(num1) || isNaN(num2)) {
        result = 'Invalid numbers';
      } else {
        switch (op) {
          case '+': result = num1 + num2; break;
          case '-': result = num1 - num2; break;
          case '*': result = num1 * num2; break;
          case '/': result = num2 !== 0 ? num1 / num2 : 'Division by zero'; break;
        }
      }
      $('calcResult').textContent = `Result: ${result}`;
    });
  }
}

/* ============================
   Auto-login on load (if saved session exists)
   ============================ */
window.addEventListener("DOMContentLoaded", () => {
  setHidden(modal, true);
  setHidden(dashboard, true);
  setHidden(twoStepBox, true);
  resetLoginError();

  // Reset localStorage for all users to ensure clean state
  users.forEach(user => {
    localStorage.removeItem(LS_USER_NOTIFS(user.ID));
    user.StaffTokens = 0; // Ensure tokens are reset to 0
  });
  clearLoggedIn();

  const saved = getSavedLoggedIn();
  if (saved) {
    const match = findUserByID(saved);
    if (match) {
      const persisted = loadNotificationsFromStorage(match.ID);
      if (persisted && Array.isArray(persisted)) match.notifications = persisted;
      enterDashboard(match);
    } else {
      clearLoggedIn();
    }
  }
});