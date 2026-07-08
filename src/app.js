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

const STORAGE_KEY = "notepad_custom_session_v5";
const USERNAME_PATTERN = /^[a-z0-9_]{3,30}$/;
const PASSWORD_PATTERN = /^[0-9]{4,}$/;
const DEFAULT_LANGUAGE = "plaintext";

const LANGUAGE_CONFIG = {
  plaintext: {
    label: "متن ساده",
    mode: null,
    prettier: null,
  },
  javascript: {
    label: "JavaScript",
    mode: "javascript",
    prettier: { parser: "babel", plugins: ["babel", "estree"] },
  },
  typescript: {
    label: "TypeScript",
    mode: "text/typescript",
    prettier: { parser: "typescript", plugins: ["typescript", "estree"] },
  },
  json: {
    label: "JSON",
    mode: { name: "javascript", json: true },
    prettier: { parser: "json", plugins: ["babel", "estree"] },
  },
  html: {
    label: "HTML",
    mode: "htmlmixed",
    prettier: { parser: "html", plugins: ["html", "babel", "estree", "postcss"] },
  },
  css: {
    label: "CSS",
    mode: "css",
    prettier: { parser: "css", plugins: ["postcss"] },
  },
  scss: {
    label: "SCSS",
    mode: "text/x-scss",
    prettier: { parser: "scss", plugins: ["postcss"] },
  },
  markdown: {
    label: "Markdown",
    mode: "gfm",
    prettier: { parser: "markdown", plugins: ["markdown"] },
  },
  yaml: {
    label: "YAML",
    mode: "yaml",
    prettier: { parser: "yaml", plugins: ["yaml"] },
  },
  graphql: {
    label: "GraphQL",
    mode: "graphql",
    prettier: { parser: "graphql", plugins: ["graphql"] },
  },
  sql: {
    label: "SQL",
    mode: "sql",
    prettier: null,
    formatter: "sql",
  },
  dax: {
    label: "DAX",
    mode: "dax",
    prettier: null,
    formatter: "dax",
  },
  python: {
    label: "Python",
    mode: "python",
    prettier: null,
    formatter: "python",
  },
  php: {
    label: "PHP",
    mode: "php",
    prettier: null,
  },
  java: {
    label: "Java",
    mode: "text/x-java",
    prettier: null,
  },
  csharp: {
    label: "C#",
    mode: "text/x-csharp",
    prettier: null,
  },
  cpp: {
    label: "C++",
    mode: "text/x-c++src",
    prettier: null,
  },
  go: {
    label: "Go",
    mode: "go",
    prettier: null,
  },
  rust: {
    label: "Rust",
    mode: "rust",
    prettier: null,
  },
};

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
const languageSelect = $("#languageSelect");
const formatCodeBtn = $("#formatCodeBtn");
const copyCodeBtn = $("#copyCodeBtn");
const focusModeBtn = $("#focusModeBtn");
const editorMeta = $("#editorMeta");
const codeEditorHost = $("#codeEditor");

const state = {
  authMode: "login",
  session: null,
  notes: [],
  activeNoteId: null,
  loading: false,
  saving: false,
  codeEditor: null,
  editorReady: false,
  isFocusMode: false,
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

function normalizeLanguage(value) {
  const key = String(value ?? "").trim().toLowerCase();
  return LANGUAGE_CONFIG[key] ? key : DEFAULT_LANGUAGE;
}

function getLanguageLabel(language) {
  return LANGUAGE_CONFIG[normalizeLanguage(language)]?.label ?? LANGUAGE_CONFIG[DEFAULT_LANGUAGE].label;
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
  formatCodeBtn.disabled = disabled;
  copyCodeBtn.disabled = disabled;
  focusModeBtn.disabled = disabled;
  languageSelect.disabled = disabled;
}

function showAuth() {
  authView.classList.remove("hidden");
  notesView.classList.add("hidden");
}

function showNotes() {
  authView.classList.add("hidden");
  notesView.classList.remove("hidden");
  refreshCodeEditor();
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

function getEditorContent() {
  if (state.codeEditor) return state.codeEditor.getValue();
  return noteContent.value;
}

function setEditorContent(value = "") {
  noteContent.value = value ?? "";

  if (state.codeEditor && state.codeEditor.getValue() !== noteContent.value) {
    state.codeEditor.setValue(noteContent.value);
    state.codeEditor.clearHistory();
  }

  updateEditorMeta();
}

function setEditorLanguage(language) {
  const normalized = normalizeLanguage(language);
  languageSelect.value = normalized;
  const config = LANGUAGE_CONFIG[normalized];

  if (state.codeEditor) {
    state.codeEditor.setOption("mode", config.mode);
    window.CodeMirror?.autoLoadMode?.(state.codeEditor, config.mode);
  }

  updateEditorMeta();
}

function refreshCodeEditor() {
  window.requestAnimationFrame(() => {
    state.codeEditor?.refresh();
  });
}

function updateEditorMeta() {
  const content = getEditorContent();
  const activeLanguage = normalizeLanguage(languageSelect.value);
  const lines = content ? content.split("\n").length : 1;
  const chars = content.length;
  const canFormat = Boolean(LANGUAGE_CONFIG[activeLanguage]?.prettier || LANGUAGE_CONFIG[activeLanguage]?.formatter);

  editorMeta.textContent = `${getLanguageLabel(activeLanguage)} · ${toPersianDigits(lines)} خط · ${toPersianDigits(chars)} کاراکتر${canFormat ? " · فرمت فعال" : " · فقط هایلایت"}`;
}

function initializeCodeEditor() {
  if (state.codeEditor || !codeEditorHost || !window.CodeMirror) return;

  state.codeEditor = window.CodeMirror(codeEditorHost, {
    value: "",
    mode: null,
    theme: "material-darker",
    lineNumbers: true,
    lineWrapping: false,
    indentUnit: 2,
    tabSize: 2,
    smartIndent: true,
    autoCloseBrackets: true,
    matchBrackets: true,
    styleActiveLine: true,
    direction: "ltr",
    readOnly: "nocursor",
    extraKeys: {
      "Ctrl-S": (editor) => {
        saveNote();
        return false;
      },
      "Cmd-S": (editor) => {
        saveNote();
        return false;
      },
      "Ctrl-Enter": () => saveNote(),
      "Cmd-Enter": () => saveNote(),
      "Ctrl-Shift-F": () => formatCode(),
      "Cmd-Shift-F": () => formatCode(),
    },
  });

  state.codeEditor.on("change", () => {
    noteContent.value = state.codeEditor.getValue();
    updateEditorMeta();
  });

  state.editorReady = true;
  updateEditorMeta();
}

function updateEditorState() {
  const activeNote = getActiveNote();
  const hasNote = Boolean(activeNote);

  noteTitle.disabled = !hasNote;
  languageSelect.disabled = !hasNote;
  formatCodeBtn.disabled = !hasNote || state.saving;
  copyCodeBtn.disabled = !hasNote || state.saving;
  focusModeBtn.disabled = !hasNote || state.saving;
  saveNoteBtn.disabled = !hasNote || state.saving;
  deleteNoteBtn.disabled = !hasNote || state.saving;
  pinNoteBtn.disabled = !hasNote || state.saving;

  if (state.codeEditor) {
    state.codeEditor.setOption("readOnly", hasNote ? false : "nocursor");
  }

  editorHeading.textContent = hasNote ? "ویرایش یادداشت" : "افزودن یادداشت جدید";
  pinNoteBtn.textContent = activeNote?.is_pinned ? "برداشتن پین" : "پین";

  if (!hasNote) {
    noteTitle.value = "";
    setEditorLanguage(DEFAULT_LANGUAGE);
    setEditorContent("");
  }

  updateEditorMeta();
  refreshCodeEditor();
}

function updateStats() {
  notesCount.textContent = `${toPersianDigits(state.notes.length)} نوت`;
}

function renderNotes() {
  const keyword = normalizeText(searchInput.value);
  const filtered = state.notes.filter((note) => {
    const title = normalizeText(note.title);
    const content = normalizeText(note.content);
    const language = normalizeText(getLanguageLabel(note.language));
    return title.includes(keyword) || content.includes(keyword) || language.includes(keyword);
  });

  notesList.innerHTML = "";
  updateStats();

  if (filtered.length === 0) {
    notesList.innerHTML = `
      <div class="empty-state">
        ${keyword ? "نوتی با این جستجو پیدا نشد." : "هنوز نوتی نداری. از دکمه «نوت جدید» شروع کن."}
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
    const language = normalizeLanguage(note.language);

    button.innerHTML = `
      <div class="note-item-header">
        <h3>${note.is_pinned ? '<span class="pin-badge">★</span> ' : ""}${escapeHtml(title)}</h3>
        <span class="note-date">${escapeHtml(formatDate(note.updated_at))}</span>
      </div>
      <div class="note-item-meta">
        <span class="language-badge">${escapeHtml(getLanguageLabel(language))}</span>
        <span>${toPersianDigits(content.split("\n").length)} خط</span>
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
  setEditorLanguage(note.language ?? DEFAULT_LANGUAGE);
  setEditorContent(note.content ?? "");
  setMessage(noteMessage);
  updateEditorState();
  renderNotes();
}

function sortNotes(notes) {
  return [...notes].filter(Boolean).sort((a, b) => {
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
    return "اکستنشن pgcrypto یا search_path دیتابیس درست تنظیم نشده است. فایل supabase.sql را کامل داخل SQL Editor اجرا کن.";
  }

  if (lower.includes("function") && lower.includes("does not exist")) {
    return "تابع‌های دیتابیس در API دیده نمی‌شوند. فایل supabase.sql نسخه جدید را اجرا کن و سپس دستور NOTIFY pgrst, 'reload schema'; را بزن.";
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

  state.notes = sortNotes(data ?? []).map((note) => ({
    ...note,
    language: normalizeLanguage(note.language),
  }));

  if (keepActive && activeBeforeLoad && state.notes.some((note) => note.id === activeBeforeLoad)) {
    state.activeNoteId = activeBeforeLoad;
  } else {
    state.activeNoteId = state.notes[0]?.id ?? null;
  }

  if (state.activeNoteId) {
    const selected = getActiveNote();
    noteTitle.value = selected?.title ?? "";
    setEditorLanguage(selected?.language ?? DEFAULT_LANGUAGE);
    setEditorContent(selected?.content ?? "");
  }

  renderNotes();
  updateEditorState();
  lastSync.textContent = "همگام شد";
  setMessage(noteMessage);
}

async function createNote() {
  const selectedLanguage = normalizeLanguage(languageSelect.value);
  setMessage(noteMessage, "در حال ساخت نوت جدید...");
  setButtonsDisabled(true);

  const { data, error } = await supabase.rpc("app_create_note", {
    p_session_token: getSessionToken(),
    p_title: selectedLanguage === DEFAULT_LANGUAGE ? "نوت جدید" : `${getLanguageLabel(selectedLanguage)} Snippet`,
    p_content: "",
    p_language: selectedLanguage,
  });

  setButtonsDisabled(false);

  if (error) {
    setMessage(noteMessage, getReadableError(error), "error");
    return;
  }

  const newNote = firstRow(data);
  state.notes = sortNotes([{ ...newNote, language: normalizeLanguage(newNote.language) }, ...state.notes]);
  selectNote(newNote.id);
  noteTitle.focus();
  noteTitle.select();
  setMessage(noteMessage, "نوت جدید ساخته شد.", "success");
}

async function saveNote() {
  const activeNote = getActiveNote();
  if (!activeNote) {
    setMessage(noteMessage, "اول یک نوت بساز یا انتخاب کن.", "error");
    return;
  }

  const title = noteTitle.value.trim() || "بدون عنوان";
  const content = getEditorContent();
  const language = normalizeLanguage(languageSelect.value);

  state.saving = true;
  updateEditorState();
  setMessage(noteMessage, "در حال ذخیره...");

  const { data, error } = await supabase.rpc("app_update_note", {
    p_session_token: getSessionToken(),
    p_note_id: activeNote.id,
    p_title: title,
    p_content: content,
    p_is_pinned: activeNote.is_pinned,
    p_language: language,
  });

  state.saving = false;
  updateEditorState();

  if (error) {
    setMessage(noteMessage, getReadableError(error), "error");
    return;
  }

  const updatedNote = { ...firstRow(data), language };
  state.notes = sortNotes(state.notes.map((note) => (note.id === updatedNote.id ? updatedNote : note)));
  state.activeNoteId = updatedNote.id;
  renderNotes();
  lastSync.textContent = "ذخیره شد";
  setMessage(noteMessage, "ذخیره شد.", "success");
}

async function deleteNote() {
  const activeNote = getActiveNote();
  if (!activeNote) {
    setMessage(noteMessage, "نوتی برای حذف انتخاب نشده.", "error");
    return;
  }

  const confirmed = window.confirm("این نوت حذف شود؟");
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
    setEditorLanguage(selected?.language ?? DEFAULT_LANGUAGE);
    setEditorContent(selected?.content ?? "");
  }

  renderNotes();
  updateEditorState();
  setMessage(noteMessage, "نوت حذف شد.", "success");
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
    p_language: normalizeLanguage(activeNote.language),
  });

  if (error) {
    setMessage(noteMessage, getReadableError(error), "error");
    return;
  }

  const updatedNote = { ...firstRow(data), language: normalizeLanguage(firstRow(data)?.language) };
  state.notes = sortNotes(state.notes.map((note) => (note.id === updatedNote.id ? updatedNote : note)));
  state.activeNoteId = updatedNote.id;
  renderNotes();
  updateEditorState();
  setMessage(noteMessage, updatedNote.is_pinned ? "نوت پین شد." : "پین برداشته شد.", "success");
}

function getPrettierPlugin(name) {
  return window.prettierPlugins?.[name];
}

async function formatCode() {
  const activeNote = getActiveNote();
  if (!activeNote) {
    setMessage(noteMessage, "اول یک نوت بساز یا انتخاب کن.", "error");
    return;
  }

  const language = normalizeLanguage(languageSelect.value);
  const config = LANGUAGE_CONFIG[language];
  const prettierConfig = config?.prettier;
  const customFormatter = config?.formatter;

  try {
    setMessage(noteMessage, "در حال فرمت کردن...");
    formatCodeBtn.disabled = true;

    if (prettierConfig) {
      if (!window.prettier || !window.prettierPlugins) {
        setMessage(noteMessage, "Prettier هنوز لود نشده است. اتصال اینترنت/CDN را چک کن.", "error");
        return;
      }

      const plugins = prettierConfig.plugins.map(getPrettierPlugin).filter(Boolean);
      const formatted = await window.prettier.format(getEditorContent(), {
        parser: prettierConfig.parser,
        plugins,
        semi: true,
        singleQuote: false,
        printWidth: 90,
        tabWidth: 2,
        trailingComma: "es5",
      });

      setEditorContent(formatted.trimEnd());
      state.codeEditor?.focus();
      setMessage(noteMessage, "کد با Prettier مرتب شد.", "success");
      return;
    }

    if (customFormatter) {
      const formatted = formatWithBuiltInFormatter(getEditorContent(), customFormatter);
      setEditorContent(formatted.trimEnd());
      state.codeEditor?.focus();
      setMessage(noteMessage, `${getLanguageLabel(language)} مرتب شد.`, "success");
      return;
    }

    setMessage(noteMessage, `برای ${getLanguageLabel(language)} فقط هایلایتینگ فعال است.`, "error");
  } catch (error) {
    setMessage(noteMessage, `فرمت انجام نشد: ${error.message}`, "error");
  } finally {
    formatCodeBtn.disabled = false;
  }
}

function formatWithBuiltInFormatter(source, formatter) {
  const value = String(source || "").replace(/\r\n/g, "\n");

  if (formatter === "sql") return formatSqlLike(value);
  if (formatter === "dax") return formatDax(value);
  if (formatter === "python") return formatPython(value);

  return value;
}

function formatSqlLike(source) {
  const upperKeywords = [
    "select", "from", "where", "group by", "order by", "having", "limit", "offset",
    "insert into", "values", "update", "set", "delete", "create", "alter", "drop",
    "left join", "right join", "inner join", "full join", "cross join", "join", "on",
    "union all", "union", "case", "when", "then", "else", "end", "and", "or", "as"
  ];

  let formatted = source.trim();
  if (!formatted) return "";

  for (const keyword of upperKeywords.sort((a, b) => b.length - a.length)) {
    const pattern = new RegExp(`\\b${keyword.replace(/ /g, "\\s+")}\\b`, "gi");
    formatted = formatted.replace(pattern, keyword.toUpperCase());
  }

  formatted = formatted
    .replace(/\s+/g, " ")
    .replace(/\s*,\s*/g, ", ")
    .replace(/\s*;\s*/g, ";\n")
    .replace(/\b(FROM|WHERE|GROUP BY|ORDER BY|HAVING|LIMIT|OFFSET|VALUES|SET)\b/g, "\n$1")
    .replace(/\b(LEFT JOIN|RIGHT JOIN|INNER JOIN|FULL JOIN|CROSS JOIN|JOIN|UNION ALL|UNION)\b/g, "\n$1")
    .replace(/\b(AND|OR)\b/g, "\n  $1")
    .replace(/,\s*(?=[^)]*(?:\(|$))/g, ",\n  ");

  return formatted
    .split("\n")
    .map((line) => line.trimEnd())
    .filter((line, index, arr) => line.trim() || arr[index - 1]?.trim())
    .join("\n")
    .trim();
}

function formatDax(source) {
  const keywords = [
    "measure", "evaluate", "var", "return", "calculate", "filter", "all", "allexcept", "sumx",
    "averagex", "countx", "countrows", "if", "switch", "true", "false", "and", "or", "not",
    "summarize", "addcolumns", "selectcolumns", "datesytd", "sameperiodlastyear", "related", "relatedtable"
  ];

  let formatted = source.trim();
  if (!formatted) return "";

  for (const keyword of keywords.sort((a, b) => b.length - a.length)) {
    const pattern = new RegExp(`\\b${keyword}\\b`, "gi");
    formatted = formatted.replace(pattern, keyword.toUpperCase());
  }

  formatted = formatted
    .replace(/\s+/g, " ")
    .replace(/\s*:=\s*/g, " := ")
    .replace(/\s*=\s*/g, " = ")
    .replace(/\s*,\s*/g, ", ")
    .replace(/\bVAR\b/g, "\nVAR")
    .replace(/\bRETURN\b/g, "\nRETURN")
    .replace(/,\s*/g, ",\n  ")
    .replace(/\(\s*/g, "(")
    .replace(/\s*\)/g, ")");

  return formatted
    .split("\n")
    .map((line) => line.trimEnd())
    .filter(Boolean)
    .join("\n")
    .trim();
}

function formatPython(source) {
  let indentLevel = 0;
  const dedentStarters = /^(elif\b|else:|except\b|finally:)/;

  return source
    .replace(/\r\n/g, "\n")
    .split("\n")
    .map((line) => line.replace(/\t/g, "    "))
    .map((line) => line.trim())
    .map((line) => {
      if (!line) return "";
      if (dedentStarters.test(line)) indentLevel = Math.max(0, indentLevel - 1);
      const output = `${"    ".repeat(indentLevel)}${line}`;
      if (line.endsWith(":") && !line.startsWith("#")) indentLevel += 1;
      if (/^(return|pass|break|continue|raise)\b/.test(line)) indentLevel = Math.max(0, indentLevel - 1);
      return output;
    })
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

async function copyCode() {
  const content = getEditorContent();
  if (!content.trim()) {
    setMessage(noteMessage, "متنی برای کپی وجود ندارد.", "error");
    return;
  }

  try {
    await navigator.clipboard.writeText(content);
    setMessage(noteMessage, "متن کپی شد.", "success");
  } catch {
    setMessage(noteMessage, "مرورگر اجازه کپی خودکار نداد. متن را دستی انتخاب کن.", "error");
  }
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
  initializeCodeEditor();
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
languageSelect.addEventListener("change", () => {
  setEditorLanguage(languageSelect.value);
  setMessage(noteMessage, `${getLanguageLabel(languageSelect.value)} انتخاب شد.`, "success");
});
formatCodeBtn.addEventListener("click", formatCode);
copyCodeBtn.addEventListener("click", copyCode);
focusModeBtn.addEventListener("click", () => {
  state.isFocusMode = !state.isFocusMode;
  document.documentElement.classList.toggle("focus-editor", state.isFocusMode);
  focusModeBtn.textContent = state.isFocusMode ? "خروج از تمرکز" : "تمرکز";
  refreshCodeEditor();
});

noteTitle.addEventListener("keydown", (event) => {
  if ((event.ctrlKey || event.metaKey) && event.key === "Enter") {
    event.preventDefault();
    saveNote();
  }
});

document.addEventListener("keydown", (event) => {
  const key = event.key.toLowerCase();

  if ((event.ctrlKey || event.metaKey) && key === "s") {
    event.preventDefault();
    saveNote();
  }

  if ((event.ctrlKey || event.metaKey) && event.shiftKey && key === "f") {
    event.preventDefault();
    formatCode();
  }
});

bootstrap();
