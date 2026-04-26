import { backend } from "./firebase.js";

const state = {
  authReady: false,
  user: null,
  account: null,
  data: emptyData(),
  loadingData: false,
  currentView: "dashboard",
  selectedStudentId: null,
  search: "",
  homeworkFilter: "all",
  authMode: "login",
  publicView: "landing",
  notice: "",
  unsubscribeData: null,
  profileTab: "lessons",
  pendingDeleteId: null
};

const authMount = document.getElementById("authMount");
const appShell = document.getElementById("appShell");
const appView = document.getElementById("appView");
const modalBackdrop = document.getElementById("modalBackdrop");
const modalRoot = document.getElementById("modalRoot");
const searchInput = document.getElementById("searchInput");
const searchField = document.getElementById("searchField");
const addStudentBtn = document.getElementById("addStudentBtn");
const resetDataBtn = document.getElementById("resetDataBtn");
const logoutBtn = document.getElementById("logoutBtn");
const userEmail = document.getElementById("userEmail");
const backendStatus = document.getElementById("backendStatus");

const toastContainer = document.createElement("div");
toastContainer.id = "toastContainer";
toastContainer.style.cssText = `
  position: fixed;
  bottom: 24px;
  right: 24px;
  z-index: 9999;
  display: grid;
  gap: 10px;
  width: min(320px, calc(100vw - 32px));
`;
document.body.appendChild(toastContainer);

init();

function init() {
  document.querySelectorAll("[data-view]").forEach((button) => {
    button.addEventListener("click", () => {
      const nextView = button.dataset.view;
      if (!allowedViews().includes(nextView)) return;
      state.currentView = nextView;
      if (isTutor() && !["profile", "cabinet"].includes(nextView)) {
        state.selectedStudentId = null;
      }
      render();
    });
  });

  searchInput.addEventListener("input", (event) => {
    state.search = event.target.value.trim().toLowerCase();
    render();
  });

  addStudentBtn.addEventListener("click", () => openStudentModal());
  resetDataBtn.addEventListener("click", resetDataset);
  logoutBtn.addEventListener("click", handleSignOut);

  modalBackdrop.addEventListener("click", (event) => {
    if (event.target === modalBackdrop || event.target.hasAttribute("data-close-modal")) {
      closeModal();
    }
  });

  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape") closeModal();
  });

  backend.onAuthChange(async (user) => {
    state.user = user;
    state.authReady = true;
    state.notice = "";

    if (state.unsubscribeData) {
      state.unsubscribeData();
      state.unsubscribeData = null;
    }

    if (!user) {
      state.account = null;
      state.data = emptyData();
      state.selectedStudentId = null;
      state.currentView = "dashboard";
      state.publicView = "landing";
      state.loadingData = false;
      render();
      return;
    }

    await bootUserSession();
  });

  render();
}

async function bootUserSession() {
  state.loadingData = true;
  render();

  try {
    state.account = await backend.loadSession(state.user);
    if (!state.account) {
      state.notice = "Не удалось загрузить профиль аккаунта.";
      state.data = emptyData();
      state.loadingData = false;
      render();
      return;
    }
    state.selectedStudentId = isStudent() ? state.account.studentId : null;
    state.currentView = "dashboard";
    if (state.account?.disabled) {
      state.data = emptyData();
      state.loadingData = false;
      render();
      return;
    }
    state.data = normalizeData(await backend.loadData(state.user, state.account));
  } catch (error) {
    state.notice = getErrorMessage(error);
  }

  try {
    if (!state.account) {
      state.loadingData = false;
      render();
      return;
    }
    state.unsubscribeData = backend.subscribeData(
      state.user,
      state.account,
      (data) => {
        state.data = normalizeData(data);
        state.loadingData = false;
        render();
      },
      (error) => {
        state.notice = getErrorMessage(error);
        state.loadingData = false;
        render();
      }
    );
  } catch (error) {
    state.notice = getErrorMessage(error);
  }

  state.loadingData = false;
  render();
}

function render() {
  syncChrome();

  if (!state.authReady) {
    renderSplash();
    return;
  }

  if (!state.user) {
    renderPublicScreen();
    return;
  }

  authMount.classList.add("hidden");
  appShell.classList.remove("hidden");

  if (state.loadingData) {
    appView.innerHTML = renderLoadingPanel("Подключаем аккаунт и загружаем данные...");
    return;
  }

  if (state.account?.disabled) {
    appView.innerHTML = renderAccessRevokedView();
    bindAccessRevokedView();
    return;
  }

  if (isStudent() && !currentStudent()) {
    appView.innerHTML = renderMissingStudentBinding();
    return;
  }

  if (!allowedViews().includes(state.currentView)) {
    state.currentView = "dashboard";
  }

  if (isStudent()) {
    renderStudentViews();
    return;
  }

  renderTutorViews();
}

function renderTutorViews() {
  if (state.currentView === "students") {
    appView.innerHTML = renderStudentsView();
    bindStudentsView();
    return;
  }

  if (state.currentView === "homework") {
    appView.innerHTML = renderHomeworkView();
    bindHomeworkView();
    return;
  }

  if (state.currentView === "portals") {
    appView.innerHTML = renderPortalsView();
    bindPortalsView();
    return;
  }

  if (state.currentView === "videos") {
    appView.innerHTML = renderVideosView();
    bindVideosView();
    return;
  }

  if (state.currentView === "cabinet" && state.selectedStudentId) {
    appView.innerHTML = renderCabinetView();
    bindCabinetView();
    return;
  }

  if (state.currentView === "calendar") {
    appView.innerHTML = renderCalendarView();
    bindCalendarView();
    return;
  }

  if (state.currentView === "profile" && state.selectedStudentId) {
    appView.innerHTML = renderProfileView();
    bindProfileView();
    return;
  }

  state.currentView = "dashboard";
  appView.innerHTML = renderDashboardView();
  bindDashboardView();
}

function renderStudentViews() {
  if (state.currentView === "homework") {
    appView.innerHTML = renderHomeworkView();
    bindHomeworkView();
    return;
  }

  if (state.currentView === "calendar") {
    appView.innerHTML = renderCalendarView();
    bindCalendarView();
    return;
  }

  if (state.currentView === "videos") {
    appView.innerHTML = renderVideosView();
    bindVideosView();
    return;
  }

  state.currentView = "dashboard";
  appView.innerHTML = renderDashboardView();
  bindDashboardView();
}

function syncChrome() {
  appShell.classList.toggle("hidden", !state.authReady || !state.user);
  authMount.classList.toggle("hidden", !state.authReady || !!state.user);

  const roleLabel = isStudent() ? "Кабинет ученика" : "Кабинет репетитора";
  backendStatus.textContent = `${backend.mode === "firebase" ? "Firebase Cloud" : "Демо-режим"} · ${roleLabel}`;
  backendStatus.classList.toggle("is-live", backend.mode === "firebase");
  userEmail.textContent = state.user?.email || "guest@demo.local";

  resetDataBtn.textContent = backend.mode === "firebase" ? "Загрузить демо" : "Сбросить демо";
  resetDataBtn.classList.toggle("hidden", !isTutor());
  addStudentBtn.classList.toggle("hidden", !isTutor());

  if (searchField) {
    searchField.classList.toggle("hidden", !state.user);
  }
  searchInput.placeholder = isStudent()
    ? "Поиск по домашкам, видео и заметкам"
    : "Имя, предмет, заметка, видео";

  document.body.classList.toggle("student-mode", isStudent());

  document.querySelectorAll("[data-view]").forEach((button) => {
    const scope = button.dataset.roleScope || "all";
    const hiddenForRole = scope === "tutor" && isStudent();
    button.classList.toggle("hidden", hiddenForRole);
    button.classList.toggle("is-active", button.dataset.view === state.currentView);

    const tutorLabel = button.dataset.labelTutor || button.textContent;
    const studentLabel = button.dataset.labelStudent || tutorLabel;
    button.textContent = isStudent() ? studentLabel : tutorLabel;
  });
}

function renderSplash() {
  authMount.classList.remove("hidden");
  appShell.classList.add("hidden");
  authMount.innerHTML = `
    <section class="auth-card auth-card--center">
      <div class="brand-mark">IN</div>
      <p class="eyebrow">Intellika</p>
      <h2 class="hero-title">Поднимаем платформу...</h2>
    </section>
  `;
}

function renderPublicScreen() {
  if (state.publicView === "auth") {
    renderAuthScreen();
    return;
  }
  renderLandingScreen();
}

function renderLandingScreen() {
  authMount.innerHTML = `
    <section class="landing-shell">
      <div class="landing-hero">
        <div class="landing-copy">
          <div class="landing-brandline">
            <div class="brand-mark">IN</div>
            <div>
              <p class="eyebrow">Платформа репетитора</p>
              <h1 class="landing-title">Intellika</h1>
            </div>
          </div>
          <p class="landing-kicker">Личный кабинет репетитора, отдельные кабинеты учеников и весь учебный процесс в одном месте.</p>
          <p class="hero-copy">
            Управляй учениками, расписанием, домашними заданиями, фото к ДЗ и VK-видео, а ученикам показывай только то, что им действительно нужно: задания, календарь и ближайшие занятия.
          </p>
          <div class="landing-actions">
            <button class="primary-btn" id="landingRegisterBtn">Зарегистрироваться</button>
            <button class="ghost-btn" id="landingLoginBtn">Войти</button>
          </div>
          <div class="landing-statline">
            <span class="badge">Кабинет репетитора</span>
            <span class="badge">Кабинет ученика</span>
            <span class="badge">VK-видео</span>
            <span class="badge">ДЗ с фото</span>
          </div>
        </div>

        <div class="landing-preview">
          <article class="landing-browser">
            <div class="landing-browser-bar">
              <span></span><span></span><span></span>
            </div>
            <div class="landing-browser-grid">
              <div class="landing-sidebar-preview">
                <div class="landing-sidebar-mark">IN</div>
                <div class="landing-sidebar-pill is-active"></div>
                <div class="landing-sidebar-pill"></div>
                <div class="landing-sidebar-pill"></div>
                <div class="landing-sidebar-pill"></div>
              </div>
              <div class="landing-screen-preview">
                <div class="landing-screen-hero">
                  <div>
                    <p class="eyebrow">Intellika</p>
                    <h3>Разделенный доступ для репетитора и ученика</h3>
                  </div>
                  <div class="landing-screen-tag">Live</div>
                </div>
                <div class="landing-screen-cards">
                  <article class="landing-mini-card">
                    <strong>Ученики</strong>
                    <span>CRM, кабинеты и статусы</span>
                  </article>
                  <article class="landing-mini-card">
                    <strong>Домашка</strong>
                    <span>Фото, комментарии и прогресс</span>
                  </article>
                  <article class="landing-mini-card">
                    <strong>Календарь</strong>
                    <span>Ближайшие занятия и обзор недели</span>
                  </article>
                  <article class="landing-mini-card">
                    <strong>VK-видео</strong>
                    <span>Общие и персональные материалы</span>
                  </article>
                </div>
              </div>
            </div>
          </article>
        </div>
      </div>

      <section class="landing-band">
        <article class="landing-feature">
          <p class="eyebrow">Для репетитора</p>
          <h3>Вся база и контроль доступа</h3>
          <p>Добавляй учеников, выдавай им отдельный вход, назначай уроки, домашние задания и видео.</p>
        </article>
        <article class="landing-feature">
          <p class="eyebrow">Для ученика</p>
          <h3>Только нужные разделы</h3>
          <p>Ученик видит только свои задания, календарь, ближайшие занятия и материалы от репетитора.</p>
        </article>
        <article class="landing-feature">
          <p class="eyebrow">Для учебного процесса</p>
          <h3>Фото к ДЗ и видео из VK</h3>
          <p>Загружай фотографии домашних заданий и встраивай VK-видео прямо в платформу без лишних ссылок.</p>
        </article>
      </section>
    </section>
  `;

  authMount.classList.remove("hidden");
  appShell.classList.add("hidden");

  document.getElementById("landingRegisterBtn")?.addEventListener("click", () => openPublicAuth("register"));
  document.getElementById("landingLoginBtn")?.addEventListener("click", () => openPublicAuth("login"));
}

function renderAuthScreen() {
  authMount.innerHTML = `
    <section class="auth-card">
      <div class="auth-intro">
        <div class="brand-mark">IN</div>
        <p class="eyebrow">Платформа репетитора</p>
        <h2 class="hero-title">Один вход для репетитора, отдельные кабинеты для учеников и общая учебная база.</h2>
        <p class="hero-copy">
          ${backend.mode === "firebase"
            ? "Репетитор входит в рабочую панель, создает личные кабинеты ученикам и раздает доступ без отдельного сервера."
            : "Сейчас включен демо-режим. Зарегистрируй репетитора, затем в карточке ученика создай email и пароль для его личного кабинета."}
        </p>
        <div class="auth-note">
          <strong>${backend.mode === "firebase" ? "Как это работает" : "Демо-режим"}</strong>
          <p>${backend.mode === "firebase"
            ? "У каждого репетитора свои ученики, уроки, ДЗ и видео. Ученик после входа видит только свои занятия, домашние задания, календарь и VK-видео."
            : "Все сохраняется локально в браузере. Личные кабинеты учеников создаются прямо из карточки ученика, чтобы можно было протестировать ветвление ролей."}</p>
        </div>
      </div>

      <div class="auth-panel">
        <div class="inline-actions">
          <button class="ghost-btn" type="button" id="backToLandingBtn">На лендинг</button>
        </div>
        <div class="pill-tabs">
          <button class="tag-btn ${state.authMode === "login" ? "is-selected" : ""}" data-auth-mode="login">Вход</button>
          <button class="tag-btn ${state.authMode === "register" ? "is-selected" : ""}" data-auth-mode="register">Регистрация репетитора</button>
        </div>

        <form id="authForm" class="modal-form auth-form">
          ${state.authMode === "register" ? `
            <label>
              <span>Имя репетитора</span>
              <input name="displayName" required />
            </label>
          ` : ""}
          <label>
            <span>Email</span>
            <input name="email" type="email" required />
          </label>
          <label>
            <span>Пароль</span>
            <input name="password" type="password" minlength="6" required />
          </label>
          ${state.authMode === "register" ? `
            <label>
              <span>Повторите пароль</span>
              <input name="passwordRepeat" type="password" minlength="6" required />
            </label>
          ` : `
            <div class="auth-note auth-note--compact">
              <strong>Ученики входят через эту же форму</strong>
              <p>Репетитор создает ученику email и пароль в своем кабинете, а ученик затем входит здесь через кнопку «Вход».</p>
            </div>
          `}
          ${state.notice ? `<div class="auth-alert">${escapeHtml(state.notice)}</div>` : ""}
          <button type="submit" class="primary-btn auth-submit">
            ${state.authMode === "login" ? "Войти в кабинет" : "Создать кабинет репетитора"}
          </button>
        </form>
      </div>
    </section>
  `;

  authMount.classList.remove("hidden");
  appShell.classList.add("hidden");

  authMount.querySelectorAll("[data-auth-mode]").forEach((button) => {
    button.addEventListener("click", () => {
      state.authMode = button.dataset.authMode;
      state.notice = "";
      render();
    });
  });

  document.getElementById("backToLandingBtn")?.addEventListener("click", () => {
    state.publicView = "landing";
    state.notice = "";
    render();
  });

  document.getElementById("authForm")?.addEventListener("submit", handleAuthSubmit);
}

function openPublicAuth(mode) {
  state.publicView = "auth";
  state.authMode = mode;
  state.notice = "";
  render();
}

async function handleAuthSubmit(event) {
  event.preventDefault();
  const formData = new FormData(event.currentTarget);
  const email = String(formData.get("email")).trim();
  const password = String(formData.get("password"));
  const displayName = String(formData.get("displayName") || "").trim();
  const passwordRepeat = String(formData.get("passwordRepeat") || "");

  if (state.authMode === "register" && password !== passwordRepeat) {
    state.notice = "Пароли не совпадают.";
    render();
    return;
  }

  try {
    state.notice = "";
    if (state.authMode === "login") {
      await backend.signIn(email, password);
    } else {
      await backend.signUp({ email, password, displayName });
    }
  } catch (error) {
    state.notice = getErrorMessage(error);
    render();
  }
}

async function handleSignOut() {
  try {
    await backend.signOut();
  } catch (error) {
    showToast(getErrorMessage(error), "error");
  }
}

async function resetDataset() {
  if (!state.user || !isTutor()) return;
  const confirmMessage = backend.mode === "firebase"
    ? "Загрузить в облачную базу стартовый набор demo-данных? Уже выданные ученикам доступы останутся, но привязка к удаленным профилям может сброситься."
    : "Сбросить локальные demo-данные? Созданные кабинеты учеников останутся в списке пользователей, но их привязка к удаленным профилям может сброситься.";
  if (!window.confirm(confirmMessage)) return;

  try {
    await backend.resetDemoData(state.user, state.account);
    await reloadData();
    showToast("Демо-данные загружены", "success");
    render();
  } catch (error) {
    showToast(getErrorMessage(error), "error");
    render();
  }
}

function renderDashboardView() {
  return isStudent() ? renderStudentDashboardView() : renderTutorDashboardView();
}

function renderTutorDashboardView() {
  const data = deriveTutorData();
  const upcoming = data.upcomingLessons.slice(0, 4);
  const reviewQueue = data.reviewQueue.slice(0, 4);
  const videos = data.videos.slice(0, 2);

  return `
    ${renderNoticeBanner()}
    ${backend.mode === "demo" ? renderSetupBanner() : ""}
    ${renderAlertsPanel()}

    <section class="hero-card">
      <div>
        <p class="eyebrow">Рабочая панель</p>
        <h2 class="hero-title">Теперь платформа разделена на кабинет репетитора и личные кабинеты учеников.</h2>
        <p class="hero-copy">
          Репетитор управляет базой, оплатами, уроками, ДЗ и VK-видео, а ученик после входа видит только свои задания, расписание, календарь и видеоматериалы.
        </p>
        <div class="inline-actions">
          <button class="primary-btn" id="heroAddStudent">Новый ученик</button>
          <button class="ghost-btn" id="heroOpenHomework">Проверка ДЗ</button>
          <button class="ghost-btn" id="heroOpenPortals">Кабинеты</button>
          <button class="ghost-btn" id="heroOpenVideos">VK-видео</button>
          <button class="ghost-btn" id="heroExportCsv">Экспорт CSV</button>
        </div>
      </div>
      <div class="hero-stats">
        <div class="hero-stat">
          <span class="eyebrow">Выручка</span>
          <strong>${formatMoney(data.totalRevenue)}</strong>
        </div>
        <div class="hero-stat">
          <span class="eyebrow">Личные кабинеты</span>
          <strong>${data.activePortals}</strong>
        </div>
        <div class="hero-stat">
          <span class="eyebrow">VK-видео</span>
          <strong>${data.videos.length}</strong>
        </div>
      </div>
    </section>

    <section class="metrics-grid">
      ${metricCard("Ученики", data.students.length, `${data.activeStudents} активных`)}
      ${metricCard("Домашки", data.homeworks.length, `${data.reviewQueue.length} требуют внимания`)}
      ${metricCard("Остаток уроков", data.totalLessonsLeft, "По всем ученикам")}
      ${metricCard("На неделе", data.weekLessons, "Запланировано")}
    </section>

    ${renderRevenueChart()}

    <section class="profile-grid">
      <div class="panel">
        <div class="section-head">
          <div>
            <h3 class="section-title">Ближайшие занятия</h3>
            <p class="section-subtitle">То, что скоро начнется</p>
          </div>
        </div>
        <div class="list">
          ${upcoming.length
            ? upcoming.map(renderUpcomingLessonCard).join("")
            : '<div class="empty-state">Пока нет ближайших занятий.</div>'
          }
        </div>
      </div>

      <div class="panel">
        <div class="section-head">
          <div>
            <h3 class="section-title">Очередь на проверку</h3>
            <p class="section-subtitle">Новые и дорабатываемые домашние задания</p>
          </div>
        </div>
        <div class="list">
          ${reviewQueue.length
            ? reviewQueue.map(renderReviewCard).join("")
            : '<div class="empty-state">Сейчас очередь пуста.</div>'
          }
        </div>
      </div>
    </section>

    <section class="panel">
      <div class="section-head">
        <div>
          <h3 class="section-title">Последние видео</h3>
          <p class="section-subtitle">Материалы VK для всех или для конкретного ученика</p>
        </div>
      </div>
      <div class="video-grid video-grid--compact">
        ${videos.length
          ? videos.map((video) => renderVideoCard(video, true)).join("")
          : '<div class="empty-state">Пока видео не добавлены.</div>'
        }
      </div>
    </section>
  `;
}

function renderStudentDashboardView() {
  const student = currentStudent();
  const stats = getStudentStats(student.id);
  const lessons = visibleLessons().slice(0, 4);
  const homeworks = visibleHomeworks().slice(0, 4);
  const videos = visibleVideos().slice(0, 2);

  return `
    ${renderNoticeBanner()}
    <section class="portal-hero">
      <div class="section-head">
        <div>
          <p class="eyebrow">Личный кабинет ученика</p>
          <h2 class="hero-title">${escapeHtml(student.name)}</h2>
          <p class="hero-copy">Здесь собраны твои домашние задания, календарь занятий, ближайшие уроки и видео, которые прислал репетитор.</p>
        </div>
        <div class="inline-actions">
          <span class="portal-token">${escapeHtml(student.portalCode)}</span>
        </div>
      </div>
    </section>

    <section class="metrics-grid">
      ${metricCard("Следующий урок", stats.nextLesson || "Пока нет", "Ближайшее занятие")}
      ${metricCard("Открытые ДЗ", stats.homeworkOpen, "Нужно сделать или доработать")}
      ${metricCard("VK-видео", stats.videoCount, "Материалы от репетитора")}
      ${metricCard("Прогресс", `${stats.averageProgress}%`, "Средний прогресс по ДЗ")}
    </section>

    <section class="portal-layout">
      <div class="stack">
        <article class="panel">
          <h3 class="section-title">О курсе</h3>
          <div class="info-list">
            <div class="info-line"><span>Предмет</span><strong>${escapeHtml(student.subject)}</strong></div>
            <div class="info-line"><span>Цель</span><strong>${escapeHtml(student.goal || "Уточняется")}</strong></div>
            <div class="info-line"><span>Расписание</span><strong>${escapeHtml(stats.nextLesson || "Репетитор еще не поставил урок")}</strong></div>
          </div>
        </article>

        <article class="panel">
          <h3 class="section-title">Комментарий репетитора</h3>
          <p class="muted-copy">${escapeHtml(student.notes || "Здесь появятся ориентиры по учебе и заметки от преподавателя.")}</p>
        </article>
      </div>

      <div class="stack">
        <article class="panel">
          <div class="section-head">
            <div>
              <h3 class="section-title">Ближайшие занятия</h3>
              <p class="section-subtitle">Что уже запланировано</p>
            </div>
            <div class="inline-actions">
              <button class="ghost-btn" id="studentOpenCalendar">Календарь</button>
            </div>
          </div>
          <div class="list">
            ${lessons.length
              ? lessons.map(renderCabinetLesson).join("")
              : '<div class="empty-state">Пока нет записанных уроков.</div>'
            }
          </div>
        </article>

        <article class="panel">
          <div class="section-head">
            <div>
              <h3 class="section-title">Домашние задания</h3>
              <p class="section-subtitle">Все, что выдал репетитор</p>
            </div>
            <div class="inline-actions">
              <button class="ghost-btn" id="studentOpenHomework">Открыть ДЗ</button>
            </div>
          </div>
          <div class="list">
            ${homeworks.length
              ? homeworks.map(renderStudentHomeworkCard).join("")
              : '<div class="empty-state">Сейчас домашних заданий нет.</div>'
            }
          </div>
        </article>
      </div>
    </section>

    <section class="panel">
      <div class="section-head">
        <div>
          <h3 class="section-title">Видео от репетитора</h3>
          <p class="section-subtitle">VK-материалы, которые можно открыть прямо на платформе</p>
        </div>
        <div class="inline-actions">
          <button class="ghost-btn" id="studentOpenVideos">Открыть все</button>
        </div>
      </div>
      <div class="video-grid video-grid--compact">
        ${videos.length
          ? videos.map((video) => renderVideoCard(video, false)).join("")
          : '<div class="empty-state">Пока видео не добавлены.</div>'
        }
      </div>
    </section>
  `;
}

function renderStudentsView() {
  const students = filteredStudents();

  return `
    ${renderNoticeBanner()}
    <section class="panel">
      <div class="students-toolbar">
        <div>
          <p class="eyebrow">База учеников</p>
          <h2 class="section-title">Ученики</h2>
          <p class="section-subtitle">Репетитор управляет профилями и выдает доступ в личный кабинет</p>
        </div>
        <div class="pill-tabs">
          <button class="ghost-btn" id="exportStudentsBtn">Экспорт CSV</button>
          <button class="ghost-btn" id="openDashboardBtn">На дашборд</button>
          <button class="primary-btn" id="studentsAddBtn">Добавить ученика</button>
        </div>
      </div>
      <div class="students-grid">
        ${students.length
          ? students.map((student) => {
              const homeworkCount = state.data.homeworks.filter((item) => item.studentId === student.id).length;
              const isPending = state.pendingDeleteId === student.id;
              const accessLabel = student.accountUid ? "Есть кабинет" : "Нет доступа";
              return `
                <article class="student-card">
                  <div class="student-card-header">
                    <div class="student-avatar">${getInitials(student.name)}</div>
                    <div class="inline-actions">
                      <button class="icon-btn" data-edit-student="${student.id}" title="Редактировать">✎</button>
                      <button class="icon-btn" data-open-profile="${student.id}" title="Профиль">→</button>
                    </div>
                  </div>
                  <div>
                    <h3 class="student-name">${escapeHtml(student.name)}</h3>
                    <p class="student-subject">${escapeHtml(student.subject)}</p>
                  </div>
                  <div class="stat-row">
                    <span class="badge ${student.lessonsLeft <= 1 ? "is-danger" : "is-success"}">${student.lessonsLeft} уроков</span>
                    <span class="badge ${student.balance < student.rate ? "is-warning" : ""}">${formatMoney(student.balance)}</span>
                    <span class="badge">${homeworkCount} ДЗ</span>
                    <span class="badge ${student.accountUid ? "is-success" : ""}">${accessLabel}</span>
                  </div>
                  <div class="info-list">
                    <div class="info-line"><span>Ставка</span><strong>${formatMoney(student.rate)}</strong></div>
                    <div class="info-line"><span>Email входа</span><strong>${escapeHtml(student.email || "Пока не создан")}</strong></div>
                    <div class="info-line"><span>Телефон</span><strong>${escapeHtml(student.phone || "Не указан")}</strong></div>
                  </div>
                  <div class="student-actions">
                    <button class="ghost-btn" data-open-payment="${student.id}">Оплата</button>
                    <button class="ghost-btn" data-open-lesson="${student.id}">Урок</button>
                    <button class="ghost-btn" data-open-homework="${student.id}">ДЗ</button>
                    <button class="ghost-btn" data-open-cabinet="${student.id}">Кабинет</button>
                    <button class="ghost-btn" data-open-access="${student.id}">${student.accountUid ? "Доступ" : "Создать доступ"}</button>
                    ${isPending
                      ? `<button class="ghost-btn is-danger-btn" data-confirm-delete="${student.id}">Точно удалить?</button>
                         <button class="ghost-btn" data-cancel-delete>Отмена</button>`
                      : `<button class="ghost-btn" data-delete-student="${student.id}">Удалить</button>`
                    }
                  </div>
                </article>
              `;
            }).join("")
          : '<div class="empty-state">По этому запросу ничего не найдено.</div>'
        }
      </div>
    </section>
  `;
}

function renderHomeworkView() {
  return isStudent() ? renderStudentHomeworkView() : renderTutorHomeworkView();
}

function renderTutorHomeworkView() {
  const today = todayISO();
  const items = filteredHomeworks().filter((item) =>
    state.homeworkFilter === "submitted-only"
      ? ["submitted", "rework"].includes(item.status)
      : true
  );

  const columns = [
    { key: "assigned", title: "Назначено" },
    { key: "submitted", title: "На проверке" },
    { key: "rework", title: "На доработке" },
    { key: "reviewed", title: "Проверено" }
  ];

  return `
    ${renderNoticeBanner()}
    <section class="panel">
      <div class="students-toolbar">
        <div>
          <p class="eyebrow">Домашние задания</p>
          <h2 class="section-title">Проверка ДЗ</h2>
          <p class="section-subtitle">Репетитор выдает задания, прикладывает фото и отслеживает статус проверки</p>
        </div>
        <div class="pill-tabs">
          <button class="tag-btn" id="homeworkOnlySubmitted">${
            state.homeworkFilter === "submitted-only" ? "Показать все" : "Только активные"
          }</button>
          <button class="primary-btn" id="homeworkAddBtn">Выдать ДЗ</button>
        </div>
      </div>
      <div class="board-grid board-grid--wide">
        ${columns.map((column) => {
          const list = items.filter((item) => item.status === column.key);
          return `
            <section class="board-column">
              <div class="board-column-head">
                <h3 class="section-title">${column.title}</h3>
                <span class="board-count">${list.length}</span>
              </div>
              ${list.length
                ? list.map((item) => {
                    const student = findStudent(item.studentId);
                    const isOverdue = item.dueDate && item.dueDate < today && item.status !== "reviewed";
                    return `
                      <article class="homework-card${isOverdue ? " is-overdue" : ""}">
                        <div>
                          <h4>${escapeHtml(item.title)}${isOverdue ? ' <span class="overdue-tag">просрочено</span>' : ""}</h4>
                          <div class="homework-meta">${escapeHtml(student?.name || "Ученик")} • ${escapeHtml(student?.subject || "")}</div>
                        </div>
                        <div class="muted-copy">${escapeHtml(item.description || "Без описания")}</div>
                        ${renderHomeworkAttachments(item.attachments)}
                        <div class="progress-track">
                          <div class="progress-fill" style="width: ${clampProgress(item.progress)}%"></div>
                        </div>
                        <div class="timeline-meta">Срок: ${formatDate(item.dueDate)}</div>
                        <div class="timeline-meta">${escapeHtml(item.teacherNote || "Комментария преподавателя пока нет")}</div>
                        <div class="student-actions hw-quick-actions">
                          <button class="tag-btn${item.status === "assigned" ? " is-selected" : ""}" data-homework-status="${item.id}:assigned">📝</button>
                          <button class="tag-btn${item.status === "submitted" ? " is-selected" : ""}" data-homework-status="${item.id}:submitted">📥</button>
                          <button class="tag-btn${item.status === "rework" ? " is-selected" : ""}" data-homework-status="${item.id}:rework">🔄</button>
                          <button class="tag-btn${item.status === "reviewed" ? " is-selected" : ""}" data-homework-status="${item.id}:reviewed">✅</button>
                          <button class="tag-btn" data-edit-homework="${item.id}">Изменить</button>
                        </div>
                      </article>
                    `;
                  }).join("")
                : '<div class="empty-state">Пока пусто.</div>'
              }
            </section>
          `;
        }).join("")}
      </div>
    </section>
  `;
}

function renderStudentHomeworkView() {
  const items = filteredHomeworks();

  return `
    ${renderNoticeBanner()}
    <section class="panel">
      <div class="students-toolbar">
        <div>
          <p class="eyebrow">Мои домашние задания</p>
          <h2 class="section-title">Домашка</h2>
          <p class="section-subtitle">Только задания от репетитора, без доступа к управлению платформой</p>
        </div>
      </div>
      <div class="list">
        ${items.length
          ? items.map(renderStudentHomeworkCard).join("")
          : '<div class="empty-state">Репетитор пока не выдал домашние задания.</div>'
        }
      </div>
    </section>
  `;
}

function renderVideosView() {
  const videos = filteredVideos();
  const isTutorMode = isTutor();

  return `
    ${renderNoticeBanner()}
    <section class="panel">
      <div class="students-toolbar">
        <div>
          <p class="eyebrow">${isTutorMode ? "VK-видеотека" : "Видео от репетитора"}</p>
          <h2 class="section-title">${isTutorMode ? "VK-видео" : "Видеоуроки"}</h2>
          <p class="section-subtitle">${isTutorMode
            ? "Добавляй embed-ссылки из VK и назначай их всем ученикам или конкретному ученику."
            : "Здесь видны только видео, которые репетитор выдал тебе или всей группе."}</p>
        </div>
        ${isTutorMode ? `
          <div class="pill-tabs">
            <button class="primary-btn" id="videoAddBtn">Добавить видео</button>
          </div>
        ` : ""}
      </div>
      <div class="video-grid">
        ${videos.length
          ? videos.map((video) => renderVideoCard(video, isTutorMode)).join("")
          : `<div class="empty-state">${isTutorMode ? "Видео пока не добавлены." : "Репетитор пока не добавил видеоматериалы."}</div>`
        }
      </div>
    </section>
  `;
}

function renderPortalsView() {
  const students = filteredStudents();

  return `
    ${renderNoticeBanner()}
    <section class="panel">
      <div class="students-toolbar">
        <div>
          <p class="eyebrow">Личные кабинеты</p>
          <h2 class="section-title">Кабинеты учеников</h2>
          <p class="section-subtitle">Ученик после входа видит только свое расписание, ДЗ и видеоматериалы</p>
        </div>
      </div>
      <div class="portal-grid">
        ${students.length
          ? students.map((student) => {
              const stats = getStudentStats(student.id);
              return `
                <article class="portal-card">
                  <div class="student-card-header">
                    <div class="student-avatar">${getInitials(student.name)}</div>
                    <span class="portal-token">${escapeHtml(student.portalCode)}</span>
                  </div>
                  <div>
                    <h3>${escapeHtml(student.name)}</h3>
                    <div class="homework-meta">${escapeHtml(student.subject)}</div>
                  </div>
                  <div class="info-list">
                    <div class="info-line"><span>Личный вход</span><strong>${escapeHtml(student.email || "Пока не создан")}</strong></div>
                    <div class="info-line"><span>Домашки</span><strong>${stats.homeworkOpen}</strong></div>
                    <div class="info-line"><span>Ближайший урок</span><strong>${escapeHtml(stats.nextLesson || "Нет")}</strong></div>
                    <div class="info-line"><span>VK-видео</span><strong>${stats.videoCount}</strong></div>
                  </div>
                  <div class="student-actions">
                    <button class="primary-btn" data-open-cabinet="${student.id}">Открыть кабинет</button>
                    <button class="ghost-btn" data-open-profile="${student.id}">Профиль</button>
                    <button class="ghost-btn" data-open-access="${student.id}">${student.accountUid ? "Доступ настроен" : "Создать доступ"}</button>
                  </div>
                </article>
              `;
            }).join("")
          : '<div class="empty-state">Пока нет учеников.</div>'
        }
      </div>
    </section>
  `;
}

function renderProfileView() {
  const student = selectedStudent();
  if (!student) {
    state.currentView = "students";
    return renderStudentsView();
  }

  const transactions = state.data.transactions.filter((item) => item.studentId === student.id).sort(sortByDateDesc);
  const lessons = state.data.lessons.filter((item) => item.studentId === student.id).sort(sortByDateTime);
  const homeworks = state.data.homeworks.filter((item) => item.studentId === student.id).sort(sortByDateDesc);
  const videos = state.data.videos.filter((item) => item.audience === "all" || item.studentId === student.id).sort(sortByCreatedDesc);

  const tabs = [
    { key: "lessons", label: `Уроки (${lessons.length})` },
    { key: "homework", label: `ДЗ (${homeworks.length})` },
    { key: "payments", label: `Оплаты (${transactions.length})` }
  ];

  let tabContent = "";
  if (state.profileTab === "payments") {
    tabContent = `
      <div class="list">
        ${transactions.length
          ? transactions.map((item) => `
              <article class="timeline-item">
                <div>
                  <strong>${formatMoney(item.amount)}</strong>
                  <div class="timeline-meta">${escapeHtml(item.comment || "Без комментария")}</div>
                </div>
                <div class="timeline-meta">${formatDate(item.date)}</div>
              </article>
            `).join("")
          : '<div class="empty-state">Оплат пока нет.</div>'
        }
      </div>
    `;
  } else if (state.profileTab === "homework") {
    tabContent = `
      <div class="list">
        ${homeworks.length
          ? homeworks.map(renderMiniHomework).join("")
          : '<div class="empty-state">Домашних заданий пока нет.</div>'
        }
      </div>
    `;
  } else {
    tabContent = `
      <div class="list">
        ${lessons.length
          ? lessons.map(renderMiniLesson).join("")
          : '<div class="empty-state">Занятий пока нет.</div>'
        }
      </div>
    `;
  }

  return `
    ${renderNoticeBanner()}
    <section class="section-head">
      <div>
        <p class="eyebrow">Профиль ученика</p>
        <h2 class="section-title">${escapeHtml(student.name)}</h2>
      </div>
      <div class="inline-actions">
        <button class="ghost-btn" id="backToStudentsBtn">К списку</button>
        <button class="ghost-btn" id="profileOpenCabinetBtn">Кабинет ученика</button>
        <button class="primary-btn" id="profileAddPaymentBtn">Добавить оплату</button>
      </div>
    </section>

    <section class="profile-grid">
      <div class="profile-summary">
        <article class="panel student-hero">
          <div class="student-avatar">${getInitials(student.name)}</div>
          <h3 class="student-name">${escapeHtml(student.name)}</h3>
          <p class="student-subject">${escapeHtml(student.subject)}</p>
          <div class="stat-row">
            <span class="badge ${student.lessonsLeft <= 1 ? "is-danger" : "is-success"}">${student.lessonsLeft} уроков осталось</span>
            <span class="badge">${formatMoney(student.balance)}</span>
            <span class="badge">${homeworks.length} ДЗ</span>
            <span class="badge">${videos.length} видео</span>
          </div>
          <div class="student-actions">
            <button class="ghost-btn" id="profileAddLessonBtn">Запланировать урок</button>
            <button class="ghost-btn" id="profileAddHomeworkBtn">Выдать ДЗ</button>
            <button class="ghost-btn" id="profileAddVideoBtn">Добавить видео</button>
            <button class="ghost-btn" id="profileEditStudentBtn">Редактировать</button>
          </div>
        </article>

        <article class="panel">
          <h3 class="section-title">Детали</h3>
          <div class="info-list">
            <div class="info-line"><span>Телефон</span><strong>${escapeHtml(student.phone || "Не указан")}</strong></div>
            <div class="info-line"><span>Ставка</span><strong>${formatMoney(student.rate)}</strong></div>
            <div class="info-line"><span>Цель</span><strong>${escapeHtml(student.goal || "Без цели")}</strong></div>
            <div class="info-line"><span>Код кабинета</span><strong>${escapeHtml(student.portalCode)}</strong></div>
            <div class="info-line"><span>Email входа</span><strong>${escapeHtml(student.email || "Пока не создан")}</strong></div>
          </div>
          <div class="student-account-box">
            <p class="eyebrow">Личный кабинет</p>
            <p class="muted-copy">${escapeHtml(student.accountUid
              ? "Доступ уже создан. Ученик видит только свои уроки, календарь, домашку и видео."
              : "Пока нет отдельного входа. Нажми «Редактировать» и заполни email и пароль для ученика.")}</p>
          </div>
          <div>
            <p class="eyebrow">Заметки</p>
            <p>${escapeHtml(student.notes || "Пока без заметок.")}</p>
          </div>
        </article>
      </div>

      <div class="profile-summary">
        <article class="panel">
          <div class="pill-tabs profile-tabs">
            ${tabs.map((tab) => `
              <button class="tag-btn ${state.profileTab === tab.key ? "is-selected" : ""}" data-profile-tab="${tab.key}">${tab.label}</button>
            `).join("")}
          </div>
          ${tabContent}
        </article>

        <article class="panel">
          <div class="section-head">
            <div>
              <h3 class="section-title">Видео ученика</h3>
              <p class="section-subtitle">Общие материалы и персональные видео</p>
            </div>
          </div>
          <div class="video-grid video-grid--compact">
            ${videos.length
              ? videos.slice(0, 2).map((video) => renderVideoCard(video, true)).join("")
              : '<div class="empty-state">Видео пока не добавлены.</div>'
            }
          </div>
        </article>
      </div>
    </section>
  `;
}

function renderCabinetView() {
  const student = selectedStudent();
  if (!student) {
    state.currentView = "portals";
    return renderPortalsView();
  }

  const stats = getStudentStats(student.id);
  const homeworks = state.data.homeworks.filter((item) => item.studentId === student.id).sort(sortByDateDesc);
  const lessons = state.data.lessons.filter((item) => item.studentId === student.id).sort(sortByDateTime).slice(0, 5);
  const videos = state.data.videos
    .filter((item) => item.audience === "all" || item.studentId === student.id)
    .sort(sortByCreatedDesc)
    .slice(0, 3);

  return `
    ${renderNoticeBanner()}
    <section class="portal-hero">
      <div class="section-head">
        <div>
          <p class="eyebrow">Превью кабинета ученика</p>
          <h2 class="hero-title">${escapeHtml(student.name)}</h2>
          <p class="hero-copy">Так этот ученик увидит свой кабинет после входа: только занятия, домашние задания, фотографии к ним и видео.</p>
        </div>
        <div class="inline-actions">
          <button class="ghost-btn" id="cabinetBackBtn">К кабинетам</button>
          <span class="portal-token">${escapeHtml(student.portalCode)}</span>
        </div>
      </div>
    </section>

    <section class="metrics-grid">
      ${metricCard("Следующий урок", stats.nextLesson || "Нет", "Ближайшая запись")}
      ${metricCard("Открытые ДЗ", stats.homeworkOpen, "Еще не завершены")}
      ${metricCard("VK-видео", stats.videoCount, "Общие и персональные")}
      ${metricCard("Прогресс", `${stats.averageProgress}%`, "Средний прогресс")}
    </section>

    <section class="portal-layout">
      <div class="stack">
        <article class="panel">
          <h3 class="section-title">О курсе</h3>
          <div class="info-list">
            <div class="info-line"><span>Предмет</span><strong>${escapeHtml(student.subject)}</strong></div>
            <div class="info-line"><span>Цель</span><strong>${escapeHtml(student.goal || "Уточняется")}</strong></div>
            <div class="info-line"><span>Контакт</span><strong>${escapeHtml(student.phone || "Через репетитора")}</strong></div>
          </div>
        </article>

        <article class="panel">
          <h3 class="section-title">Комментарий репетитора</h3>
          <p class="muted-copy">${escapeHtml(student.notes || "Здесь могут появляться заметки и ориентиры по учебе.")}</p>
        </article>
      </div>

      <div class="stack">
        <article class="panel">
          <div class="section-head">
            <div>
              <h3 class="section-title">Ближайшие занятия</h3>
              <p class="section-subtitle">К чему готовиться сейчас</p>
            </div>
          </div>
          <div class="list">
            ${lessons.length
              ? lessons.map(renderCabinetLesson).join("")
              : '<div class="empty-state">Пока нет записанных уроков.</div>'
            }
          </div>
        </article>

        <article class="panel">
          <div class="section-head">
            <div>
              <h3 class="section-title">Домашние задания</h3>
              <p class="section-subtitle">Все выданные работы</p>
            </div>
          </div>
          <div class="list">
            ${homeworks.length
              ? homeworks.map(renderStudentHomeworkCard).join("")
              : '<div class="empty-state">Сейчас домашних заданий нет.</div>'
            }
          </div>
        </article>
      </div>
    </section>

    <section class="panel">
      <div class="section-head">
        <div>
          <h3 class="section-title">VK-видео</h3>
          <p class="section-subtitle">Общие материалы и персональные видео для ученика</p>
        </div>
      </div>
      <div class="video-grid video-grid--compact">
        ${videos.length
          ? videos.map((video) => renderVideoCard(video, true)).join("")
          : '<div class="empty-state">Видео пока не добавлены.</div>'
        }
      </div>
    </section>
  `;
}

function renderCalendarView() {
  const days = getWeekDays();
  const lessons = filteredLessons();
  const title = isStudent() ? "Мой календарь" : "Календарь";
  const subtitle = isStudent()
    ? "Здесь видны только твои запланированные занятия"
    : "Все занятия текущего аккаунта по неделе";

  const statusColor = { done: "#2e8b57", cancelled: "#c44536", planned: "#ef7d57" };

  return `
    ${renderNoticeBanner()}
    <section class="panel">
      <div class="section-head">
        <div>
          <p class="eyebrow">Недельный обзор</p>
          <h2 class="section-title">${title}</h2>
          <p class="section-subtitle">${subtitle}</p>
        </div>
        <div class="pill-tabs">
          <div class="cal-legend">
            <span class="cal-dot" style="background:#ef7d57"></span>Запланирован
            <span class="cal-dot" style="background:#2e8b57"></span>Проведен
            <span class="cal-dot" style="background:#c44536"></span>Отменен
          </div>
        </div>
      </div>
      <div class="calendar-grid">
        ${days.map((day) => {
          const dayLessons = lessons.filter((lesson) => lesson.date === day.iso);
          return `
            <article class="calendar-day ${day.isToday ? "is-today" : ""}">
              <div class="calendar-date">${day.label}</div>
              ${dayLessons.length
                ? dayLessons.map((lesson) => {
                    const student = findStudent(lesson.studentId);
                    const color = statusColor[lesson.status] || "#ef7d57";
                    const attrs = isTutor() ? `data-open-profile="${lesson.studentId}"` : "";
                    return `
                      <div class="calendar-chip" style="border-left: 3px solid ${color}; ${isTutor() ? "cursor:pointer" : ""}" ${attrs} title="${lessonStatusLabel(lesson.status)}">
                        <strong>${escapeHtml(lesson.time || "00:00")}</strong>
                        ${escapeHtml(student?.name || "Ученик")}
                        <div class="timeline-meta">${escapeHtml(lesson.topic || student?.subject || "")}</div>
                      </div>
                    `;
                  }).join("")
                : '<div class="timeline-meta">Свободно</div>'
              }
            </article>
          `;
        }).join("")}
      </div>
    </section>
  `;
}

function renderAlertsPanel() {
  const lowBalance = state.data.students.filter((student) => Number(student.lessonsLeft || 0) <= 1);
  const today = todayISO();
  const overdueHW = state.data.homeworks.filter(
    (homework) => homework.status !== "reviewed" && homework.dueDate && homework.dueDate < today
  );

  if (!lowBalance.length && !overdueHW.length) return "";

  const alerts = [];
  lowBalance.forEach((student) => {
    alerts.push(`⚠️ <strong>${escapeHtml(student.name)}</strong> — осталось ${student.lessonsLeft} урок(а), баланс скоро закончится.`);
  });
  overdueHW.forEach((homework) => {
    const student = findStudent(homework.studentId);
    alerts.push(`🕐 ДЗ «${escapeHtml(homework.title)}» (${escapeHtml(student?.name || "")}) просрочено с ${formatDate(homework.dueDate)}.`);
  });

  return `
    <section class="panel panel--danger alerts-panel">
      <div class="section-head">
        <div>
          <p class="eyebrow">Требует внимания</p>
          <h3 class="section-title">Предупреждения</h3>
        </div>
      </div>
      <div class="list">
        ${alerts.map((item) => `<div class="alert-line">${item}</div>`).join("")}
      </div>
    </section>
  `;
}

function bindDashboardView() {
  if (isStudent()) {
    document.getElementById("studentOpenHomework")?.addEventListener("click", () => {
      state.currentView = "homework";
      render();
    });
    document.getElementById("studentOpenCalendar")?.addEventListener("click", () => {
      state.currentView = "calendar";
      render();
    });
    document.getElementById("studentOpenVideos")?.addEventListener("click", () => {
      state.currentView = "videos";
      render();
    });
    return;
  }

  document.getElementById("heroAddStudent")?.addEventListener("click", () => openStudentModal());
  document.getElementById("heroOpenHomework")?.addEventListener("click", () => {
    state.currentView = "homework";
    render();
  });
  document.getElementById("heroOpenPortals")?.addEventListener("click", () => {
    state.currentView = "portals";
    render();
  });
  document.getElementById("heroOpenVideos")?.addEventListener("click", () => {
    state.currentView = "videos";
    render();
  });
  document.getElementById("heroExportCsv")?.addEventListener("click", () => exportStudentsCsv());
}

function bindStudentsView() {
  document.getElementById("studentsAddBtn")?.addEventListener("click", () => openStudentModal());
  document.getElementById("openDashboardBtn")?.addEventListener("click", () => {
    state.currentView = "dashboard";
    render();
  });
  document.getElementById("exportStudentsBtn")?.addEventListener("click", () => exportStudentsCsv());

  bindOpenProfileButtons();
  bindOpenCabinetButtons();
  bindOpenAccessButtons();

  appView.querySelectorAll("[data-edit-student]").forEach((button) => {
    button.addEventListener("click", () => openStudentModal(button.dataset.editStudent));
  });
  appView.querySelectorAll("[data-open-payment]").forEach((button) => {
    button.addEventListener("click", () => openPaymentModal(button.dataset.openPayment));
  });
  appView.querySelectorAll("[data-open-lesson]").forEach((button) => {
    button.addEventListener("click", () => openLessonModal(button.dataset.openLesson));
  });
  appView.querySelectorAll("[data-open-homework]").forEach((button) => {
    button.addEventListener("click", () => openHomeworkModal(null, button.dataset.openHomework));
  });
  appView.querySelectorAll("[data-delete-student]").forEach((button) => {
    button.addEventListener("click", () => {
      state.pendingDeleteId = button.dataset.deleteStudent;
      render();
    });
  });
  appView.querySelectorAll("[data-confirm-delete]").forEach((button) => {
    button.addEventListener("click", () => handleDeleteStudent(button.dataset.confirmDelete));
  });
  appView.querySelectorAll("[data-cancel-delete]").forEach((button) => {
    button.addEventListener("click", () => {
      state.pendingDeleteId = null;
      render();
    });
  });
}

function bindHomeworkView() {
  if (isStudent()) return;

  document.getElementById("homeworkAddBtn")?.addEventListener("click", () => openHomeworkModal());
  document.getElementById("homeworkOnlySubmitted")?.addEventListener("click", () => {
    state.homeworkFilter = state.homeworkFilter === "submitted-only" ? "all" : "submitted-only";
    render();
  });

  appView.querySelectorAll("[data-homework-status]").forEach((button) => {
    button.addEventListener("click", async () => {
      const [homeworkId, nextStatus] = button.dataset.homeworkStatus.split(":");
      try {
        await backend.updateHomeworkStatus(state.user, homeworkId, nextStatus);
        await reloadData();
        showToast(`Статус ДЗ изменен на «${homeworkStatusLabel(nextStatus)}»`, "success");
        render();
      } catch (error) {
        showToast(getErrorMessage(error), "error");
        render();
      }
    });
  });

  appView.querySelectorAll("[data-edit-homework]").forEach((button) => {
    button.addEventListener("click", () => openHomeworkModal(button.dataset.editHomework));
  });
}

function bindVideosView() {
  if (!isTutor()) return;

  document.getElementById("videoAddBtn")?.addEventListener("click", () => openVideoModal());
  appView.querySelectorAll("[data-edit-video]").forEach((button) => {
    button.addEventListener("click", () => openVideoModal(button.dataset.editVideo));
  });
}

function bindPortalsView() {
  bindOpenProfileButtons();
  bindOpenCabinetButtons();
  bindOpenAccessButtons();
}

function bindProfileView() {
  document.getElementById("backToStudentsBtn")?.addEventListener("click", () => {
    state.currentView = "students";
    render();
  });
  document.getElementById("profileOpenCabinetBtn")?.addEventListener("click", () => {
    state.currentView = "cabinet";
    render();
  });
  document.getElementById("profileAddPaymentBtn")?.addEventListener("click", () => openPaymentModal(state.selectedStudentId));
  document.getElementById("profileAddLessonBtn")?.addEventListener("click", () => openLessonModal(state.selectedStudentId));
  document.getElementById("profileAddHomeworkBtn")?.addEventListener("click", () => openHomeworkModal(null, state.selectedStudentId));
  document.getElementById("profileAddVideoBtn")?.addEventListener("click", () => openVideoModal(null, state.selectedStudentId));
  document.getElementById("profileEditStudentBtn")?.addEventListener("click", () => openStudentModal(state.selectedStudentId));

  appView.querySelectorAll("[data-profile-tab]").forEach((button) => {
    button.addEventListener("click", () => {
      state.profileTab = button.dataset.profileTab;
      render();
    });
  });
}

function bindCabinetView() {
  document.getElementById("cabinetBackBtn")?.addEventListener("click", () => {
    state.currentView = "portals";
    render();
  });
}

function bindCalendarView() {
  if (!isTutor()) return;
  appView.querySelectorAll("[data-open-profile]").forEach((button) => {
    button.addEventListener("click", () => {
      state.selectedStudentId = button.dataset.openProfile;
      state.currentView = "profile";
      render();
    });
  });
}

function bindOpenProfileButtons() {
  appView.querySelectorAll("[data-open-profile]").forEach((button) => {
    button.addEventListener("click", () => {
      state.selectedStudentId = button.dataset.openProfile;
      state.currentView = "profile";
      render();
    });
  });
}

function bindOpenCabinetButtons() {
  appView.querySelectorAll("[data-open-cabinet]").forEach((button) => {
    button.addEventListener("click", () => {
      state.selectedStudentId = button.dataset.openCabinet;
      state.currentView = "cabinet";
      render();
    });
  });
}

function bindOpenAccessButtons() {
  appView.querySelectorAll("[data-open-access]").forEach((button) => {
    button.addEventListener("click", () => openStudentModal(button.dataset.openAccess));
  });
}

function bindAccessRevokedView() {
  document.getElementById("accessRevokedLogout")?.addEventListener("click", handleSignOut);
}

function openStudentModal(studentId = null) {
  const template = document.getElementById("studentFormTemplate");
  modalRoot.innerHTML = template.innerHTML;
  const form = document.getElementById("studentForm");
  const student = studentId ? findStudent(studentId) : null;
  const note = document.getElementById("studentAccountNote");
  const submitButton = form.querySelector('[type="submit"]');

  document.getElementById("studentModalTitle").textContent = student ? "Редактировать ученика" : "Новый ученик";

  if (student) {
    form.name.value = student.name;
    form.subject.value = student.subject;
    form.rate.value = student.rate;
    form.phone.value = student.phone || "";
    form.goal.value = student.goal || "";
    form.notes.value = student.notes || "";
    form.email.value = student.email || "";
  }

  if (student?.accountUid) {
    form.email.disabled = true;
    form.portalPassword.disabled = true;
    form.portalPassword.placeholder = "Уже создан";
    note.textContent = "Для этого ученика уже создан отдельный вход. Он видит только свои ДЗ, календарь, занятия и видео.";
  }

  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    if (form.dataset.submitting === "true") return;

    const formData = new FormData(form);
    const loginEmail = String(formData.get("email") || "").trim();
    const portalPassword = String(formData.get("portalPassword") || "").trim();

    if (!student?.accountUid && ((loginEmail && !portalPassword) || (!loginEmail && portalPassword))) {
      showToast("Чтобы создать вход ученику, заполни и email, и пароль.", "error");
      return;
    }

    const payload = {
      id: student?.id,
      name: String(formData.get("name")).trim(),
      subject: String(formData.get("subject")).trim(),
      rate: Number(formData.get("rate") || 0),
      phone: String(formData.get("phone")).trim(),
      goal: String(formData.get("goal")).trim(),
      notes: String(formData.get("notes")).trim(),
      portalCode: student?.portalCode,
      balance: student?.balance || 0,
      lessonsLeft: student?.lessonsLeft || 0,
      email: student?.accountUid ? student.email || "" : loginEmail,
      accountUid: student?.accountUid || null,
      hasPortalAccess: Boolean(student?.accountUid),
      accountCreatedAt: student?.accountCreatedAt || null
    };

    try {
      form.dataset.submitting = "true";
      submitButton.disabled = true;
      submitButton.textContent = student ? "Сохраняем..." : "Создаем...";

      const savedId = await backend.saveStudent(state.user, payload);
      let successMessage = student ? "Ученик обновлен" : "Ученик добавлен";
      let createdAccountUid = student?.accountUid || null;

      if (!student?.accountUid && loginEmail && portalPassword) {
        createdAccountUid = await backend.createStudentAccount(state.user, savedId, {
          email: loginEmail,
          password: portalPassword,
          displayName: payload.name
        }, {
          id: savedId,
          name: payload.name,
          email: loginEmail,
          accountUid: student?.accountUid || null
        });
        successMessage = student ? "Профиль обновлен и вход ученику создан" : "Ученик добавлен и личный кабинет создан";
      }

      upsertStudentInState({
        ...payload,
        id: savedId,
        email: loginEmail || payload.email,
        accountUid: createdAccountUid,
        hasPortalAccess: Boolean(createdAccountUid),
        accountCreatedAt: createdAccountUid ? new Date().toISOString() : payload.accountCreatedAt
      });
      state.notice = "";

      closeModal(() => {
        showToast(successMessage, "success");
        if (!student && savedId) {
          state.selectedStudentId = savedId;
          state.currentView = "profile";
        }
        render();
      });

      void reloadData({
        allowFailure: true,
        silent: true,
        offlineMessage: "Профиль сохранен. Данные синхронизируются, когда соединение со Firestore стабилизируется."
      }).then(() => {
        render();
      });
    } catch (error) {
      showToast(getErrorMessage(error), "error");
      render();
    } finally {
      form.dataset.submitting = "false";
      submitButton.disabled = false;
      submitButton.textContent = "Сохранить";
    }
  });

  showModal();
}

function openPaymentModal(studentId) {
  const student = findStudent(studentId);
  if (!student) return;

  const template = document.getElementById("paymentTemplate");
  modalRoot.innerHTML = template.innerHTML;
  document.getElementById("paymentModalTitle").textContent = `Оплата: ${student.name}`;
  const form = document.getElementById("paymentForm");
  form.date.value = todayISO();

  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    const formData = new FormData(form);

    try {
      await backend.savePayment(state.user, {
        studentId,
        amount: Number(formData.get("amount") || 0),
        date: String(formData.get("date")),
        comment: String(formData.get("comment")).trim()
      });
      await reloadData();
      closeModal(() => {
        showToast("Оплата зачислена", "success");
        state.selectedStudentId = studentId;
        state.currentView = "profile";
        state.profileTab = "payments";
        render();
      });
    } catch (error) {
      showToast(getErrorMessage(error), "error");
      closeModal();
      render();
    }
  });

  showModal();
}

function openLessonModal(studentId) {
  const student = findStudent(studentId);
  if (!student) return;

  const template = document.getElementById("lessonTemplate");
  modalRoot.innerHTML = template.innerHTML;
  document.getElementById("lessonModalTitle").textContent = `Урок: ${student.name}`;
  const form = document.getElementById("lessonForm");
  form.date.value = todayISO();
  form.time.value = "16:00";
  form.duration.value = "60";

  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    const formData = new FormData(form);

    try {
      await backend.saveLesson(state.user, {
        studentId,
        date: String(formData.get("date")),
        time: String(formData.get("time")),
        duration: Number(formData.get("duration") || 0),
        status: String(formData.get("status")),
        topic: String(formData.get("topic")).trim()
      });
      await reloadData();
      closeModal(() => {
        showToast("Урок сохранен", "success");
        state.selectedStudentId = studentId;
        state.currentView = "profile";
        state.profileTab = "lessons";
        render();
      });
    } catch (error) {
      showToast(getErrorMessage(error), "error");
      closeModal();
      render();
    }
  });

  showModal();
}

function openHomeworkModal(homeworkId = null, defaultStudentId = state.selectedStudentId) {
  const template = document.getElementById("homeworkTemplate");
  modalRoot.innerHTML = template.innerHTML;

  const form = document.getElementById("homeworkForm");
  const preview = document.getElementById("homeworkAttachmentPreview");
  const homework = homeworkId ? findHomework(homeworkId) : null;
  let attachments = homework ? [...(homework.attachments || [])] : [];

  fillStudentSelect(form.studentId, homework?.studentId || defaultStudentId || state.data.students[0]?.id || null, true);

  document.getElementById("homeworkModalTitle").textContent = homework
    ? `Редактировать ДЗ: ${findStudent(homework.studentId)?.name || ""}`
    : "Новое ДЗ";

  if (homework) {
    form.studentId.value = homework.studentId;
    form.title.value = homework.title;
    form.dueDate.value = homework.dueDate;
    form.status.value = homework.status;
    form.progress.value = homework.progress;
    form.description.value = homework.description || "";
    form.teacherNote.value = homework.teacherNote || "";
  } else {
    form.dueDate.value = todayISO();
  }

  const renderAttachmentPreview = () => {
    preview.innerHTML = attachments.length
      ? attachments.map((item) => `
          <article class="attachment-card">
            <img src="${escapeHtml(item.dataUrl)}" alt="${escapeHtml(item.name || "Фото ДЗ")}" />
            <div class="attachment-card-footer">
              <span>${escapeHtml(item.name || "photo.jpg")}</span>
              <button type="button" class="icon-btn" data-remove-attachment="${item.id}">×</button>
            </div>
          </article>
        `).join("")
      : '<div class="attachment-empty">Фото пока не добавлены.</div>';

    preview.querySelectorAll("[data-remove-attachment]").forEach((button) => {
      button.addEventListener("click", () => {
        attachments = attachments.filter((item) => item.id !== button.dataset.removeAttachment);
        renderAttachmentPreview();
      });
    });
  };

  renderAttachmentPreview();

  form.photoFiles.addEventListener("change", async (event) => {
    const files = Array.from(event.target.files || []);
    if (!files.length) return;

    try {
      const prepared = await prepareHomeworkAttachments(files, attachments);
      attachments = [...attachments, ...prepared];
      renderAttachmentPreview();
    } catch (error) {
      showToast(getErrorMessage(error), "error");
    }

    form.photoFiles.value = "";
  });

  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    const formData = new FormData(form);
    const studentId = String(formData.get("studentId") || "").trim();
    if (!studentId) {
      showToast("Выбери ученика для домашнего задания.", "error");
      return;
    }

    try {
      await backend.saveHomework(state.user, {
        id: homework?.id,
        studentId,
        title: String(formData.get("title")).trim(),
        dueDate: String(formData.get("dueDate")),
        status: String(formData.get("status")),
        progress: Number(formData.get("progress") || 0),
        description: String(formData.get("description")).trim(),
        teacherNote: String(formData.get("teacherNote")).trim(),
        attachments
      });
      await reloadData();
      closeModal(() => {
        showToast(homework ? "ДЗ обновлено" : "ДЗ выдано", "success");
        state.selectedStudentId = studentId;
        state.currentView = homework ? state.currentView : "homework";
        if (state.currentView === "profile") {
          state.profileTab = "homework";
        }
        render();
      });
    } catch (error) {
      showToast(getErrorMessage(error), "error");
      closeModal();
      render();
    }
  });

  showModal();
}

function openVideoModal(videoId = null, defaultStudentId = state.selectedStudentId) {
  const template = document.getElementById("videoTemplate");
  modalRoot.innerHTML = template.innerHTML;
  const form = document.getElementById("videoForm");
  const video = videoId ? findVideo(videoId) : null;

  document.getElementById("videoModalTitle").textContent = video ? "Редактировать VK-видео" : "Добавить VK-видео";
  fillStudentSelect(form.studentId, video?.studentId || defaultStudentId || "", false);

  if (video) {
    form.title.value = video.title;
    form.sourceUrl.value = video.sourceUrl || video.embedUrl || "";
    form.description.value = video.description || "";
    form.studentId.value = video.studentId || "";
  }

  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    const formData = new FormData(form);
    const sourceUrl = String(formData.get("sourceUrl")).trim();
    const embedUrl = extractVkEmbedUrl(sourceUrl);

    if (!embedUrl) {
      showToast("Вставь embed-ссылку VK или src из iframe с `video_ext.php`.", "error");
      return;
    }

    try {
      await backend.saveVideo(state.user, {
        id: video?.id,
        title: String(formData.get("title")).trim(),
        description: String(formData.get("description")).trim(),
        sourceUrl,
        embedUrl,
        studentId: String(formData.get("studentId") || "").trim() || null
      });
      await reloadData();
      closeModal(() => {
        showToast(video ? "Видео обновлено" : "Видео добавлено", "success");
        state.currentView = "videos";
        render();
      });
    } catch (error) {
      showToast(getErrorMessage(error), "error");
      closeModal();
      render();
    }
  });

  showModal();
}

async function handleDeleteStudent(studentId) {
  const student = findStudent(studentId);
  if (!student) return;

  state.pendingDeleteId = null;
  try {
    await backend.deleteStudent(state.user, studentId);
    await reloadData();
    if (state.selectedStudentId === studentId) {
      state.selectedStudentId = null;
      state.currentView = "students";
    }
    showToast(`Ученик ${student.name} удален`, "success");
    render();
  } catch (error) {
    showToast(getErrorMessage(error), "error");
    render();
  }
}

function showModal() {
  modalBackdrop.classList.remove("hidden", "is-closing");
}

function closeModal(callback) {
  modalBackdrop.classList.add("is-closing");
  setTimeout(() => {
    modalBackdrop.classList.add("hidden");
    modalBackdrop.classList.remove("is-closing");
    modalRoot.innerHTML = "";
    if (callback) callback();
  }, 200);
}

function showToast(message, type = "info") {
  const toast = document.createElement("div");
  const bg = type === "success" ? "rgba(46,139,87,0.96)"
    : type === "error" ? "rgba(196,69,54,0.96)"
    : "rgba(40,24,15,0.92)";

  toast.style.cssText = `
    padding: 14px 18px;
    border-radius: 18px;
    background: ${bg};
    color: white;
    font-weight: 700;
    font-size: 0.9rem;
    box-shadow: 0 8px 24px rgba(0,0,0,0.18);
    animation: toastIn 0.22s ease;
    font-family: Manrope, sans-serif;
  `;
  toast.textContent = message;
  toastContainer.appendChild(toast);

  setTimeout(() => {
    toast.style.opacity = "0";
    toast.style.transition = "opacity 0.3s";
    setTimeout(() => toast.remove(), 320);
  }, 3200);
}

const toastStyle = document.createElement("style");
toastStyle.textContent = `
  @keyframes toastIn { from { opacity:0; transform:translateY(10px); } to { opacity:1; transform:translateY(0); } }
`;
document.head.appendChild(toastStyle);

function exportStudentsCsv() {
  const headers = ["Имя", "Предмет", "Ставка", "Баланс", "Уроков осталось", "Телефон", "Email входа", "Код кабинета"];
  const rows = state.data.students.map((student) => [
    student.name,
    student.subject,
    student.rate,
    student.balance,
    student.lessonsLeft,
    student.phone || "",
    student.email || "",
    student.portalCode
  ]);
  downloadCsv("students.csv", headers, rows);
  showToast("CSV скачан", "success");
}

function downloadCsv(filename, headers, rows) {
  const escape = (value) => `"${String(value ?? "").replace(/"/g, '""')}"`;
  const lines = [headers.map(escape).join(","), ...rows.map((row) => row.map(escape).join(","))];
  const blob = new Blob(["\uFEFF" + lines.join("\r\n")], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}

function renderSetupBanner() {
  return `
    <section class="panel panel--notice">
      <div>
        <p class="eyebrow">Firebase еще не включен полностью</p>
        <h3 class="section-title">Сейчас сайт работает в локальном demo-режиме.</h3>
        <p class="section-subtitle">
          Открой файл <code>firebase-config.js</code>, вставь web config из Firebase Console и включи
          <code>enabled: true</code>. После этого кабинеты репетитора и учеников будут храниться в облаке.
        </p>
      </div>
    </section>
  `;
}

function renderNoticeBanner() {
  if (!state.notice) return "";
  return `
    <section class="panel panel--danger">
      <strong>Сообщение системы</strong>
      <div class="section-subtitle">${escapeHtml(state.notice)}</div>
    </section>
  `;
}

function renderLoadingPanel(text) {
  return `
    <section class="panel panel--center">
      <p class="eyebrow">Подождите</p>
      <h2 class="section-title">${escapeHtml(text)}</h2>
    </section>
  `;
}

function renderAccessRevokedView() {
  return `
    <section class="panel panel--danger panel--center">
      <div>
        <p class="eyebrow">Доступ остановлен</p>
        <h2 class="section-title">Личный кабинет ученика больше не активен.</h2>
        <p class="section-subtitle">Репетитор удалил или отвязал профиль, поэтому данные этого кабинета больше недоступны.</p>
        <div class="inline-actions inline-actions--center">
          <button class="primary-btn" id="accessRevokedLogout">Выйти</button>
        </div>
      </div>
    </section>
  `;
}

function renderMissingStudentBinding() {
  return `
    <section class="panel panel--danger panel--center">
      <div>
        <p class="eyebrow">Профиль не найден</p>
        <h2 class="section-title">К этому входу пока не привязан активный ученик.</h2>
        <p class="section-subtitle">Скорее всего, репетитор удалил профиль или сбросил демо-данные. Войди позже или попроси выдать новый доступ.</p>
      </div>
    </section>
  `;
}

function renderUpcomingLessonCard(lesson) {
  const student = findStudent(lesson.studentId);
  return `
    <article class="timeline-item">
      <div>
        <strong>${escapeHtml(student?.name || "Без имени")}</strong>
        <div class="timeline-meta">${escapeHtml(lesson.topic || student?.subject || "Урок")}</div>
      </div>
      <div>
        <strong>${formatLessonDate(lesson.date, lesson.time)}</strong>
        <div class="timeline-meta">${lesson.duration} мин</div>
      </div>
    </article>
  `;
}

function renderReviewCard(homework) {
  const student = findStudent(homework.studentId);
  return `
    <article class="timeline-item">
      <div>
        <strong>${escapeHtml(homework.title)}</strong>
        <div class="timeline-meta">${escapeHtml(student?.name || "Ученик")} • ${escapeHtml(student?.subject || "")}</div>
      </div>
      <div>
        <strong>${homeworkStatusLabel(homework.status)}</strong>
        <div class="timeline-meta">до ${formatDate(homework.dueDate)}</div>
      </div>
    </article>
  `;
}

function renderMiniLesson(lesson) {
  return `
    <article class="timeline-item is-compact">
      <div>
        <strong>${formatLessonDate(lesson.date, lesson.time)}</strong>
        <div class="timeline-meta">${escapeHtml(lesson.topic || "Без темы")}</div>
      </div>
      <div>
        <span class="badge ${lesson.status === "cancelled" ? "is-danger" : lesson.status === "done" ? "is-success" : ""}">
          ${lessonStatusLabel(lesson.status)}
        </span>
      </div>
    </article>
  `;
}

function renderMiniHomework(homework) {
  return `
    <article class="timeline-item is-compact">
      <div>
        <strong>${escapeHtml(homework.title)}</strong>
        <div class="timeline-meta">до ${formatDate(homework.dueDate)}</div>
      </div>
      <div>
        <span class="badge ${homework.status === "reviewed" ? "is-success" : homework.status === "rework" ? "is-danger" : ""}">
          ${homeworkStatusLabel(homework.status)}
        </span>
      </div>
    </article>
  `;
}

function renderCabinetLesson(lesson) {
  return `
    <article class="timeline-item">
      <div>
        <strong>${formatLessonDate(lesson.date, lesson.time)}</strong>
        <div class="timeline-meta">${escapeHtml(lesson.topic || "Без темы")}</div>
      </div>
      <div class="timeline-meta">${lesson.duration} мин</div>
    </article>
  `;
}

function renderStudentHomeworkCard(homework) {
  return `
    <article class="homework-card">
      <div>
        <h4>${escapeHtml(homework.title)}</h4>
        <div class="homework-meta">${homeworkStatusLabel(homework.status)} • до ${formatDate(homework.dueDate)}</div>
      </div>
      <div class="muted-copy">${escapeHtml(homework.description || "Описание пока не добавлено.")}</div>
      ${renderHomeworkAttachments(homework.attachments)}
      <div class="progress-track">
        <div class="progress-fill" style="width: ${clampProgress(homework.progress)}%"></div>
      </div>
      <div class="muted-copy">${escapeHtml(homework.teacherNote || "Комментарий преподавателя появится после проверки.")}</div>
    </article>
  `;
}

function renderVideoCard(video, showAudience) {
  const student = video.studentId ? findStudent(video.studentId) : null;
  const audienceLabel = video.studentId
    ? student?.name || "Назначено ученику"
    : "Все ученики";

  return `
    <article class="video-card">
      <div class="video-frame-wrap">
        <iframe
          class="video-frame"
          src="${escapeHtml(video.embedUrl)}"
          title="${escapeHtml(video.title)}"
          loading="lazy"
          allow="autoplay; encrypted-media; fullscreen; picture-in-picture"
          allowfullscreen
        ></iframe>
      </div>
      <div class="video-card-body">
        <div>
          <h3>${escapeHtml(video.title)}</h3>
          <p class="muted-copy">${escapeHtml(video.description || "Описание пока не добавлено.")}</p>
        </div>
        <div class="stat-row">
          ${showAudience ? `<span class="badge">${escapeHtml(audienceLabel)}</span>` : ""}
          <span class="badge">${escapeHtml(formatRelativeCreated(video.createdAt))}</span>
        </div>
        ${showAudience ? `
          <div class="student-actions">
            <button class="ghost-btn" data-edit-video="${video.id}">Изменить</button>
          </div>
        ` : ""}
      </div>
    </article>
  `;
}

function renderHomeworkAttachments(attachments = []) {
  if (!attachments.length) return "";

  return `
    <div class="attachment-strip">
      ${attachments.map((item) => `
        <div class="attachment-thumb">
          <img src="${escapeHtml(item.dataUrl)}" alt="${escapeHtml(item.name || "Фото ДЗ")}" />
        </div>
      `).join("")}
    </div>
  `;
}

function renderRevenueChart() {
  const monthlyMap = {};
  state.data.transactions.forEach((transaction) => {
    if (!transaction.date) return;
    const key = transaction.date.slice(0, 7);
    monthlyMap[key] = (monthlyMap[key] || 0) + Number(transaction.amount || 0);
  });

  const keys = Object.keys(monthlyMap).sort().slice(-6);
  if (keys.length < 2) return "";

  const values = keys.map((key) => monthlyMap[key]);
  const maxValue = Math.max(...values) || 1;
  const bars = keys.map((key, index) => {
    const pct = Math.round((values[index] / maxValue) * 100);
    const label = new Date(`${key}-01`).toLocaleDateString("ru-RU", { month: "short", year: "2-digit" });
    return `
      <div class="chart-col">
        <div class="chart-bar-wrap">
          <div class="chart-bar" style="height:${pct}%" title="${formatMoney(values[index])}"></div>
        </div>
        <div class="chart-label">${label}</div>
        <div class="chart-value">${formatMoney(values[index])}</div>
      </div>
    `;
  }).join("");

  return `
    <section class="panel">
      <div class="section-head">
        <div>
          <h3 class="section-title">Доходы по месяцам</h3>
          <p class="section-subtitle">Сводка поступлений за последние 6 месяцев</p>
        </div>
      </div>
      <div class="revenue-chart">${bars}</div>
    </section>
  `;
}

function metricCard(label, value, subline) {
  return `
    <article class="metric-card">
      <div class="metric-label">${escapeHtml(label)}</div>
      <div class="metric-value">${escapeHtml(String(value))}</div>
      <div class="metric-sub">${escapeHtml(subline)}</div>
    </article>
  `;
}

async function reloadData(options = {}) {
  if (!state.user || !state.account) return false;

  try {
    state.data = normalizeData(await backend.loadData(state.user, state.account));
    state.notice = "";
    return true;
  } catch (error) {
    if (!options.allowFailure) {
      throw error;
    }

    if (!options.silent) {
      showToast(options.offlineMessage || getErrorMessage(error), "info");
    } else if (options.offlineMessage && isOfflineError(error)) {
      showToast(options.offlineMessage, "info");
    }

    return false;
  }
}

function upsertStudentInState(student) {
  const nextStudents = [...state.data.students];
  const index = nextStudents.findIndex((item) => item.id === student.id);
  if (index >= 0) {
    nextStudents[index] = {
      ...nextStudents[index],
      ...student
    };
  } else {
    nextStudents.unshift(student);
  }

  state.data = normalizeData({
    ...state.data,
    students: nextStudents
  });
}

function allowedViews() {
  return isStudent()
    ? ["dashboard", "homework", "calendar", "videos"]
    : ["dashboard", "students", "homework", "portals", "calendar", "videos", "profile", "cabinet"];
}

function emptyData() {
  return { students: [], transactions: [], lessons: [], homeworks: [], videos: [] };
}

function normalizeData(data) {
  return {
    students: [...(data.students || [])].sort(sortByName),
    transactions: [...(data.transactions || [])].sort(sortByDateDesc),
    lessons: [...(data.lessons || [])].sort(sortByDateTime),
    homeworks: [...(data.homeworks || [])].sort(sortByDateDesc),
    videos: [...(data.videos || [])].sort(sortByCreatedDesc)
  };
}

function filteredStudents() {
  if (isStudent()) return [...state.data.students];
  const query = state.search;
  if (!query) return [...state.data.students];

  return state.data.students.filter((student) =>
    [student.name, student.subject, student.notes, student.goal, student.portalCode, student.email].some((value) =>
      String(value || "").toLowerCase().includes(query)
    )
  );
}

function filteredHomeworks() {
  const query = state.search;
  const items = visibleHomeworks();
  if (!query) return items;

  return items.filter((homework) => {
    const student = findStudent(homework.studentId);
    return [homework.title, homework.description, homework.teacherNote, student?.name, student?.subject].some((value) =>
      String(value || "").toLowerCase().includes(query)
    );
  });
}

function filteredLessons() {
  const query = state.search;
  const items = visibleLessons();
  if (!query) return items;

  return items.filter((lesson) => {
    const student = findStudent(lesson.studentId);
    return [lesson.topic, lesson.time, student?.name, student?.subject].some((value) =>
      String(value || "").toLowerCase().includes(query)
    );
  });
}

function filteredVideos() {
  const query = state.search;
  const items = visibleVideos();
  if (!query) return items;

  return items.filter((video) => {
    const student = video.studentId ? findStudent(video.studentId) : null;
    return [video.title, video.description, student?.name, student?.subject].some((value) =>
      String(value || "").toLowerCase().includes(query)
    );
  });
}

function deriveTutorData() {
  const totalRevenue = state.data.transactions.reduce((sum, item) => sum + Number(item.amount || 0), 0);
  const totalLessonsLeft = state.data.students.reduce((sum, item) => sum + Number(item.lessonsLeft || 0), 0);
  const weekLessons = getWeekDays().reduce(
    (count, day) => count + state.data.lessons.filter((item) => item.date === day.iso).length,
    0
  );
  const activeStudents = state.data.students.filter((item) => Number(item.lessonsLeft || 0) > 0).length;
  const upcomingLessons = state.data.lessons.filter((item) => item.status === "planned").sort(sortByDateTime);
  const reviewQueue = state.data.homeworks.filter((item) => ["submitted", "rework"].includes(item.status));

  return {
    students: filteredStudents(),
    homeworks: filteredHomeworks(),
    videos: filteredVideos(),
    totalRevenue,
    totalLessonsLeft,
    weekLessons,
    activeStudents,
    activePortals: state.data.students.filter((item) => item.accountUid).length,
    upcomingLessons,
    reviewQueue
  };
}

function visibleLessons() {
  if (isStudent()) {
    return [...state.data.lessons].filter((item) => item.studentId === state.account?.studentId);
  }
  return [...state.data.lessons];
}

function visibleHomeworks() {
  if (isStudent()) {
    return [...state.data.homeworks].filter((item) => item.studentId === state.account?.studentId).sort(sortByDateDesc);
  }
  return [...state.data.homeworks];
}

function visibleVideos() {
  if (isStudent()) {
    return [...state.data.videos].filter((item) => item.audience === "all" || item.studentId === state.account?.studentId);
  }
  return [...state.data.videos];
}

function findStudent(studentId) {
  return state.data.students.find((student) => student.id === studentId);
}

function selectedStudent() {
  return findStudent(state.selectedStudentId);
}

function currentStudent() {
  return isStudent() ? findStudent(state.account?.studentId) : selectedStudent();
}

function findHomework(homeworkId) {
  return state.data.homeworks.find((item) => item.id === homeworkId);
}

function findVideo(videoId) {
  return state.data.videos.find((item) => item.id === videoId);
}

function getStudentStats(studentId) {
  const lessons = state.data.lessons.filter((item) => item.studentId === studentId).sort(sortByDateTime);
  const homeworks = state.data.homeworks.filter((item) => item.studentId === studentId);
  const videos = state.data.videos.filter((item) => item.audience === "all" || item.studentId === studentId);
  const nextLesson = lessons.find((lesson) => lesson.status === "planned");
  const averageProgress = homeworks.length
    ? Math.round(homeworks.reduce((sum, item) => sum + clampProgress(item.progress), 0) / homeworks.length)
    : 0;

  return {
    homeworkOpen: homeworks.filter((item) => item.status !== "reviewed").length,
    nextLesson: nextLesson ? formatLessonDate(nextLesson.date, nextLesson.time) : "",
    averageProgress,
    videoCount: videos.length
  };
}

function formatMoney(value) {
  return `${Number(value || 0).toLocaleString("ru-RU")} ₽`;
}

function formatDate(value) {
  if (!value) return "Без даты";
  return new Date(`${value}T00:00:00`).toLocaleDateString("ru-RU", {
    day: "2-digit",
    month: "short",
    year: "numeric"
  });
}

function formatLessonDate(date, time) {
  return `${formatDate(date)}, ${time || "00:00"}`;
}

function formatRelativeCreated(value) {
  const date = toDate(value);
  if (!date) return "Недавно";
  return date.toLocaleDateString("ru-RU", { day: "2-digit", month: "short" });
}

function getInitials(name) {
  return String(name || "")
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0])
    .join("")
    .toUpperCase();
}

function todayISO() {
  return toISODate(new Date());
}

function getWeekDays() {
  const today = new Date();
  const monday = new Date(today);
  const day = monday.getDay() || 7;
  monday.setDate(monday.getDate() - day + 1);
  monday.setHours(0, 0, 0, 0);

  return Array.from({ length: 7 }, (_, index) => {
    const date = new Date(monday);
    date.setDate(monday.getDate() + index);
    const iso = toISODate(date);
    return {
      iso,
      isToday: iso === todayISO(),
      label: date.toLocaleDateString("ru-RU", { weekday: "short", day: "numeric", month: "short" })
    };
  });
}

function toISODate(value) {
  const date = new Date(value);
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function toDate(value) {
  if (!value) return null;
  if (value instanceof Date) return value;
  if (typeof value === "object" && typeof value.toDate === "function") return value.toDate();
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function sortByDateTime(a, b) {
  const left = new Date(`${a.date || "1970-01-01"}T${a.time || "00:00"}`);
  const right = new Date(`${b.date || "1970-01-01"}T${b.time || "00:00"}`);
  return left - right;
}

function sortByDateDesc(a, b) {
  const left = toDate(a.dueDate || a.date || a.createdAt || 0);
  const right = toDate(b.dueDate || b.date || b.createdAt || 0);
  return (right?.getTime() || 0) - (left?.getTime() || 0);
}

function sortByCreatedDesc(a, b) {
  return (toDate(b.createdAt)?.getTime() || 0) - (toDate(a.createdAt)?.getTime() || 0);
}

function sortByName(a, b) {
  return String(a.name || "").localeCompare(String(b.name || ""), "ru");
}

function lessonStatusLabel(status) {
  if (status === "done") return "Проведен";
  if (status === "cancelled") return "Отменен";
  return "Запланирован";
}

function homeworkStatusLabel(status) {
  if (status === "submitted") return "На проверке";
  if (status === "reviewed") return "Проверено";
  if (status === "rework") return "На доработке";
  return "Назначено";
}

function clampProgress(value) {
  return Math.max(0, Math.min(100, Number(value || 0)));
}

function isTutor() {
  return state.account?.role !== "student";
}

function isStudent() {
  return state.account?.role === "student";
}

function fillStudentSelect(select, selectedId, includePlaceholder) {
  if (!select) return;

  const options = [];
  if (!includePlaceholder) {
    options.push(`<option value="">Все ученики</option>`);
  }

  state.data.students.forEach((student) => {
    options.push(`<option value="${escapeHtml(student.id)}">${escapeHtml(student.name)} — ${escapeHtml(student.subject)}</option>`);
  });

  if (includePlaceholder && !state.data.students.length) {
    options.push(`<option value="">Сначала добавь ученика</option>`);
  }

  select.innerHTML = options.join("");
  if (selectedId) {
    select.value = selectedId;
  }
}

function extractVkEmbedUrl(input) {
  const raw = String(input || "").trim();
  if (!raw) return "";

  const iframeMatch = raw.match(/src=["']([^"']+)["']/i);
  const candidate = iframeMatch ? iframeMatch[1] : raw;
  const normalized = candidate.startsWith("//") ? `https:${candidate}` : candidate;

  try {
    const url = new URL(normalized);
    const isVkDomain = /(^|\.)vk\.com$/.test(url.hostname) || /(^|\.)vkvideo\.ru$/.test(url.hostname);
    const isVideoExt = url.pathname.includes("video_ext.php");
    return isVkDomain && isVideoExt ? url.toString() : "";
  } catch {
    return "";
  }
}

async function prepareHomeworkAttachments(files, existingAttachments) {
  const imageFiles = files.filter((file) => file.type.startsWith("image/"));
  if (!imageFiles.length) {
    throw new Error("Можно прикреплять только изображения.");
  }
  if (existingAttachments.length + imageFiles.length > 4) {
    throw new Error("Можно прикрепить максимум 4 фотографии к одному ДЗ.");
  }

  const prepared = [];
  for (const file of imageFiles) {
    const compressed = await compressImageFile(file);
    prepared.push({
      id: makeId(),
      name: file.name.replace(/\.[^.]+$/, "") + ".jpg",
      dataUrl: compressed,
      mimeType: "image/jpeg"
    });
  }

  const totalSize = [...existingAttachments, ...prepared].reduce((sum, item) => sum + String(item.dataUrl || "").length, 0);
  if (totalSize > 900000) {
    throw new Error("Фото слишком тяжелые для одного задания. Уменьши количество или размер изображений.");
  }

  return prepared;
}

async function compressImageFile(file) {
  const dataUrl = await readFileAsDataUrl(file);
  const image = await loadImage(dataUrl);
  const maxSide = 1400;
  const scale = Math.min(1, maxSide / Math.max(image.width, image.height));
  const width = Math.max(1, Math.round(image.width * scale));
  const height = Math.max(1, Math.round(image.height * scale));

  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext("2d");
  context.fillStyle = "#ffffff";
  context.fillRect(0, 0, width, height);
  context.drawImage(image, 0, 0, width, height);

  return canvas.toDataURL("image/jpeg", 0.8);
}

function readFileAsDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ""));
    reader.onerror = () => reject(new Error("Не удалось прочитать изображение."));
    reader.readAsDataURL(file);
  });
}

function loadImage(src) {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error("Не удалось обработать изображение."));
    image.src = src;
  });
}

function makeId() {
  if (globalThis.crypto?.randomUUID) {
    return globalThis.crypto.randomUUID();
  }
  return `id-${Date.now()}-${Math.random().toString(16).slice(2, 8)}`;
}

function getErrorMessage(error) {
  const code = error?.code || "";
  if (isOfflineError(error)) {
    return "Не удалось связаться с Firestore. Проверь интернет или настройки Firebase, затем обнови страницу.";
  }
  if (code.includes("auth/email-already-in-use")) return "Этот email уже зарегистрирован.";
  if (code.includes("auth/invalid-credential") || code.includes("auth/wrong-password")) {
    return "Неверная почта или пароль.";
  }
  if (code.includes("auth/invalid-email")) return "Укажи корректный email.";
  if (code.includes("auth/weak-password")) return "Пароль слишком слабый. Минимум 6 символов.";
  if (code.includes("permission-denied")) {
    return "Firebase отклонил запрос. Проверь Firestore rules и снова опубликуй правила.";
  }
  return error?.message || "Что-то пошло не так.";
}

function isOfflineError(error) {
  const code = String(error?.code || "").toLowerCase();
  const message = String(error?.message || "").toLowerCase();
  return code.includes("offline")
    || code.includes("unavailable")
    || message.includes("client is offline")
    || message.includes("offline");
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}
