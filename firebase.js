import { firebaseWebConfig } from "./firebase-config.js";
import { initializeApp } from "https://www.gstatic.com/firebasejs/12.7.0/firebase-app.js";
import {
  createUserWithEmailAndPassword,
  getAuth,
  onAuthStateChanged,
  signInWithEmailAndPassword,
  signOut,
  updateProfile
} from "https://www.gstatic.com/firebasejs/12.7.0/firebase-auth.js";
import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  getFirestore,
  onSnapshot,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  where,
  writeBatch
} from "https://www.gstatic.com/firebasejs/12.7.0/firebase-firestore.js";

const STORAGE_KEY = "intellika-demo-v3";
const firebaseEnabled = isFirebaseConfigured(firebaseWebConfig);

let firebaseAuth = null;
let firebaseDb = null;
const localAuthListeners = new Set();

if (firebaseEnabled) {
  const app = initializeApp(firebaseWebConfig);
  firebaseAuth = getAuth(app);
  firebaseDb = getFirestore(app);
}

export const backend = firebaseEnabled ? createFirebaseBackend() : createLocalBackend();

function createFirebaseBackend() {
  return {
    mode: "firebase",
    label: "Firebase Cloud",
    onAuthChange(callback) {
      return onAuthStateChanged(firebaseAuth, callback);
    },
    async signIn(email, password) {
      await signInWithEmailAndPassword(firebaseAuth, email, password);
    },
    async signUp({ email, password, displayName }) {
      const credential = await createUserWithEmailAndPassword(firebaseAuth, email, password);
      if (displayName) {
        await updateProfile(credential.user, { displayName });
      }
      await setDoc(
        doc(firebaseDb, "users", credential.user.uid),
        {
          displayName: displayName || "",
          email,
          createdAt: serverTimestamp()
        },
        { merge: true }
      );
    },
    async signOut() {
      await signOut(firebaseAuth);
    },
    async loadData(user) {
      return loadFirestoreData(user.uid);
    },
    subscribeData(user, onData, onError) {
      const targets = ["students", "transactions", "lessons", "homeworks"];
      const store = {
        students: [],
        transactions: [],
        lessons: [],
        homeworks: []
      };

      const unsubscribers = targets.map((key) =>
        onSnapshot(
          collection(firebaseDb, "users", user.uid, key),
          (snapshot) => {
            store[key] = snapshot.docs.map((item) => ({
              id: item.id,
              ...item.data()
            }));
            onData({
              students: [...store.students],
              transactions: [...store.transactions],
              lessons: [...store.lessons],
              homeworks: [...store.homeworks]
            });
          },
          onError
        )
      );

      return () => {
        unsubscribers.forEach((unsubscribe) => unsubscribe());
      };
    },
    async resetDemoData(user) {
      await replaceUserData(user.uid, createSeedData());
    },
    async saveStudent(user, student) {
      const payload = sanitizeStudent(student);
      const studentsRef = collection(firebaseDb, "users", user.uid, "students");

      if (student.id) {
        await updateDoc(doc(studentsRef, student.id), payload);
        return student.id;
      }

      const created = await addDoc(studentsRef, {
        ...payload,
        createdAt: new Date().toISOString()
      });
      return created.id;
    },
    async savePayment(user, payment) {
      const transactionsRef = collection(firebaseDb, "users", user.uid, "transactions");
      const studentsRef = collection(firebaseDb, "users", user.uid, "students");
      await addDoc(transactionsRef, sanitizePayment(payment));

      const studentRef = doc(studentsRef, payment.studentId);
      const student = await loadStudent(studentRef);
      const nextBalance = Number(student.balance || 0) + Number(payment.amount || 0);
      const nextLessonsLeft =
        Number(student.lessonsLeft || 0) + Math.floor(Number(payment.amount || 0) / Number(student.rate || 1));

      await updateDoc(studentRef, {
        balance: nextBalance,
        lessonsLeft: nextLessonsLeft
      });
    },
    async saveLesson(user, lesson) {
      const lessonsRef = collection(firebaseDb, "users", user.uid, "lessons");
      const studentsRef = collection(firebaseDb, "users", user.uid, "students");
      await addDoc(lessonsRef, sanitizeLesson(lesson));

      if (lesson.status === "done") {
        const studentRef = doc(studentsRef, lesson.studentId);
        const student = await loadStudent(studentRef);
        await updateDoc(studentRef, {
          balance: Math.max(0, Number(student.balance || 0) - Number(student.rate || 0)),
          lessonsLeft: Math.max(0, Number(student.lessonsLeft || 0) - 1)
        });
      }
    },
    async saveHomework(user, homework) {
      const homeworkRef = collection(firebaseDb, "users", user.uid, "homeworks");
      const payload = sanitizeHomework(homework);

      if (homework.id) {
        await updateDoc(doc(homeworkRef, homework.id), payload);
        return homework.id;
      }

      const created = await addDoc(homeworkRef, payload);
      return created.id;
    },
    async updateHomeworkStatus(user, homeworkId, status) {
      const homeworkRef = doc(firebaseDb, "users", user.uid, "homeworks", homeworkId);
      const payload = { status };
      if (status === "reviewed") payload.progress = 100;
      await updateDoc(homeworkRef, payload);
    },
    async deleteStudent(user, studentId) {
      const batch = writeBatch(firebaseDb);
      batch.delete(doc(firebaseDb, "users", user.uid, "students", studentId));

      const related = await Promise.all([
        getDocs(query(collection(firebaseDb, "users", user.uid, "transactions"), where("studentId", "==", studentId))),
        getDocs(query(collection(firebaseDb, "users", user.uid, "lessons"), where("studentId", "==", studentId))),
        getDocs(query(collection(firebaseDb, "users", user.uid, "homeworks"), where("studentId", "==", studentId)))
      ]);

      related.forEach((snapshot) => {
        snapshot.forEach((item) => batch.delete(item.ref));
      });

      await batch.commit();
    }
  };
}

function createLocalBackend() {
  return {
    mode: "demo",
    label: "Demo Local",
    onAuthChange(callback) {
      const raw = localStorage.getItem(`${STORAGE_KEY}:session`);
      const user = raw ? JSON.parse(raw) : null;
      localAuthListeners.add(callback);
      queueMicrotask(() => callback(user));
      return () => localAuthListeners.delete(callback);
    },
    async signIn(email, password) {
      const users = readUsers();
      const found = users.find((item) => item.email === email && item.password === password);
      if (!found) {
        throw new Error("Неверная почта или пароль.");
      }
      const session = toSessionUser(found);
      localStorage.setItem(`${STORAGE_KEY}:session`, JSON.stringify(session));
      emitLocalAuthChange(session);
    },
    async signUp({ email, password, displayName }) {
      const users = readUsers();
      if (users.some((item) => item.email === email)) {
        throw new Error("Пользователь с такой почтой уже существует.");
      }

      const user = {
        uid: makeId(),
        email,
        password,
        displayName
      };

      users.push(user);
      localStorage.setItem(`${STORAGE_KEY}:users`, JSON.stringify(users));
      localStorage.setItem(`${STORAGE_KEY}:${user.uid}`, JSON.stringify(createSeedData()));
      const session = toSessionUser(user);
      localStorage.setItem(`${STORAGE_KEY}:session`, JSON.stringify(session));
      emitLocalAuthChange(session);
    },
    async signOut() {
      localStorage.removeItem(`${STORAGE_KEY}:session`);
      emitLocalAuthChange(null);
    },
    async loadData(user) {
      return readLocalData(user.uid);
    },
    subscribeData(user, onData) {
      const data = readLocalData(user.uid);
      queueMicrotask(() => onData(data));
      return () => {};
    },
    async resetDemoData(user) {
      writeLocalData(user.uid, createSeedData());
    },
    async saveStudent(user, student) {
      const data = readLocalData(user.uid);
      if (student.id) {
        const target = data.students.find((item) => item.id === student.id);
        Object.assign(target, sanitizeStudent(student));
      } else {
        data.students.unshift({
          id: makeId(),
          createdAt: new Date().toISOString(),
          ...sanitizeStudent(student)
        });
      }
      writeLocalData(user.uid, data);
    },
    async savePayment(user, payment) {
      const data = readLocalData(user.uid);
      data.transactions.unshift({ id: makeId(), ...sanitizePayment(payment) });
      const student = data.students.find((item) => item.id === payment.studentId);
      student.balance += Number(payment.amount || 0);
      student.lessonsLeft += Math.floor(Number(payment.amount || 0) / Number(student.rate || 1));
      writeLocalData(user.uid, data);
    },
    async saveLesson(user, lesson) {
      const data = readLocalData(user.uid);
      data.lessons.unshift({ id: makeId(), ...sanitizeLesson(lesson) });
      if (lesson.status === "done") {
        const student = data.students.find((item) => item.id === lesson.studentId);
        student.lessonsLeft = Math.max(0, student.lessonsLeft - 1);
        student.balance = Math.max(0, student.balance - student.rate);
      }
      writeLocalData(user.uid, data);
    },
    async saveHomework(user, homework) {
      const data = readLocalData(user.uid);
      if (homework.id) {
        const target = data.homeworks.find((item) => item.id === homework.id);
        Object.assign(target, sanitizeHomework(homework));
      } else {
        data.homeworks.unshift({ id: makeId(), ...sanitizeHomework(homework) });
      }
      writeLocalData(user.uid, data);
    },
    async updateHomeworkStatus(user, homeworkId, status) {
      const data = readLocalData(user.uid);
      const target = data.homeworks.find((item) => item.id === homeworkId);
      target.status = status;
      if (status === "reviewed") target.progress = 100;
      writeLocalData(user.uid, data);
    },
    async deleteStudent(user, studentId) {
      const data = readLocalData(user.uid);
      data.students = data.students.filter((item) => item.id !== studentId);
      data.transactions = data.transactions.filter((item) => item.studentId !== studentId);
      data.lessons = data.lessons.filter((item) => item.studentId !== studentId);
      data.homeworks = data.homeworks.filter((item) => item.studentId !== studentId);
      writeLocalData(user.uid, data);
    }
  };
}

function sanitizeStudent(student) {
  return {
    name: String(student.name || "").trim(),
    subject: String(student.subject || "").trim(),
    rate: Number(student.rate || 0),
    phone: String(student.phone || "").trim(),
    goal: String(student.goal || "").trim(),
    notes: String(student.notes || "").trim(),
    portalCode: student.portalCode || makePortalCode(student.name),
    balance: Number(student.balance || 0),
    lessonsLeft: Number(student.lessonsLeft || 0)
  };
}

function sanitizePayment(payment) {
  return {
    studentId: payment.studentId,
    amount: Number(payment.amount || 0),
    date: payment.date,
    comment: String(payment.comment || "").trim()
  };
}

function sanitizeLesson(lesson) {
  return {
    studentId: lesson.studentId,
    date: lesson.date,
    time: lesson.time,
    duration: Number(lesson.duration || 0),
    status: lesson.status,
    topic: String(lesson.topic || "").trim()
  };
}

function sanitizeHomework(homework) {
  return {
    studentId: homework.studentId,
    title: String(homework.title || "").trim(),
    dueDate: homework.dueDate,
    status: homework.status,
    progress: clampProgress(homework.progress),
    description: String(homework.description || "").trim(),
    teacherNote: String(homework.teacherNote || "").trim()
  };
}

async function replaceUserData(uid, data) {
  const sections = ["students", "transactions", "lessons", "homeworks"];
  const batch = writeBatch(firebaseDb);

  for (const section of sections) {
    const collectionRef = collection(firebaseDb, "users", uid, section);
    const snapshot = await getDocs(collectionRef);
    snapshot.forEach((item) => batch.delete(item.ref));
  }

  await batch.commit();

  for (const section of sections) {
    for (const item of data[section]) {
      await setDoc(doc(collection(firebaseDb, "users", uid, section), item.id), item);
    }
  }
}

async function loadFirestoreData(uid) {
  const sections = ["students", "transactions", "lessons", "homeworks"];
  const result = {
    students: [],
    transactions: [],
    lessons: [],
    homeworks: []
  };

  await Promise.all(
    sections.map(async (section) => {
      const snapshot = await getDocs(collection(firebaseDb, "users", uid, section));
      result[section] = snapshot.docs.map((item) => ({
        id: item.id,
        ...item.data()
      }));
    })
  );

  return result;
}

async function loadStudent(studentRef) {
  const snapshot = await getDoc(studentRef);
  return snapshot.data();
}

function isFirebaseConfigured(config) {
  return Boolean(
    config &&
      config.enabled &&
      config.apiKey &&
      !config.apiKey.startsWith("PASTE_") &&
      config.projectId &&
      !config.projectId.startsWith("PASTE_")
  );
}

function readUsers() {
  try {
    return JSON.parse(localStorage.getItem(`${STORAGE_KEY}:users`) || "[]");
  } catch {
    return [];
  }
}

function toSessionUser(user) {
  return {
    uid: user.uid,
    email: user.email,
    displayName: user.displayName || ""
  };
}

function readLocalData(uid) {
  try {
    const raw = localStorage.getItem(`${STORAGE_KEY}:${uid}`);
    return raw ? JSON.parse(raw) : createSeedData();
  } catch {
    return createSeedData();
  }
}

function writeLocalData(uid, data) {
  localStorage.setItem(`${STORAGE_KEY}:${uid}`, JSON.stringify(data));
}

function emitLocalAuthChange(user) {
  localAuthListeners.forEach((listener) => listener(user));
}

function createSeedData() {
  const today = new Date();
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
        createdAt: today.toISOString()
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
        createdAt: today.toISOString()
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
        createdAt: today.toISOString()
      }
    ],
    transactions: [
      { id: "tr-1", studentId: "student-1", amount: 5400, date: todayISO(), comment: "Пакет из трех занятий" },
      { id: "tr-2", studentId: "student-2", amount: 3000, date: todayISO(), comment: "Аванс за две недели" },
      { id: "tr-3", studentId: "student-3", amount: 8000, date: todayISO(), comment: "Оплата за месяц" }
    ],
    lessons: [
      { id: "ls-1", studentId: "student-1", ...plusDays(0, "17:00"), duration: 60, status: "planned", topic: "Параметры и графики" },
      { id: "ls-2", studentId: "student-2", ...plusDays(1, "19:00"), duration: 60, status: "planned", topic: "HR interview" },
      { id: "ls-3", studentId: "student-3", ...plusDays(2, "16:30"), duration: 90, status: "planned", topic: "Электродинамика" },
      { id: "ls-4", studentId: "student-1", ...plusDays(-2, "17:00"), duration: 60, status: "done", topic: "Производные" }
    ],
    homeworks: [
      {
        id: "hw-1",
        studentId: "student-1",
        title: "Вариант 12, задачи 14-16",
        dueDate: plusDays(1, "00:00").date,
        status: "submitted",
        progress: 90,
        description: "Решить три задачи с полным оформлением и коротким объяснением метода.",
        teacherNote: "Проверь аккуратность в последнем номере и распиши переходы."
      },
      {
        id: "hw-2",
        studentId: "student-2",
        title: "Self-introduction for interviews",
        dueDate: plusDays(2, "00:00").date,
        status: "rework",
        progress: 65,
        description: "Подготовить устную самопрезентацию на 90 секунд и записать ключевые фразы.",
        teacherNote: "Добавь примеры достижений и убери повторяющиеся конструкции."
      },
      {
        id: "hw-3",
        studentId: "student-3",
        title: "Разбор задачи по электрическому полю",
        dueDate: plusDays(4, "00:00").date,
        status: "reviewed",
        progress: 100,
        description: "Решение с альтернативным способом и проверкой размерности.",
        teacherNote: "Очень хороший ход решения, особенно в части проверки результата."
      }
    ]
  };
}

function plusDays(days, time) {
  const base = new Date();
  base.setDate(base.getDate() + days);
  const [hours, minutes] = time.split(":");
  base.setHours(Number(hours), Number(minutes), 0, 0);
  return {
    date: toISODate(base),
    time
  };
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
  const source = String(name || "STU")
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0])
    .join("")
    .toUpperCase();
  const suffix = Math.floor(100 + Math.random() * 900);
  return `${source || "STU"}-${suffix}`;
}