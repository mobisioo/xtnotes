import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { SUPABASE_KEY, SUPABASE_URL } from "./config.js";

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY, {
  auth: {
    persistSession: false,
    autoRefreshToken: false,
    detectSessionInUrl: false,
  },
});

const telegramWebApp = window.Telegram?.WebApp;
if (telegramWebApp) {
  telegramWebApp.ready();
  telegramWebApp.expand();
  document.documentElement.classList.add("telegram-webapp");
}

const STORAGE_KEY = "notepad_custom_session_v4";
const USERNAME_PATTERN = /^[a-z0-9_]{3,30}$/;
const PASSWORD_PATTERN = /^[0-9]{4,}$/;

const $ = (selector) => document.querySelector(selector);

const authView = $("#authView");
const notesView = $("#notesView");
const authForm = $("#authForm");
const showLoginBtn = $("#showLoginBtn");
const showRegisterBtn = $("#showRegisterBtn");
const submitAuthBtn = $("#submitAuthBtn");
const usernameInput = $("#usernameInput");
const passwordInput = $("#passwordInput");
const authMessage = $("#authMessage");
const logoutBtn = $("#logoutBtn");

const notesCount = $("#notesCount");
const lastSync = $("#lastSync");
const notesList = $("#notesList");
const searchInput = $("#searchInput");
const newNoteBtn = $("#newNoteBtn");
const saveNoteBtn = $("#saveNoteBtn");
const deleteNoteBtn = $("#deleteNoteBtn");
const pinNoteBtn = $("#pinNoteBtn");
const noteTitle = $("#noteTitle");
const noteContent = $("#noteContent");
const noteMessage = $("#noteMessage");
const editorHeading = $("#editorHeading");

const state = {
  authMode: "login",
  session: null,
  notes: [],
  activeNoteId: null,
  loading: false,
  saving: false,
};

function setMessage(element, text = "", type = "normal") {
  element.textContent = text;
  element.classList.remove("error", "success");

  if (type === "error") element.classList.add("error");
  if (type === "success") element.classList.add("success");
}

function toPersianDigits(value) {
  return String(value).replace(/\d/g, (digit) => "۰۱۲۳۴۵۶۷۸۹"[digit]);
}

function formatDate(value) {
  if (!value) return "";

  return new Intl.DateTimeFormat("fa-IR", {
    dateStyle: "short",
    timeStyle: "short",
  }).format(new Date(value));
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function normalizeText(value) {
  return String(value ?? "")
    .toLowerCase()
    .replaceAll("ي", "ی")
    .replaceAll("ك", "ک")
    .trim();
}

function normalizeUsername(value) {
  return String(value ?? "").trim().toLowerCase();
}

function getSavedSession() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;

    const parsed = JSON.parse(raw);
    if (!parsed?.sessionToken || !parsed?.username) return null;

    return parsed;
  } catch {
    return null;
  }
}

function saveSession(session) {
  state.session = session;
  localStorage.setItem(STORAGE_KEY, JSON.stringify(session));
}

function clearSession() {
  state.session = null;
  localStorage.removeItem(STORAGE_KEY);
}

function getSessionToken() {
  return state.session?.sessionToken ?? null;
}

function validateAuthFields(username, password) {
  if (!username || !password) {
    return "یوزرنیم و رمز عبور را وارد کن.";
  }

  if (!USERNAME_PATTERN.test(username)) {
    return "یوزرنیم باید ۳ تا ۳۰ کاراکتر و فقط شامل حروف انگلیسی کوچک، عدد یا _ باشد.";
  }

  if (!PASSWORD_PATTERN.test(password)) {
    return "رمز عبور باید حداقل ۴ رقم باشد؛ مثلاً 1234.";
  }

  return "";
}

function getActiveNote() {
  return state.notes.find((note) => note.id === state.activeNoteId) ?? null;
}

function setButtonsDisabled(disabled) {
  submitAuthBtn.disabled = disabled;
  newNoteBtn.disabled = disabled;
  saveNoteBtn.disabled = disabled;
  deleteNoteBtn.disabled = disabled;
  pinNoteBtn.disabled = disabled;
  logoutBtn.disabled = disabled;
}

function showAuth() {
  authView.classList.remove("hidden");
  notesView.classList.add("hidden");
}

function showNotes() {
  authView.classList.add("hidden");
  notesView.classList.remove("hidden");
}

function setAuthMode(mode) {
  state.authMode = mode;
  const isLogin = mode === "login";

  showLoginBtn.classList.toggle("active", isLogin);
  showRegisterBtn.classList.toggle("active", !isLogin);
  submitAuthBtn.textContent = isLogin ? "ورود" : "ثبت‌نام";
  passwordInput.autocomplete = isLogin ? "current-password" : "new-password";
  setMessage(authMessage);
}

function updateEditorState() {
  const activeNote = getActiveNote();
  const hasNote = Boolean(activeNote);

  noteTitle.disabled = !hasNote;
  noteContent.disabled = !hasNote;
  saveNoteBtn.disabled = !hasNote || state.saving;
  deleteNoteBtn.disabled = !hasNote || state.saving;
  pinNoteBtn.disabled = !hasNote || state.saving;

  editorHeading.textContent = hasNote ? "ویرایش یادداشت" : "افزودن یادداشت جدید";
  pinNoteBtn.textContent = activeNote?.is_pinned ? "برداشتن پین" : "پین";

  if (!hasNote) {
    noteTitle.value = "";
    noteContent.value = "";
  }
}

function updateStats() {
  notesCount.textContent = `${toPersianDigits(state.notes.length)} یادداشت‌ `;
}

function renderNotes() {
  const keyword = normalizeText(searchInput.value);
  const filtered = state.notes.filter((note) => {
    const title = normalizeText(note.title);
    const content = normalizeText(note.content);
    return title.includes(keyword) || content.includes(keyword);
  });

  notesList.innerHTML = "";
  updateStats();

  if (filtered.length === 0) {
    notesList.innerHTML = `
      <div class="empty-state">
        ${keyword ? "یادداشت‌  با این جستجو پیدا نشد." : "هنوز یادداشت‌  نداری. از دکمه «یادداشت‌  جدید» شروع کن."}
      </div>
    `;
    return;
  }

  const fragment = document.createDocumentFragment();

  for (const note of filtered) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = `note-item ${note.id === state.activeNoteId ? "active" : ""}`;
    button.dataset.noteId = note.id;

    const title = note.title?.trim() || "بدون عنوان";
    const content = note.content?.trim() || "بدون متن";

    button.innerHTML = `
      <div class="note-item-header">
        <h3>${note.is_pinned ? '<span class="pin-badge">★</span> ' : ""}${escapeHtml(title)}</h3>
        <span class="note-date">${escapeHtml(formatDate(note.updated_at))}</span>
      </div>
      <p>${escapeHtml(content)}</p>
    `;

    button.addEventListener("click", () => selectNote(note.id));
    fragment.appendChild(button);
  }

  notesList.appendChild(fragment);
}

function selectNote(id) {
  const note = state.notes.find((item) => item.id === id);
  if (!note) return;

  state.activeNoteId = id;
  noteTitle.value = note.title ?? "";
  noteContent.value = note.content ?? "";
  setMessage(noteMessage);
  updateEditorState();
  renderNotes();
}

function sortNotes(notes) {
  return [...notes].sort((a, b) => {
    if (a.is_pinned !== b.is_pinned) return a.is_pinned ? -1 : 1;
    return new Date(b.updated_at) - new Date(a.updated_at);
  });
}

function firstRow(data) {
  if (Array.isArray(data)) return data[0] ?? null;
  return data ?? null;
}

function getReadableError(error) {
  if (!error?.message) return "خطای نامشخص رخ داد.";

  const message = error.message;
  const lower = message.toLowerCase();

  if (lower.includes("invalid username or password")) {
    return "یوزرنیم یا رمز عبور اشتباه است.";
  }

  if (lower.includes("username already exists")) {
    return "این یوزرنیم قبلاً ثبت شده است.";
  }

  if (lower.includes("invalid or expired session")) {
    return "نشست ورود منقضی شده است. دوباره وارد شو.";
  }

  if ((lower.includes("gen_salt") || lower.includes("crypt")) && lower.includes("does not exist")) {
    return "اکستنشن pgcrypto یا search_path دیتابیس درست تنظیم نشده است. فایل supabase.sql نسخه v4 را کامل داخل SQL Editor اجرا کن.";
  }

  if (lower.includes("function") && lower.includes("does not exist")) {
    return "تابع‌های دیتابیس در API دیده نمی‌شوند. فایل supabase.sql نسخه v4 را اجرا کن و سپس دستور NOTIFY pgrst, 'reload schema'; را بزن.";
  }

  return message;
}

async function loadNotes({ keepActive = false } = {}) {
  const sessionToken = getSessionToken();

  if (!sessionToken) {
    clearSession();
    showAuth();
    return;
  }

  state.loading = true;
  setButtonsDisabled(true);
  lastSync.textContent = "در حال دریافت...";

  const activeBeforeLoad = state.activeNoteId;

  const { data, error } = await supabase.rpc("app_list_notes", {
    p_session_token: sessionToken,
  });

  state.loading = false;
  setButtonsDisabled(false);

  if (error) {
    setMessage(noteMessage, getReadableError(error), "error");
    lastSync.textContent = "خطا در دریافت";

    if (error.message.toLowerCase().includes("invalid or expired session")) {
      clearSession();
      showAuth();
    }

    updateEditorState();
    return;
  }

  state.notes = sortNotes(data ?? []);

  if (keepActive && activeBeforeLoad && state.notes.some((note) => note.id === activeBeforeLoad)) {
    state.activeNoteId = activeBeforeLoad;
  } else {
    state.activeNoteId = state.notes[0]?.id ?? null;
  }

  if (state.activeNoteId) {
    const selected = getActiveNote();
    noteTitle.value = selected?.title ?? "";
    noteContent.value = selected?.content ?? "";
  }

  renderNotes();
  updateEditorState();
  lastSync.textContent = "همگام شد";
  setMessage(noteMessage);
}

async function createNote() {
  setMessage(noteMessage, "در حال ساخت یادداشت‌ جدید...");
  setButtonsDisabled(true);

  const { data, error } = await supabase.rpc("app_create_note", {
    p_session_token: getSessionToken(),
    p_title: "یادداشت‌ جدید",
    p_content: "",
  });

  setButtonsDisabled(false);

  if (error) {
    setMessage(noteMessage, getReadableError(error), "error");
    return;
  }

  const newNote = firstRow(data);
  state.notes = sortNotes([newNote, ...state.notes]);
  selectNote(newNote.id);
  noteTitle.focus();
  noteTitle.select();
  setMessage(noteMessage, "یادداشت‌ جدید ساخته شد.", "success");
}

async function saveNote() {
  const activeNote = getActiveNote();
  if (!activeNote) {
    setMessage(noteMessage, "اول یک یادداشت‌ بساز یا انتخاب کن.", "error");
    return;
  }

  const title = noteTitle.value.trim() || "بدون عنوان";
  const content = noteContent.value;

  state.saving = true;
  updateEditorState();
  setMessage(noteMessage, "در حال ذخیره...");

  const { data, error } = await supabase.rpc("app_update_note", {
    p_session_token: getSessionToken(),
    p_note_id: activeNote.id,
    p_title: title,
    p_content: content,
    p_is_pinned: activeNote.is_pinned,
  });

  state.saving = false;
  updateEditorState();

  if (error) {
    setMessage(noteMessage, getReadableError(error), "error");
    return;
  }

  const updatedNote = firstRow(data);
  state.notes = sortNotes(state.notes.map((note) => (note.id === updatedNote.id ? updatedNote : note)));
  state.activeNoteId = updatedNote.id;
  renderNotes();
  lastSync.textContent = "ذخیره شد";
  setMessage(noteMessage, "ذخیره شد.", "success");
}

async function deleteNote() {
  const activeNote = getActiveNote();
  if (!activeNote) {
    setMessage(noteMessage, "یادداشت‌ برای حذف انتخاب نشده.", "error");
    return;
  }

  const confirmed = window.confirm("این یادداشت‌ حذف شود؟");
  if (!confirmed) return;

  setButtonsDisabled(true);
  setMessage(noteMessage, "در حال حذف...");

  const { error } = await supabase.rpc("app_delete_note", {
    p_session_token: getSessionToken(),
    p_note_id: activeNote.id,
  });

  setButtonsDisabled(false);

  if (error) {
    setMessage(noteMessage, getReadableError(error), "error");
    return;
  }

  state.notes = state.notes.filter((note) => note.id !== activeNote.id);
  state.activeNoteId = state.notes[0]?.id ?? null;

  if (state.activeNoteId) {
    const selected = getActiveNote();
    noteTitle.value = selected?.title ?? "";
    noteContent.value = selected?.content ?? "";
  }

  renderNotes();
  updateEditorState();
  setMessage(noteMessage, "یادداشت‌ حذف شد.", "success");
}

async function togglePin() {
  const activeNote = getActiveNote();
  if (!activeNote) return;

  setMessage(noteMessage, "در حال به‌روزرسانی...");

  const { data, error } = await supabase.rpc("app_update_note", {
    p_session_token: getSessionToken(),
    p_note_id: activeNote.id,
    p_title: activeNote.title ?? "بدون عنوان",
    p_content: activeNote.content ?? "",
    p_is_pinned: !activeNote.is_pinned,
  });

  if (error) {
    setMessage(noteMessage, getReadableError(error), "error");
    return;
  }

  const updatedNote = firstRow(data);
  state.notes = sortNotes(state.notes.map((note) => (note.id === updatedNote.id ? updatedNote : note)));
  state.activeNoteId = updatedNote.id;
  renderNotes();
  updateEditorState();
  setMessage(noteMessage, updatedNote.is_pinned ? "یادداشت‌  پین شد." : "پین برداشته شد.", "success");
}

async function handleAuthSubmit(event) {
  event.preventDefault();

  const username = normalizeUsername(usernameInput.value);
  const password = passwordInput.value.trim();
  const validationError = validateAuthFields(username, password);

  if (validationError) {
    setMessage(authMessage, validationError, "error");
    return;
  }

  usernameInput.value = username;
  submitAuthBtn.disabled = true;
  setMessage(authMessage, state.authMode === "login" ? "در حال ورود..." : "در حال ثبت‌نام...");

  const rpcName = state.authMode === "login" ? "app_login" : "app_register";
  const { data, error } = await supabase.rpc(rpcName, {
    p_username: username,
    p_password: password,
  });

  submitAuthBtn.disabled = false;

  if (error) {
    setMessage(authMessage, getReadableError(error), "error");
    return;
  }

  saveSession(data);
  setMessage(authMessage, state.authMode === "login" ? "ورود موفق بود." : "ثبت‌نام و ورود انجام شد.", "success");
  showNotes();
  await loadNotes();
}

async function logout() {
  const sessionToken = getSessionToken();

  if (sessionToken) {
    await supabase.rpc("app_logout", {
      p_session_token: sessionToken,
    });
  }

  clearSession();
  state.notes = [];
  state.activeNoteId = null;
  renderNotes();
  updateEditorState();
  showAuth();
}

async function bootstrap() {
  setAuthMode("login");
  updateEditorState();

  const savedSession = getSavedSession();

  if (!savedSession) {
    showAuth();
    return;
  }

  state.session = savedSession;
  showNotes();
  await loadNotes();
}

showLoginBtn.addEventListener("click", () => setAuthMode("login"));
showRegisterBtn.addEventListener("click", () => setAuthMode("register"));
authForm.addEventListener("submit", handleAuthSubmit);
logoutBtn.addEventListener("click", logout);
newNoteBtn.addEventListener("click", createNote);
saveNoteBtn.addEventListener("click", saveNote);
deleteNoteBtn.addEventListener("click", deleteNote);
pinNoteBtn.addEventListener("click", togglePin);
searchInput.addEventListener("input", renderNotes);

[noteTitle, noteContent].forEach((element) => {
  element.addEventListener("keydown", (event) => {
    if (event.ctrlKey && event.key === "Enter") {
      event.preventDefault();
      saveNote();
    }
  });
});

document.querySelectorAll(".tag-chip").forEach((chip) => {
  chip.addEventListener("click", () => {
    if (chip.classList.contains("add")) return;

    document.querySelectorAll(".tag-chip").forEach((item) => item.classList.remove("active"));
    chip.classList.add("active");
  });
});

bootstrap();
