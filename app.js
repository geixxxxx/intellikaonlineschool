import { backend } from "./firebase.js";

const state = {
  authReady: false,
  user: null,
  data: emptyData(),
  loadingData: false,
  currentView: "dashboard",
  selectedStudentId: null,
  search: "",
  homeworkFilter: "all",
  authMode: "login",
  notice: "",
  unsubscribeData: null
};

const authMount = document.getElementById("authMount");
const appShell = document.getElementById("appShell");
const appView = document.getElementById("appView");
const modalBackdrop = document.getElementById("modalBackdrop");
const modalRoot = document.getElementById("modalRoot");
const searchInput = document.getElementById("searchInput");
const addStudentBtn = document.getElementById("addStudentBtn");
const resetDataBtn = document.getElementById("resetDataBtn");
const logoutBtn = document.getElementById("logoutBtn");
const userEmail = document.getElementById("userEmail");
const backendStatus = document.getElementById("backendStatus");

init();

function init() {
  document.querySelectorAll("[data-view]").forEach((button) => {
    button.addEventListener("click", () => {
      state.currentView = button.dataset.view;
      if (!["profile", "cabinet"].includes(state.currentView)) {
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

    if (user) {
      await bootUserSession();
    } else {
      state.data = emptyData();
      state.selectedStudentId = null;
      state.currentView = "dashboard";
      state.loadingData = false;
      render();
    }
  });

  render();
}

async function bootUserSession() {
  state.loadingData = true;
  render();

  try {
    state.data = normalizeData(await backend.loadData(state.user));
  } catch (error) {
    state.notice = getErrorMessage(error);
  }

  state.unsubscribeData = backend.subscribeData(
    state.user,
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
    renderAuthScreen();
    return;
  }

  authMount.classList.add("hidden");
  appShell.classList.remove("hidden");

  if (state.loadingData) {
    appView.innerHTML = renderLoadingPanel("Подключаем аккаунт и загружаем базу данных...");
    return;
  }

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

  if (state.currentView === "cabinet" && state.selectedStudentId) {
    appView.innerHTML = renderCabinetView();
    bindCabinetView();
    return;
  }

  if (state.currentView === "calendar") {
    appView.innerHTML = renderCalendarView();
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

function syncChrome() {
  appShell.classList.toggle("hidden", !state.authReady || !state.user);
  authMount.classList.toggle("hidden", !state.authReady || !!state.user);
  backendStatus.textContent = backend.mode === "firebase" ? "Firebase Cloud" : "Демо без Firebase";
  backendStatus.classList.toggle("is-live", backend.mode === "firebase");
  userEmail.textContent = state.user?.email || "guest@demo.local";
  resetDataBtn.textContent = backend.mode === "firebase" ? "Загрузить демо" : "Сбросить демо";
  document.querySelectorAll(".nav-btn").forEach((button) => {
    button.classList.toggle("is-active", button.dataset.view === state.currentView);
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

function renderAuthScreen() {
  authMount.innerHTML = `
    <section class="auth-card">
      <div class="auth-intro">
        <div class="brand-mark">IN</div>
        <p class="eyebrow">Платформа репетитора</p>
        <h2 class="hero-title">Регистрация, вход и общая база учеников уже встроены.</h2>
        <p class="hero-copy">
          ${backend.mode === "firebase"
            ? "Аккаунты работают через Firebase Authentication, а данные проекта живут в Cloud Firestore."
            : "Сейчас включен демо-режим. Чтобы включить настоящую облачную базу и регистрацию, заполни файл firebase-config.js и включи Firebase Auth + Firestore."}
        </p>
        <div class="auth-note">
          <strong>${backend.mode === "firebase" ? "Cloud mode" : "Что нужно для продакшена"}</strong>
          <p>${backend.mode === "firebase"
            ? "Можно регистрировать преподавателей по email и паролю. У каждого аккаунта будет своя изолированная база учеников."
            : "Создай Firebase-проект, включи Email/Password в Authentication и Cloud Firestore, затем вставь конфиг из консоли в firebase-config.js."}</p>
        </div>
      </div>

      <div class="auth-panel">
        <div class="pill-tabs">
          <button class="tag-btn ${state.authMode === "login" ? "is-selected" : ""}" data-auth-mode="login">Вход</button>
          <button class="tag-btn ${state.authMode === "register" ? "is-selected" : ""}" data-auth-mode="register">Регистрация</button>
        </div>

        <form id="authForm" class="modal-form auth-form">
          ${
            state.authMode === "register"
              ? `
                <label>
                  <span>Имя преподавателя</span>
                  <input name="displayName" required />
                </label>
              `
              : ""
          }
          <label>
            <span>Email</span>
            <input name="email" type="email" required />
          </label>
          <label>
            <span>Пароль</span>
            <input name="password" type="password" minlength="6" required />
          </label>
          ${
            state.authMode === "register"
              ? `
                <label>
                  <span>Повторите пароль</span>
                  <input name="passwordRepeat" type="password" minlength="6" required />
                </label>
              `
              : ""
          }
          ${state.notice ? `<div class="auth-alert">${escapeHtml(state.notice)}</div>` : ""}
          <button type="submit" class="primary-btn auth-submit">
            ${state.authMode === "login" ? "Войти в кабинет" : "Создать аккаунт"}
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

  document.getElementById("authForm")?.addEventListener("submit", handleAuthSubmit);
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
    state.notice = getErrorMessage(error);
    render();
  }
}

async function resetDataset() {
  if (!state.user) return;
  const confirmMessage =
    backend.mode === "firebase"
      ? "Загрузить в облачную базу стартовый набор demo-данных?"
      : "Сбросить локальные demo-данные?";
  if (!window.confirm(confirmMessage)) return;

  try {
    await backend.resetDemoData(state.user);
    state.data = normalizeData(await backend.loadData(state.user));
    render();
  } catch (error) {
    state.notice = getErrorMessage(error);
    render();
  }
}

function renderDashboardView() {
  const data = deriveData();
  const upcoming = data.upcomingLessons.slice(0, 4);
  const reviewQueue = data.homeworks.filter((item) => ["submitted", "rework"].includes(item.status)).slice(0, 4);

  return `
    ${renderNoticeBanner()}
    ${backend.mode === "demo" ? renderSetupBanner() : ""}
    <section class="hero-card">
      <div>
        <p class="eyebrow">Рабочая панель</p>
        <h2 class="hero-title">У тебя уже есть аккаунты, база данных и изолированные кабинеты под каждого преподавателя.</h2>
        <p class="hero-copy">
          Платформа хранит учеников, оплаты, занятия и домашние задания в общей базе, а вход и регистрация работают через ${backend.mode === "firebase" ? "Firebase Authentication" : "демо-слой до заполнения Firebase-конфига"}.
        </p>
        <div class="inline-actions">
          <button class="primary-btn" id="heroAddStudent">Новый ученик</button>
          <button class="ghost-btn" id="heroOpenHomework">Проверка ДЗ</button>
          <button class="ghost-btn" id="heroOpenPortals">Кабинеты</button>
        </div>
      </div>
      <div class="hero-stats">
        <div class="hero-stat">
          <span class="eyebrow">Выручка</span>
          <strong>${formatMoney(data.totalRevenue)}</strong>
        </div>
        <div class="hero-stat">
          <span class="eyebrow">На проверке</span>
          <strong>${data.homeworks.filter((item) => item.status === "submitted").length}</strong>
        </div>
        <div class="hero-stat">
          <span class="eyebrow">Аккаунт</span>
          <strong>${escapeHtml(state.user.email)}</strong>
        </div>
      </div>
    </section>

    <section class="metrics-grid">
      ${metricCard("Ученики", data.students.length, `${data.activeStudents} активных`)}
      ${metricCard("Домашки", data.homeworks.length, `${data.reviewedHomeworkCount} уже проверено`)}
      ${metricCard("Остаток уроков", data.totalLessonsLeft, "По всем ученикам")}
      ${metricCard("На неделе", data.weekLessons, "Запланировано")}
    </section>

    <section class="profile-grid">
      <div class="panel">
        <div class="section-head">
          <div>
            <h3 class="section-title">Ближайшие занятия</h3>
            <p class="section-subtitle">То, что скоро начнется</p>
          </div>
        </div>
        <div class="list">
          ${
            upcoming.length
              ? upcoming.map(renderUpcomingLessonCard).join("")
              : '<div class="empty-state">Пока нет ближайших занятий.</div>'
          }
        </div>
      </div>

      <div class="panel">
        <div class="section-head">
          <div>
            <h3 class="section-title">Очередь на проверку</h3>
            <p class="section-subtitle">Работы, которые требуют внимания</p>
          </div>
        </div>
        <div class="list">
          ${
            reviewQueue.length
              ? reviewQueue.map(renderReviewCard).join("")
              : '<div class="empty-state">Сейчас очередь пуста.</div>'
          }
        </div>
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
          <p class="section-subtitle">Теперь это уже общая база аккаунта, а не локальный список в браузере</p>
        </div>
        <div class="pill-tabs">
          <button class="tag-btn" id="openDashboardBtn">На дашборд</button>
          <button class="primary-btn" id="studentsAddBtn">Добавить ученика</button>
        </div>
      </div>
      <div class="students-grid">
        ${
          students.length
            ? students
                .map((student) => {
                  const homeworkCount = state.data.homeworks.filter((item) => item.studentId === student.id).length;
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
                      </div>
                      <div class="info-list">
                        <div class="info-line"><span>Ставка</span><strong>${formatMoney(student.rate)}</strong></div>
                        <div class="info-line"><span>Телефон</span><strong>${escapeHtml(student.phone || "Не указан")}</strong></div>
                      </div>
                      <div class="student-actions">
                        <button class="ghost-btn" data-open-payment="${student.id}">Оплата</button>
                        <button class="ghost-btn" data-open-lesson="${student.id}">Урок</button>
                        <button class="ghost-btn" data-open-homework="${student.id}">ДЗ</button>
                        <button class="ghost-btn" data-open-cabinet="${student.id}">Кабинет</button>
                        <button class="ghost-btn" data-delete-student="${student.id}">Удалить</button>
                      </div>
                    </article>
                  `;
                })
                .join("")
            : '<div class="empty-state">По этому запросу ничего не найдено.</div>'
        }
      </div>
    </section>
  `;
}

function renderHomeworkView() {
  const items = filteredHomeworks().filter((item) =>
    state.homeworkFilter === "submitted-only" ? item.status === "submitted" : true
  );
  const columns = [
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
          <p class="section-subtitle">Все задания живут в базе и доступны после входа в аккаунт</p>
        </div>
        <div class="pill-tabs">
          <button class="tag-btn" id="homeworkOnlySubmitted">${
            state.homeworkFilter === "submitted-only" ? "Показать все" : "Только на проверке"
          }</button>
          <button class="primary-btn" id="homeworkAddBtn">Выдать ДЗ</button>
        </div>
      </div>
      <div class="board-grid">
        ${columns
          .map((column) => {
            const list = items.filter((item) => item.status === column.key);
            return `
              <section class="board-column">
                <div class="board-column-head">
                  <h3 class="section-title">${column.title}</h3>
                  <span class="board-count">${list.length}</span>
                </div>
                ${
                  list.length
                    ? list
                        .map((item) => {
                          const student = findStudent(item.studentId);
                          return `
                            <article class="homework-card">
                              <div>
                                <h4>${escapeHtml(item.title)}</h4>
                                <div class="homework-meta">${escapeHtml(student?.name || "Ученик")} • ${escapeHtml(student?.subject || "")}</div>
                              </div>
                              <div class="muted-copy">${escapeHtml(item.description || "Без описания")}</div>
                              <div class="progress-track">
                                <div class="progress-fill" style="width: ${clampProgress(item.progress)}%"></div>
                              </div>
                              <div class="timeline-meta">Срок: ${formatDate(item.dueDate)}</div>
                              <div class="timeline-meta">${escapeHtml(item.teacherNote || "Комментария преподавателя пока нет")}</div>
                              <div class="student-actions">
                                <button class="tag-btn" data-homework-status="${item.id}:submitted">На проверке</button>
                                <button class="tag-btn" data-homework-status="${item.id}:rework">Доработать</button>
                                <button class="tag-btn" data-homework-status="${item.id}:reviewed">Принять</button>
                                <button class="tag-btn" data-edit-homework="${item.id}">Изменить</button>
                              </div>
                            </article>
                          `;
                        })
                        .join("")
                    : '<div class="empty-state">Пока пусто.</div>'
                }
              </section>
            `;
          })
          .join("")}
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
          <p class="section-subtitle">Каждый кабинет теперь тоже хранится в базе этого аккаунта</p>
        </div>
      </div>
      <div class="portal-grid">
        ${students
          .map((student) => {
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
                  <div class="info-line"><span>Домашки</span><strong>${stats.homeworkOpen}</strong></div>
                  <div class="info-line"><span>Ближайший урок</span><strong>${escapeHtml(stats.nextLesson || "Нет")}</strong></div>
                  <div class="info-line"><span>Прогресс</span><strong>${stats.averageProgress}%</strong></div>
                </div>
                <div class="student-actions">
                  <button class="primary-btn" data-open-cabinet="${student.id}">Открыть кабинет</button>
                  <button class="ghost-btn" data-open-profile="${student.id}">Профиль</button>
                </div>
              </article>
            `;
          })
          .join("")}
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

  return `
    ${renderNoticeBanner()}
    <section class="section-head">
      <div>
        <p class="eyebrow">Профиль ученика</p>
        <h2 class="section-title">${escapeHtml(student.name)}</h2>
      </div>
      <div class="inline-actions">
        <button class="ghost-btn" id="backToStudentsBtn">К списку</button>
        <button class="ghost-btn" id="profileOpenCabinetBtn">Личный кабинет</button>
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
          </div>
          <div class="student-actions">
            <button class="ghost-btn" id="profileAddLessonBtn">Запланировать урок</button>
            <button class="ghost-btn" id="profileAddHomeworkBtn">Выдать ДЗ</button>
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
          </div>
          <div>
            <p class="eyebrow">Заметки</p>
            <p>${escapeHtml(student.notes || "Пока без заметок.")}</p>
          </div>
        </article>
      </div>

      <div class="profile-summary">
        <article class="panel">
          <div class="section-head">
            <div>
              <h3 class="section-title">История оплат</h3>
              <p class="section-subtitle">Все пополнения по этому ученику</p>
            </div>
          </div>
          <div class="list">
            ${
              transactions.length
                ? transactions
                    .map(
                      (item) => `
                        <article class="timeline-item">
                          <div>
                            <strong>${formatMoney(item.amount)}</strong>
                            <div class="timeline-meta">${escapeHtml(item.comment || "Без комментария")}</div>
                          </div>
                          <div class="timeline-meta">${formatDate(item.date)}</div>
                        </article>
                      `
                    )
                    .join("")
                : '<div class="empty-state">Оплат пока нет.</div>'
            }
          </div>
        </article>

        <article class="panel">
          <div class="section-head">
            <div>
              <h3 class="section-title">Уроки и ДЗ</h3>
              <p class="section-subtitle">Быстрый обзор по ученику</p>
            </div>
          </div>
          <div class="list">
            ${
              lessons.length
                ? lessons.slice(0, 4).map(renderMiniLesson).join("")
                : '<div class="empty-state">Занятий пока нет.</div>'
            }
            ${
              homeworks.length
                ? homeworks.slice(0, 4).map(renderMiniHomework).join("")
                : '<div class="empty-state">Домашних заданий пока нет.</div>'
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

  return `
    ${renderNoticeBanner()}
    <section class="portal-hero">
      <div class="section-head">
        <div>
          <p class="eyebrow">Личный кабинет ученика</p>
          <h2 class="hero-title">${escapeHtml(student.name)}</h2>
          <p class="hero-copy">Здесь ученик видит ближайшие уроки, домашние задания и комментарии преподавателя.</p>
        </div>
        <div class="inline-actions">
          <button class="ghost-btn" id="cabinetBackBtn">К кабинетам</button>
          <span class="portal-token">${escapeHtml(student.portalCode)}</span>
        </div>
      </div>
    </section>

    <section class="metrics-grid">
      ${metricCard("Остаток уроков", student.lessonsLeft, "Оплаченные занятия")}
      ${metricCard("Баланс", formatMoney(student.balance), "Текущий остаток")}
      ${metricCard("Прогресс ДЗ", `${stats.averageProgress}%`, "Средний прогресс")}
      ${metricCard("Следующий урок", stats.nextLesson || "Нет", "Ближайшая запись")}
    </section>

    <section class="portal-layout">
      <div class="stack">
        <article class="panel">
          <h3 class="section-title">О курсе</h3>
          <div class="info-list">
            <div class="info-line"><span>Предмет</span><strong>${escapeHtml(student.subject)}</strong></div>
            <div class="info-line"><span>Цель</span><strong>${escapeHtml(student.goal || "Уточняется")}</strong></div>
            <div class="info-line"><span>Контакт</span><strong>${escapeHtml(student.phone || "Через преподавателя")}</strong></div>
          </div>
        </article>

        <article class="panel">
          <h3 class="section-title">Комментарий преподавателя</h3>
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
            ${
              lessons.length
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
            ${
              homeworks.length
                ? homeworks.map(renderCabinetHomework).join("")
                : '<div class="empty-state">Сейчас домашних заданий нет.</div>'
            }
          </div>
        </article>
      </div>
    </section>
  `;
}

function renderCalendarView() {
  const days = getWeekDays();
  const lessons = [...state.data.lessons].sort(sortByDateTime);

  return `
    ${renderNoticeBanner()}
    <section class="panel">
      <div class="section-head">
        <div>
          <p class="eyebrow">Недельный обзор</p>
          <h2 class="section-title">Календарь</h2>
          <p class="section-subtitle">Все занятия текущего аккаунта по неделе</p>
        </div>
      </div>
      <div class="calendar-grid">
        ${days
          .map((day) => {
            const dayLessons = lessons.filter((lesson) => lesson.date === day.iso);
            return `
              <article class="calendar-day ${day.isToday ? "is-today" : ""}">
                <div class="calendar-date">${day.label}</div>
                ${
                  dayLessons.length
                    ? dayLessons
                        .map((lesson) => {
                          const student = findStudent(lesson.studentId);
                          return `
                            <div class="calendar-chip">
                              <strong>${lesson.time}</strong>
                              ${escapeHtml(student?.name || "Ученик")}
                              <div class="timeline-meta">${escapeHtml(student?.subject || "")}</div>
                            </div>
                          `;
                        })
                        .join("")
                    : '<div class="timeline-meta">Свободно</div>'
                }
              </article>
            `;
          })
          .join("")}
      </div>
    </section>
  `;
}

function bindDashboardView() {
  document.getElementById("heroAddStudent")?.addEventListener("click", () => openStudentModal());
  document.getElementById("heroOpenHomework")?.addEventListener("click", () => {
    state.currentView = "homework";
    render();
  });
  document.getElementById("heroOpenPortals")?.addEventListener("click", () => {
    state.currentView = "portals";
    render();
  });
}

function bindStudentsView() {
  document.getElementById("studentsAddBtn")?.addEventListener("click", () => openStudentModal());
  document.getElementById("openDashboardBtn")?.addEventListener("click", () => {
    state.currentView = "dashboard";
    render();
  });

  bindOpenProfileButtons();
  bindOpenCabinetButtons();

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
    button.addEventListener("click", () => handleDeleteStudent(button.dataset.deleteStudent));
  });
}

function bindHomeworkView() {
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
        state.data = normalizeData(await backend.loadData(state.user));
        render();
      } catch (error) {
        state.notice = getErrorMessage(error);
        render();
      }
    });
  });

  appView.querySelectorAll("[data-edit-homework]").forEach((button) => {
    button.addEventListener("click", () => openHomeworkModal(button.dataset.editHomework));
  });
}

function bindPortalsView() {
  bindOpenProfileButtons();
  bindOpenCabinetButtons();
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
  document.getElementById("profileEditStudentBtn")?.addEventListener("click", () => openStudentModal(state.selectedStudentId));
}

function bindCabinetView() {
  document.getElementById("cabinetBackBtn")?.addEventListener("click", () => {
    state.currentView = "portals";
    render();
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

function openStudentModal(studentId = null) {
  const template = document.getElementById("studentFormTemplate");
  modalRoot.innerHTML = template.innerHTML;
  const form = document.getElementById("studentForm");
  const student = studentId ? findStudent(studentId) : null;

  document.getElementById("studentModalTitle").textContent = student ? "Редактировать ученика" : "Новый ученик";

  if (student) {
    form.name.value = student.name;
    form.subject.value = student.subject;
    form.rate.value = student.rate;
    form.phone.value = student.phone || "";
    form.goal.value = student.goal || "";
    form.notes.value = student.notes || "";
  }

  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    const formData = new FormData(form);
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
      lessonsLeft: student?.lessonsLeft || 0
    };

    try {
      await backend.saveStudent(state.user, payload);
      state.data = normalizeData(await backend.loadData(state.user));
      closeModal();
      render();
    } catch (error) {
      state.notice = getErrorMessage(error);
      closeModal();
      render();
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
      state.data = normalizeData(await backend.loadData(state.user));
      closeModal();
      render();
    } catch (error) {
      state.notice = getErrorMessage(error);
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
      state.data = normalizeData(await backend.loadData(state.user));
      closeModal();
      render();
    } catch (error) {
      state.notice = getErrorMessage(error);
      closeModal();
      render();
    }
  });

  showModal();
}

function openHomeworkModal(homeworkId = null, studentId = state.selectedStudentId) {
  const template = document.getElementById("homeworkTemplate");
  modalRoot.innerHTML = template.innerHTML;
  const form = document.getElementById("homeworkForm");
  const homework = homeworkId ? findHomework(homeworkId) : null;

  if (!studentId && !homework && state.data.students[0]) {
    studentId = state.data.students[0].id;
  }

  const student = homework ? findStudent(homework.studentId) : findStudent(studentId);
  document.getElementById("homeworkModalTitle").textContent = homework
    ? `Редактировать ДЗ: ${student?.name || ""}`
    : `Новое ДЗ: ${student?.name || "ученик"}`;

  if (homework) {
    form.title.value = homework.title;
    form.dueDate.value = homework.dueDate;
    form.status.value = homework.status;
    form.progress.value = homework.progress;
    form.description.value = homework.description || "";
    form.teacherNote.value = homework.teacherNote || "";
  } else {
    form.dueDate.value = todayISO();
  }

  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    const formData = new FormData(form);

    try {
      await backend.saveHomework(state.user, {
        id: homework?.id,
        studentId: homework?.studentId || student?.id,
        title: String(formData.get("title")).trim(),
        dueDate: String(formData.get("dueDate")),
        status: String(formData.get("status")),
        progress: Number(formData.get("progress") || 0),
        description: String(formData.get("description")).trim(),
        teacherNote: String(formData.get("teacherNote")).trim()
      });
      state.data = normalizeData(await backend.loadData(state.user));
      closeModal();
      render();
    } catch (error) {
      state.notice = getErrorMessage(error);
      closeModal();
      render();
    }
  });

  showModal();
}

async function handleDeleteStudent(studentId) {
  const student = findStudent(studentId);
  if (!student) return;
  if (!window.confirm(`Удалить ученика ${student.name}?`)) return;

  try {
    await backend.deleteStudent(state.user, studentId);
    state.data = normalizeData(await backend.loadData(state.user));
    if (state.selectedStudentId === studentId) {
      state.selectedStudentId = null;
      state.currentView = "students";
    }
    render();
  } catch (error) {
    state.notice = getErrorMessage(error);
    render();
  }
}

function showModal() {
  modalBackdrop.classList.remove("hidden");
}

function closeModal() {
  modalBackdrop.classList.add("hidden");
  modalRoot.innerHTML = "";
}

function emptyData() {
  return {
    students: [],
    transactions: [],
    lessons: [],
    homeworks: []
  };
}

function normalizeData(data) {
  return {
    students: [...(data.students || [])].sort(sortByName),
    transactions: [...(data.transactions || [])].sort(sortByDateDesc),
    lessons: [...(data.lessons || [])].sort(sortByDateTime),
    homeworks: [...(data.homeworks || [])].sort(sortByDateDesc)
  };
}

function filteredStudents() {
  const query = state.search;
  if (!query) return [...state.data.students];

  return state.data.students.filter((student) =>
    [student.name, student.subject, student.notes, student.goal, student.portalCode].some((value) =>
      String(value || "").toLowerCase().includes(query)
    )
  );
}

function filteredHomeworks() {
  const query = state.search;
  if (!query) return [...state.data.homeworks];

  return state.data.homeworks.filter((homework) => {
    const student = findStudent(homework.studentId);
    return [homework.title, homework.description, homework.teacherNote, student?.name, student?.subject].some(
      (value) => String(value || "").toLowerCase().includes(query)
    );
  });
}

function deriveData() {
  const totalRevenue = state.data.transactions.reduce((sum, item) => sum + Number(item.amount || 0), 0);
  const totalLessonsLeft = state.data.students.reduce((sum, student) => sum + Number(student.lessonsLeft || 0), 0);
  const weekLessons = getWeekDays().reduce(
    (count, day) => count + state.data.lessons.filter((item) => item.date === day.iso).length,
    0
  );
  const activeStudents = state.data.students.filter((student) => Number(student.lessonsLeft || 0) > 0).length;
  const reviewedHomeworkCount = state.data.homeworks.filter((item) => item.status === "reviewed").length;
  const upcomingLessons = state.data.lessons.filter((lesson) => lesson.status === "planned").sort(sortByDateTime);

  return {
    students: filteredStudents(),
    homeworks: filteredHomeworks(),
    totalRevenue,
    totalLessonsLeft,
    weekLessons,
    activeStudents,
    reviewedHomeworkCount,
    upcomingLessons
  };
}

function findStudent(studentId) {
  return state.data.students.find((student) => student.id === studentId);
}

function selectedStudent() {
  return findStudent(state.selectedStudentId);
}

function findHomework(homeworkId) {
  return state.data.homeworks.find((item) => item.id === homeworkId);
}

function getStudentStats(studentId) {
  const lessons = state.data.lessons.filter((item) => item.studentId === studentId).sort(sortByDateTime);
  const homeworks = state.data.homeworks.filter((item) => item.studentId === studentId);
  const nextLesson = lessons.find((lesson) => lesson.status === "planned");
  const averageProgress = homeworks.length
    ? Math.round(homeworks.reduce((sum, item) => sum + clampProgress(item.progress), 0) / homeworks.length)
    : 0;

  return {
    homeworkOpen: homeworks.filter((item) => item.status !== "reviewed").length,
    nextLesson: nextLesson ? formatLessonDate(nextLesson.date, nextLesson.time) : "",
    averageProgress
  };
}

function renderSetupBanner() {
  return `
    <section class="panel panel--notice">
      <div>
        <p class="eyebrow">Firebase еще не включен</p>
        <h3 class="section-title">Сейчас сайт работает в локальном demo-режиме.</h3>
        <p class="section-subtitle">
          Открой файл <code>firebase-config.js</code>, вставь web config из Firebase Console и включи
          <code>enabled: true</code>. После этого регистрация и база автоматически поедут в облако.
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

function renderCabinetHomework(item) {
  return `
    <article class="homework-card">
      <div>
        <h4>${escapeHtml(item.title)}</h4>
        <div class="homework-meta">${homeworkStatusLabel(item.status)} • до ${formatDate(item.dueDate)}</div>
      </div>
      <div class="muted-copy">${escapeHtml(item.description || "Описание пока не добавлено.")}</div>
      <div class="progress-track">
        <div class="progress-fill" style="width: ${clampProgress(item.progress)}%"></div>
      </div>
      <div class="muted-copy">${escapeHtml(item.teacherNote || "Комментарий преподавателя появится после проверки.")}</div>
    </article>
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

function formatMoney(value) {
  return `${Number(value || 0).toLocaleString("ru-RU")} ₽`;
}

function formatDate(value) {
  return new Date(`${value}T00:00:00`).toLocaleDateString("ru-RU", {
    day: "2-digit",
    month: "short",
    year: "numeric"
  });
}

function formatLessonDate(date, time) {
  return `${formatDate(date)}, ${time}`;
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
  const date = new Date();
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
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
      label: date.toLocaleDateString("ru-RU", {
        weekday: "short",
        day: "numeric",
        month: "short"
      })
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

function sortByDateTime(a, b) {
  return new Date(`${a.date}T${a.time}`) - new Date(`${b.date}T${b.time}`);
}

function sortByDateDesc(a, b) {
  return new Date(b.dueDate || b.date) - new Date(a.dueDate || a.date);
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

function getErrorMessage(error) {
  const code = error?.code || "";
  if (code.includes("auth/email-already-in-use")) return "Этот email уже зарегистрирован.";
  if (code.includes("auth/invalid-credential") || code.includes("auth/wrong-password")) {
    return "Неверная почта или пароль.";
  }
  if (code.includes("auth/invalid-email")) return "Укажи корректный email.";
  if (code.includes("auth/weak-password")) return "Пароль слишком слабый. Минимум 6 символов.";
  if (code.includes("permission-denied")) return "Firebase отклонил запрос. Проверь Firestore rules и авторизацию.";
  return error?.message || "Что-то пошло не так.";
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}