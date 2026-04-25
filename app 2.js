const STORAGE_KEY = "intellika-demo-v2";

const state = {
  currentView: "dashboard",
  selectedStudentId: null,
  search: "",
  homeworkFilter: "all",
  data: loadData(),
};

const appView = document.getElementById("appView");
const modalBackdrop = document.getElementById("modalBackdrop");
const modalRoot = document.getElementById("modalRoot");
const searchInput = document.getElementById("searchInput");
const addStudentBtn = document.getElementById("addStudentBtn");
const resetDataBtn = document.getElementById("resetDataBtn");

init();

function init() {
  document.querySelectorAll("[data-view]").forEach((button) => {
    button.addEventListener("click", () => {
      state.currentView = button.dataset.view;
      if (!["profile", "cabinet"].includes(button.dataset.view)) {
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

  resetDataBtn.addEventListener("click", () => {
    if (!window.confirm("Сбросить все демо-данные?")) return;
    state.data = createSeedData();
    persist();
    render();
  });

  modalBackdrop.addEventListener("click", (event) => {
    if (event.target === modalBackdrop || event.target.hasAttribute("data-close-modal")) {
      closeModal();
    }
  });

  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape") closeModal();
  });

  render();
}

function render() {
  syncNav();

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

function syncNav() {
  document.querySelectorAll(".nav-btn").forEach((button) => {
    button.classList.toggle("is-active", button.dataset.view === state.currentView);
  });
}

function renderDashboardView() {
  const data = deriveData();
  const upcoming = data.upcomingLessons.slice(0, 4);
  const needReview = data.homeworks.filter((item) => ["submitted", "rework"].includes(item.status)).slice(0, 4);

  return `
    <section class="hero-card">
      <div>
        <p class="eyebrow">Рабочая панель</p>
        <h2 class="hero-title">Теперь здесь есть и проверка ДЗ, и личные кабинеты учеников.</h2>
        <p class="hero-copy">
          Платформа ведет учеников, оплаты, уроки и домашние задания, а кабинет ученика показывает его прогресс,
          ближайшие занятия и обратную связь преподавателя.
        </p>
        <div class="inline-actions">
          <button class="primary-btn" id="heroAddStudent">Новый ученик</button>
          <button class="ghost-btn" id="heroOpenHomework">Проверить ДЗ</button>
          <button class="ghost-btn" id="heroOpenPortals">Открыть кабинеты</button>
        </div>
      </div>
      <div class="hero-stats">
        <div class="hero-stat">
          <span class="eyebrow">Выручка за все время</span>
          <strong>${formatMoney(data.totalRevenue)}</strong>
        </div>
        <div class="hero-stat">
          <span class="eyebrow">На проверке</span>
          <strong>${data.homeworks.filter((item) => item.status === "submitted").length}</strong>
        </div>
        <div class="hero-stat">
          <span class="eyebrow">Кабинеты</span>
          <strong>${data.students.length}</strong>
        </div>
      </div>
    </section>

    <section class="metrics-grid">
      ${metricCard("Ученики", data.students.length, `${data.activeStudents} активных сейчас`)}
      ${metricCard("Домашки", data.homeworks.length, `${data.reviewedHomeworkCount} уже проверено`)}
      ${metricCard("Уроков вперед", data.totalLessonsLeft, "Оплаченный остаток по всем ученикам")}
      ${metricCard("На неделе", data.weekLessons, "Запланированных занятий")}
    </section>

    <section class="profile-grid">
      <div class="panel">
        <div class="section-head">
          <div>
            <h3 class="section-title">Ближайшие занятия</h3>
            <p class="section-subtitle">Что открывается на горизонте недели</p>
          </div>
        </div>
        <div class="list">
          ${
            upcoming.length
              ? upcoming
                  .map((lesson) => {
                    const student = findStudent(lesson.studentId);
                    return `
                      <article class="timeline-item">
                        <div>
                          <strong>${student?.name || "Без имени"}</strong>
                          <div class="timeline-meta">${lesson.topic || student?.subject || "Урок"}</div>
                        </div>
                        <div>
                          <strong>${formatLessonDate(lesson.date, lesson.time)}</strong>
                          <div class="timeline-meta">${lesson.duration} мин</div>
                        </div>
                      </article>
                    `;
                  })
                  .join("")
              : '<div class="empty-state">Ближайших уроков пока нет.</div>'
          }
        </div>
      </div>

      <div class="panel">
        <div class="section-head">
          <div>
            <h3 class="section-title">Очередь на проверку</h3>
            <p class="section-subtitle">То, что ученики сдали и ждут комментария</p>
          </div>
        </div>
        <div class="list">
          ${
            needReview.length
              ? needReview
                  .map((homework) => {
                    const student = findStudent(homework.studentId);
                    return `
                      <article class="timeline-item">
                        <div>
                          <strong>${homework.title}</strong>
                          <div class="timeline-meta">${student?.name || "Ученик"} • ${student?.subject || ""}</div>
                        </div>
                        <div>
                          <strong>${homeworkStatusLabel(homework.status)}</strong>
                          <div class="timeline-meta">до ${formatDate(homework.dueDate)}</div>
                        </div>
                      </article>
                    `;
                  })
                  .join("")
              : '<div class="empty-state">Очередь пустая. Все домашки уже обработаны.</div>'
          }
        </div>
      </div>
    </section>
  `;
}

function renderStudentsView() {
  const students = filteredStudents();

  return `
    <section class="panel">
      <div class="students-toolbar">
        <div>
          <p class="eyebrow">База учеников</p>
          <h2 class="section-title">Ученики</h2>
          <p class="section-subtitle">Карточки с балансом, уроками, ДЗ и быстрым входом в кабинет ученика</p>
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
                        <h3 class="student-name">${student.name}</h3>
                        <p class="student-subject">${student.subject}</p>
                      </div>
                      <div class="stat-row">
                        <span class="badge ${student.lessonsLeft <= 1 ? "is-danger" : "is-success"}">${student.lessonsLeft} уроков</span>
                        <span class="badge ${student.balance < student.rate ? "is-warning" : ""}">${formatMoney(student.balance)}</span>
                        <span class="badge">${homeworkCount} ДЗ</span>
                      </div>
                      <div class="info-list">
                        <div class="info-line"><span>Ставка</span><strong>${formatMoney(student.rate)}</strong></div>
                        <div class="info-line"><span>Телефон</span><strong>${student.phone || "Не указан"}</strong></div>
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
    { key: "reviewed", title: "Проверено" },
  ];

  return `
    <section class="panel">
      <div class="students-toolbar">
        <div>
          <p class="eyebrow">Домашние задания</p>
          <h2 class="section-title">Проверка ДЗ</h2>
          <p class="section-subtitle">Смотрите, кто сдал работу, что вернуть на доработку и что уже принято</p>
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
                                <h4>${item.title}</h4>
                                <div class="homework-meta">${student?.name || "Ученик"} • ${student?.subject || ""}</div>
                              </div>
                              <div class="muted-copy">${item.description || "Без описания"}</div>
                              <div class="progress-track">
                                <div class="progress-fill" style="width: ${clampProgress(item.progress)}%"></div>
                              </div>
                              <div class="timeline-meta">Срок: ${formatDate(item.dueDate)}</div>
                              <div class="timeline-meta">${item.teacherNote || "Комментария преподавателя пока нет"}</div>
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
    <section class="panel">
      <div class="students-toolbar">
        <div>
          <p class="eyebrow">Личные кабинеты</p>
          <h2 class="section-title">Кабинеты учеников</h2>
          <p class="section-subtitle">Отдельная витрина, которую можно показать ученику как его собственный интерфейс</p>
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
                  <span class="portal-token">${student.portalCode}</span>
                </div>
                <div>
                  <h3>${student.name}</h3>
                  <div class="homework-meta">${student.subject}</div>
                </div>
                <div class="info-list">
                  <div class="info-line"><span>Домашки</span><strong>${stats.homeworkOpen}</strong></div>
                  <div class="info-line"><span>Ближайший урок</span><strong>${stats.nextLesson || "Нет"}</strong></div>
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
    <section class="section-head">
      <div>
        <p class="eyebrow">Профиль ученика</p>
        <h2 class="section-title">${student.name}</h2>
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
          <h3 class="student-name">${student.name}</h3>
          <p class="student-subject">${student.subject}</p>
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
            <div class="info-line"><span>Телефон</span><strong>${student.phone || "Не указан"}</strong></div>
            <div class="info-line"><span>Ставка</span><strong>${formatMoney(student.rate)}</strong></div>
            <div class="info-line"><span>Цель</span><strong>${student.goal || "Без цели"}</strong></div>
            <div class="info-line"><span>Код кабинета</span><strong>${student.portalCode}</strong></div>
          </div>
          <div>
            <p class="eyebrow">Заметки</p>
            <p>${student.notes || "Пока без заметок."}</p>
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
                            <div class="timeline-meta">${item.comment || "Без комментария"}</div>
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
              <p class="section-subtitle">Расписание и домашняя работа в одном блоке</p>
            </div>
          </div>
          <div class="list">
            ${
              lessons.length
                ? lessons
                    .slice(0, 4)
                    .map(
                      (lesson) => `
                        <article class="timeline-item is-compact">
                          <div>
                            <strong>${formatLessonDate(lesson.date, lesson.time)}</strong>
                            <div class="timeline-meta">${lesson.topic || "Без темы"}</div>
                          </div>
                          <div>
                            <span class="badge ${lesson.status === "cancelled" ? "is-danger" : lesson.status === "done" ? "is-success" : ""}">
                              ${lessonStatusLabel(lesson.status)}
                            </span>
                          </div>
                        </article>
                      `
                    )
                    .join("")
                : '<div class="empty-state">Занятий пока нет.</div>'
            }
            ${
              homeworks.length
                ? homeworks
                    .slice(0, 4)
                    .map(
                      (homework) => `
                        <article class="timeline-item is-compact">
                          <div>
                            <strong>${homework.title}</strong>
                            <div class="timeline-meta">до ${formatDate(homework.dueDate)}</div>
                          </div>
                          <div>
                            <span class="badge ${homework.status === "reviewed" ? "is-success" : homework.status === "rework" ? "is-danger" : ""}">
                              ${homeworkStatusLabel(homework.status)}
                            </span>
                          </div>
                        </article>
                      `
                    )
                    .join("")
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
    <section class="portal-hero">
      <div class="section-head">
        <div>
          <p class="eyebrow">Личный кабинет ученика</p>
          <h2 class="hero-title">${student.name}</h2>
          <p class="hero-copy">
            Здесь ученик видит ближайшие занятия, домашние задания, комментарии преподавателя и текущий учебный ритм.
          </p>
        </div>
        <div class="inline-actions">
          <button class="ghost-btn" id="cabinetBackBtn">К кабинетам</button>
          <span class="portal-token">${student.portalCode}</span>
        </div>
      </div>
    </section>

    <section class="metrics-grid">
      ${metricCard("Остаток уроков", student.lessonsLeft, "Оплаченные занятия")}
      ${metricCard("Баланс", formatMoney(student.balance), "Текущий доступный остаток")}
      ${metricCard("Прогресс ДЗ", `${stats.averageProgress}%`, "Средний прогресс по заданиям")}
      ${metricCard("Следующий урок", stats.nextLesson || "Нет", "Ближайшая запись в расписании")}
    </section>

    <section class="portal-layout">
      <div class="stack">
        <article class="panel">
          <h3 class="section-title">О курсе</h3>
          <div class="info-list">
            <div class="info-line"><span>Предмет</span><strong>${student.subject}</strong></div>
            <div class="info-line"><span>Цель</span><strong>${student.goal || "Уточняется"}</strong></div>
            <div class="info-line"><span>Контакт</span><strong>${student.phone || "Через преподавателя"}</strong></div>
          </div>
        </article>

        <article class="panel">
          <h3 class="section-title">Комментарий преподавателя</h3>
          <p class="muted-copy">${student.notes || "Здесь преподаватель может оставлять мотивационные заметки и ориентиры по работе."}</p>
        </article>
      </div>

      <div class="stack">
        <article class="panel">
          <div class="section-head">
            <div>
              <h3 class="section-title">Ближайшие занятия</h3>
              <p class="section-subtitle">То, к чему стоит подготовиться сейчас</p>
            </div>
          </div>
          <div class="list">
            ${
              lessons.length
                ? lessons.map(
                    (lesson) => `
                      <article class="timeline-item">
                        <div>
                          <strong>${formatLessonDate(lesson.date, lesson.time)}</strong>
                          <div class="timeline-meta">${lesson.topic || "Без темы"}</div>
                        </div>
                        <div class="timeline-meta">${lesson.duration} мин</div>
                      </article>
                    `
                  ).join("")
                : '<div class="empty-state">Пока нет записанных уроков.</div>'
            }
          </div>
        </article>

        <article class="panel">
          <div class="section-head">
            <div>
              <h3 class="section-title">Домашние задания</h3>
              <p class="section-subtitle">Что уже выдано и какой статус у каждой работы</p>
            </div>
          </div>
          <div class="list">
            ${
              homeworks.length
                ? homeworks.map(
                    (item) => `
                      <article class="homework-card">
                        <div>
                          <h4>${item.title}</h4>
                          <div class="homework-meta">${homeworkStatusLabel(item.status)} • до ${formatDate(item.dueDate)}</div>
                        </div>
                        <div class="muted-copy">${item.description || "Описание пока не добавлено."}</div>
                        <div class="progress-track">
                          <div class="progress-fill" style="width: ${clampProgress(item.progress)}%"></div>
                        </div>
                        <div class="muted-copy">${item.teacherNote || "Комментарий преподавателя появится после проверки."}</div>
                      </article>
                    `
                  ).join("")
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
    <section class="panel">
      <div class="section-head">
        <div>
          <p class="eyebrow">Недельный обзор</p>
          <h2 class="section-title">Календарь</h2>
          <p class="section-subtitle">Ближайшие занятия по всей базе учеников</p>
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
                              ${student?.name || "Ученик"}
                              <div class="timeline-meta">${student?.subject || ""}</div>
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
    button.addEventListener("click", () => deleteStudent(button.dataset.deleteStudent));
  });
}

function bindHomeworkView() {
  document.getElementById("homeworkAddBtn")?.addEventListener("click", () => openHomeworkModal());
  document.getElementById("homeworkOnlySubmitted")?.addEventListener("click", () => {
    state.homeworkFilter = state.homeworkFilter === "submitted-only" ? "all" : "submitted-only";
    render();
  });

  appView.querySelectorAll("[data-homework-status]").forEach((button) => {
    button.addEventListener("click", () => {
      const [homeworkId, nextStatus] = button.dataset.homeworkStatus.split(":");
      const homework = findHomework(homeworkId);
      if (!homework) return;
      homework.status = nextStatus;
      if (nextStatus === "reviewed" && homework.progress < 100) homework.progress = 100;
      persist();
      render();
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

function bindCalendarView() {}

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

  form.addEventListener("submit", (event) => {
    event.preventDefault();
    const formData = new FormData(form);
    const payload = {
      name: String(formData.get("name")).trim(),
      subject: String(formData.get("subject")).trim(),
      rate: Number(formData.get("rate")),
      phone: String(formData.get("phone")).trim(),
      goal: String(formData.get("goal")).trim(),
      notes: String(formData.get("notes")).trim(),
    };

    if (!payload.name || !payload.subject || !payload.rate) return;

    if (student) {
      Object.assign(student, payload);
    } else {
      state.data.students.unshift({
        id: makeId(),
        portalCode: makePortalCode(payload.name),
        ...payload,
        balance: 0,
        lessonsLeft: 0,
        createdAt: new Date().toISOString(),
      });
    }

    persist();
    render();
    closeModal();
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

  form.addEventListener("submit", (event) => {
    event.preventDefault();
    const formData = new FormData(form);
    const amount = Number(formData.get("amount"));
    if (!amount) return;

    state.data.transactions.unshift({
      id: makeId(),
      studentId,
      amount,
      date: String(formData.get("date")),
      comment: String(formData.get("comment")).trim(),
    });

    student.balance += amount;
    student.lessonsLeft += Math.floor(amount / student.rate);

    persist();
    render();
    closeModal();
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

  form.addEventListener("submit", (event) => {
    event.preventDefault();
    const formData = new FormData(form);
    const status = String(formData.get("status"));

    state.data.lessons.unshift({
      id: makeId(),
      studentId,
      date: String(formData.get("date")),
      time: String(formData.get("time")),
      duration: Number(formData.get("duration")),
      status,
      topic: String(formData.get("topic")).trim(),
    });

    if (status === "done" && student.lessonsLeft > 0) {
      student.lessonsLeft -= 1;
      student.balance = Math.max(0, student.balance - student.rate);
    }

    persist();
    render();
    closeModal();
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

  form.addEventListener("submit", (event) => {
    event.preventDefault();
    const formData = new FormData(form);
    const payload = {
      title: String(formData.get("title")).trim(),
      dueDate: String(formData.get("dueDate")),
      status: String(formData.get("status")),
      progress: clampProgress(Number(formData.get("progress"))),
      description: String(formData.get("description")).trim(),
      teacherNote: String(formData.get("teacherNote")).trim(),
    };

    if (!payload.title || !payload.dueDate || !student) return;

    if (homework) {
      Object.assign(homework, payload);
    } else {
      state.data.homeworks.unshift({
        id: makeId(),
        studentId: student.id,
        ...payload,
      });
    }

    persist();
    render();
    closeModal();
  });

  showModal();
}

function deleteStudent(studentId) {
  const student = findStudent(studentId);
  if (!student) return;
  if (!window.confirm(`Удалить ученика ${student.name}?`)) return;

  state.data.students = state.data.students.filter((item) => item.id !== studentId);
  state.data.transactions = state.data.transactions.filter((item) => item.studentId !== studentId);
  state.data.lessons = state.data.lessons.filter((item) => item.studentId !== studentId);
  state.data.homeworks = state.data.homeworks.filter((item) => item.studentId !== studentId);

  if (state.selectedStudentId === studentId) {
    state.selectedStudentId = null;
    state.currentView = "students";
  }

  persist();
  render();
}

function loadData() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) return JSON.parse(raw);
  } catch (error) {
    console.error("Не удалось прочитать localStorage", error);
  }
  return createSeedData();
}

function persist() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state.data));
}

function createSeedData() {
  const today = new Date();

  const plusDays = (days, time) => {
    const target = new Date(today);
    target.setDate(today.getDate() + days);
    target.setHours(0, 0, 0, 0);
    return {
      date: toISODate(target),
      time,
    };
  };

  return {
    students: [
      {
        id: "student-1",
        portalCode: "ANNA-241",
        name: "Анна Соколова",
        subject: "Математика",
        rate: 1800,
        balance: 5400,
        lessonsLeft: 3,
        phone: "+7 999 123-45-67",
        goal: "Подготовка к ЕГЭ на 85+",
        notes: "Сильная мотивация. Лучше заходят короткие задания и разбор ошибок в начале урока.",
        createdAt: today.toISOString(),
      },
      {
        id: "student-2",
        portalCode: "ILYA-815",
        name: "Илья Миронов",
        subject: "Английский",
        rate: 1500,
        balance: 1500,
        lessonsLeft: 1,
        phone: "+7 999 222-11-22",
        goal: "Разговорная практика для собеседований",
        notes: "Фокус на speaking, ответы без длинных пауз и уверенная самопрезентация.",
        createdAt: today.toISOString(),
      },
      {
        id: "student-3",
        portalCode: "MARIA-502",
        name: "Мария Ким",
        subject: "Физика",
        rate: 2000,
        balance: 8000,
        lessonsLeft: 4,
        phone: "",
        goal: "Олимпиадные задачи",
        notes: "Нужна повышенная сложность и меньше типовых задач.",
        createdAt: today.toISOString(),
      },
    ],
    transactions: [
      { id: "tr-1", studentId: "student-1", amount: 5400, date: todayISO(), comment: "Пакет из трех занятий" },
      { id: "tr-2", studentId: "student-2", amount: 3000, date: todayISO(), comment: "Аванс за две недели" },
      { id: "tr-3", studentId: "student-3", amount: 8000, date: todayISO(), comment: "Оплата за месяц" },
    ],
    lessons: [
      { id: "ls-1", studentId: "student-1", ...plusDays(0, "17:00"), duration: 60, status: "planned", topic: "Параметры и графики" },
      { id: "ls-2", studentId: "student-2", ...plusDays(1, "19:00"), duration: 60, status: "planned", topic: "HR interview" },
      { id: "ls-3", studentId: "student-3", ...plusDays(2, "16:30"), duration: 90, status: "planned", topic: "Электродинамика" },
      { id: "ls-4", studentId: "student-1", ...plusDays(-2, "17:00"), duration: 60, status: "done", topic: "Производные" },
    ],
    homeworks: [
      {
        id: "hw-1",
        studentId: "student-1",
        title: "Вариант 12, задачи 14-16",
        dueDate: toISODate(addDays(today, 1)),
        status: "submitted",
        progress: 90,
        description: "Решить три задачи с полным оформлением и коротким объяснением метода.",
        teacherNote: "Проверь аккуратность в последнем номере и распиши переходы.",
      },
      {
        id: "hw-2",
        studentId: "student-2",
        title: "Self-introduction for interviews",
        dueDate: toISODate(addDays(today, 2)),
        status: "rework",
        progress: 65,
        description: "Подготовить устную самопрезентацию на 90 секунд и записать ключевые фразы.",
        teacherNote: "Добавь примеры достижений и убери повторяющиеся конструкции.",
      },
      {
        id: "hw-3",
        studentId: "student-3",
        title: "Разбор задачи по электрическому полю",
        dueDate: toISODate(addDays(today, 4)),
        status: "reviewed",
        progress: 100,
        description: "Решение с альтернативным способом и проверкой размерности.",
        teacherNote: "Очень хороший ход решения, особенно в части проверки результата.",
      },
    ],
  };
}

function deriveData() {
  const students = filteredStudents();
  const homeworks = filteredHomeworks();
  const transactions = state.data.transactions;
  const lessons = state.data.lessons;
  const totalRevenue = transactions.reduce((sum, item) => sum + item.amount, 0);
  const averagePayment = transactions.length ? Math.round(totalRevenue / transactions.length) : 0;
  const totalLessonsLeft = state.data.students.reduce((sum, student) => sum + student.lessonsLeft, 0);
  const weekLessons = getWeekDays().reduce((count, day) => count + lessons.filter((item) => item.date === day.iso).length, 0);
  const activeStudents = state.data.students.filter((student) => student.lessonsLeft > 0).length;
  const reviewedHomeworkCount = state.data.homeworks.filter((item) => item.status === "reviewed").length;
  const upcomingLessons = lessons.filter((lesson) => lesson.status === "planned").sort(sortByDateTime);

  return {
    students,
    homeworks,
    transactions,
    lessons,
    totalRevenue,
    averagePayment,
    totalLessonsLeft,
    weekLessons,
    activeStudents,
    reviewedHomeworkCount,
    upcomingLessons,
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
    return [homework.title, homework.description, homework.teacherNote, student?.name, student?.subject].some((value) =>
      String(value || "").toLowerCase().includes(query)
    );
  });
}

function selectedStudent() {
  return findStudent(state.selectedStudentId);
}

function findStudent(studentId) {
  return state.data.students.find((student) => student.id === studentId);
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
    averageProgress,
  };
}

function showModal() {
  modalBackdrop.classList.remove("hidden");
}

function closeModal() {
  modalBackdrop.classList.add("hidden");
  modalRoot.innerHTML = "";
}

function metricCard(label, value, subline) {
  return `
    <article class="metric-card">
      <div class="metric-label">${label}</div>
      <div class="metric-value">${value}</div>
      <div class="metric-sub">${subline}</div>
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
    year: "numeric",
  });
}

function formatLessonDate(date, time) {
  return `${formatDate(date)}, ${time}`;
}

function getInitials(name) {
  return name
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

function toISODate(value) {
  const date = new Date(value);
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function addDays(date, days) {
  const next = new Date(date);
  next.setDate(next.getDate() + days);
  return next;
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
        month: "short",
      }),
    };
  });
}

function sortByDateTime(a, b) {
  return new Date(`${a.date}T${a.time}`) - new Date(`${b.date}T${b.time}`);
}

function sortByDateDesc(a, b) {
  return new Date(b.dueDate || b.date) - new Date(a.dueDate || a.date);
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

function makeId() {
  if (globalThis.crypto && typeof globalThis.crypto.randomUUID === "function") {
    return globalThis.crypto.randomUUID();
  }
  return `id-${Date.now()}-${Math.random().toString(16).slice(2, 8)}`;
}

function makePortalCode(name) {
  const stem = getInitials(name).replace(/[^A-ZА-Я]/gi, "").toUpperCase() || "STU";
  const suffix = Math.floor(100 + Math.random() * 900);
  return `${stem}-${suffix}`;
}