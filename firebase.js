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
  collectionGroup,
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

const STORAGE_KEY = "intellika-demo-v4";
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
      return onAuthStateChanged(firebaseAuth, async (authUser) => {
        if (!authUser) {
          callback(null);
          return;
        }
        callback(await loadFirebaseSession(authUser));
      });
    },
    async signIn(email, password) {
      await signInWithEmailAndPassword(firebaseAuth, email, password);
    },
    async signUpTeacher({ email, password, displayName }) {
      const credential = await createUserWithEmailAndPassword(firebaseAuth, email, password);
      if (displayName) await updateProfile(credential.user, { displayName });
      await setDoc(doc(firebaseDb, "users", credential.user.uid), {
        role: "teacher",
        displayName: displayName || "",
        email,
        createdAt: serverTimestamp()
      });
    },
    async signUpStudent({ email, password, displayName, accessCode }) {
      const link = await resolveFirebaseStudentByAccessCode(accessCode);
      if (!link) throw new Error("Код ученика не найден.");

      const credential = await createUserWithEmailAndPassword(firebaseAuth, email, password);
      if (displayName) await updateProfile(credential.user, { displayName });

      await setDoc(doc(firebaseDb, "users", credential.user.uid), {
        role: "student",
        email,
        displayName: displayName || link.student.name,
        teacherId: link.teacherId,
        studentId: link.studentId,
        createdAt: serverTimestamp()
      });

      await updateDoc(doc(firebaseDb, "users", link.teacherId, "students", link.studentId), {
        studentAuthUid: credential.user.uid,
        studentEmail: email
      });
    },
    async signOut() {
      await signOut(firebaseAuth);
    },
    async loadData(user) {
      return user.role === "teacher" ? loadTeacherData(user.uid) : loadStudentData(user.teacherId, user.studentId);
    },
    subscribeData(user, onData, onError) {
      if (user.role === "teacher") {
        return subscribeTeacherData(user.uid, onData, onError);
      }
      return subscribeStudentData(user.teacherId, user.studentId, onData, onError);
    },
    async resetDemoData(user) {
      ensureTeacher(user);
      await replaceTeacherData(user.uid, createSeedData());
    },
    async saveStudent(user, student) {
      ensureTeacher(user);
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
      ensureTeacher(user);
      const transactionsRef = collection(firebaseDb, "users", user.uid, "transactions");
      const studentsRef = collection(firebaseDb, "users", user.uid, "students");
      await addDoc(transactionsRef, sanitizePayment(payment));

      const studentRef = doc(studentsRef, payment.studentId);
      const student = await loadDocData(studentRef);
      await updateDoc(studentRef, {
        balance: Number(student.balance || 0) + Number(payment.amount || 0),
        lessonsLeft:
          Number(student.lessonsLeft || 0) + Math.floor(Number(payment.amount || 0) / Number(student.rate || 1))
      });
    },
    async saveLesson(user, lesson) {
      ensureTeacher(user);
      await addDoc(collection(firebaseDb, "users", user.uid, "lessons"), sanitizeLesson(lesson));
      if (lesson.status === "done") {
        const studentRef = doc(firebaseDb, "users", user.uid, "students", lesson.studentId);
        const student = await loadDocData(studentRef);
        await updateDoc(studentRef, {
          lessonsLeft: Math.max(0, Number(student.lessonsLeft || 0) - 1),
          balance: Math.max(0, Number(student.balance || 0) - Number(student.rate || 0))
        });
      }
    },
    async saveHomework(user, homework) {
      ensureTeacher(user);
      const payload = sanitizeHomework(homework);
      const collectionRef = collection(firebaseDb, "users", user.uid, "homeworks");

      if (homework.id) {
        await updateDoc(doc(collectionRef, homework.id), payload);
        return homework.id;
      }

      const created = await addDoc(collectionRef, payload);
      return created.id;
    },
    async updateHomeworkStatus(user, homeworkId, status) {
      const teacherId = user.role === "teacher" ? user.uid : user.teacherId;
      const homeworkRef = doc(firebaseDb, "users", teacherId, "homeworks", homeworkId);
      const payload = { status };
      if (status === "reviewed") payload.progress = 100;
      await updateDoc(homeworkRef, payload);
    },
    async deleteStudent(user, studentId) {
      ensureTeacher(user);
      const batch = writeBatch(firebaseDb);
      const studentRef = doc(firebaseDb, "users", user.uid, "students", studentId);
      const student = await loadDocData(studentRef);

      batch.delete(studentRef);

      const related = await Promise.all([
        getDocs(query(collection(firebaseDb, "users", user.uid, "transactions"), where("studentId", "==", studentId))),
        getDocs(query(collection(firebaseDb, "users", user.uid, "lessons"), where("studentId", "==", studentId))),
        getDocs(query(collection(firebaseDb, "users", user.uid, "homeworks"), where("studentId", "==", studentId)))
      ]);

      related.forEach((snapshot) => snapshot.forEach((item) => batch.delete(item.ref)));

      if (student?.studentAuthUid) {
        batch.delete(doc(firebaseDb, "users", student.studentAuthUid));
      }

      await batch.commit();
    }
  };
}

function createLocalBackend() {
  return {
    mode: "demo",
    label: "Demo Local",
    onAuthChange(callback) {
      const session = readLocalSession();
      localAuthListeners.add(callback);
      queueMicrotask(() => callback(session));
      return () => localAuthListeners.delete(callback);
    },
    async signIn(email, password) {
      const users = readUsers();
      const found = users.find((item) => item.email === email && item.password === password);
      if (!found) throw new Error("Неверная почта или пароль.");
      emitLocalAuthChange(toSessionUser(found));
    },
    async signUpTeacher({ email, password, displayName }) {
      const users = readUsers();
      if (users.some((item) => item.email === email)) throw new Error("Этот email уже зарегистрирован.");
      const user = { uid: makeId(), email, password, displayName, role: "teacher" };
      users.push(user);
      writeUsers(users);
      writeLocalTeacherData(user.uid, createSeedData());
      emitLocalAuthChange(toSessionUser(user));
    },
    async signUpStudent({ email, password, displayName, accessCode }) {
      const users = readUsers();
      if (users.some((item) => item.email === email)) throw new Error("Этот email уже зарегистрирован.");
      const link = resolveLocalStudentByAccessCode(accessCode);
      if (!link) throw new Error("Код ученика не найден.");

      const user = {
        uid: makeId(),
        email,
        password,
        displayName,
        role: "student",
        teacherId: link.teacherId,
        studentId: link.studentId
      };

      users.push(user);
      writeUsers(users);

      const data = readLocalTeacherData(link.teacherId);
      const student = data.students.find((item) => item.id === link.studentId);
      student.studentAuthUid = user.uid;
      student.studentEmail = email;
      writeLocalTeacherData(link.teacherId, data);

      emitLocalAuthChange(toSessionUser(user));
    },
    async signOut() {
      emitLocalAuthChange(null);
    },
    async loadData(user) {
      return user.role === "teacher"
        ? readLocalTeacherData(user.uid)
        : filterStudentData(readLocalTeacherData(user.teacherId), user.studentId);
    },
    subscribeData(user, onData) {
      queueMicrotask(async () => onData(await this.loadData(user)));
      return () => {};
    },
    async resetDemoData(user) {
      ensureTeacher(user);
      writeLocalTeacherData(user.uid, createSeedData());
    },
    async saveStudent(user, student) {
      ensureTeacher(user);
      const data = readLocalTeacherData(user.uid);
      if (student.id) {
        Object.assign(data.students.find((item) => item.id === student.id), sanitizeStudent(student));
      } else {
        data.students.unshift({ id: makeId(), createdAt: new Date().toISOString(), ...sanitizeStudent(student) });
      }
      writeLocalTeacherData(user.uid, data);
    },
    async savePayment(user, payment) {
      ensureTeacher(user);
      const data = readLocalTeacherData(user.uid);
      data.transactions.unshift({ id: makeId(), ...sanitizePayment(payment) });
      const student = data.students.find((item) => item.id === payment.studentId);
      student.balance += Number(payment.amount || 0);
      student.lessonsLeft += Math.floor(Number(payment.amount || 0) / Number(student.rate || 1));
      writeLocalTeacherData(user.uid, data);
    },
    async saveLesson(user, lesson) {
      ensureTeacher(user);
      const data = readLocalTeacherData(user.uid);
      data.lessons.unshift({ id: makeId(), ...sanitizeLesson(lesson) });
      if (lesson.status === "done") {
        const student = data.students.find((item) => item.id === lesson.studentId);
        student.lessonsLeft = Math.max(0, student.lessonsLeft - 1);
        student.balance = Math.max(0, student.balance - student.rate);
      }
      writeLocalTeacherData(user.uid, data);
    },
    async saveHomework(user, homework) {
      ensureTeacher(user);
      const data = readLocalTeacherData(user.uid);
      if (homework.id) {
        Object.assign(data.homeworks.find((item) => item.id === homework.id), sanitizeHomework(homework));
      } else {
        data.homeworks.unshift({ id: makeId(), ...sanitizeHomework(homework) });
      }
      writeLocalTeacherData(user.uid, data);
    },
    async updateHomeworkStatus(user, homeworkId, status) {
      const teacherId = user.role === "teacher" ? user.uid : user.teacherId;
      const data = readLocalTeacherData(teacherId);
      const target = data.homeworks.find((item) => item.id === homeworkId);
      target.status = status;
      if (status === "reviewed") target.progress = 100;
      writeLocalTeacherData(teacherId, data);
    },
    async deleteStudent(user, studentId) {
      ensureTeacher(user);
      const data = readLocalTeacherData(user.uid);
      const student = data.students.find((item) => item.id === studentId);
      data.students = data.students.filter((item) => item.id !== studentId);
      data.transactions = data.transactions.filter((item) => item.studentId !== studentId);
      data.lessons = data.lessons.filter((item) => item.studentId !== studentId);
      data.homeworks = data.homeworks.filter((item) => item.studentId !== studentId);
      writeLocalTeacherData(user.uid, data);

      if (student?.studentAuthUid) {
        const users = readUsers().filter((item) => item.uid !== student.studentAuthUid);
        writeUsers(users);
      }
    }
  };
}

async function loadFirebaseSession(authUser) {
  const userDoc = await getDoc(doc(firebaseDb, "users", authUser.uid));
  const profile = userDoc.exists() ? userDoc.data() : {};
  return {
    uid: authUser.uid,
    email: authUser.email || profile.email || "",
    displayName: profile.displayName || authUser.displayName || "",
    role: profile.role || "teacher",
    teacherId: profile.teacherId || authUser.uid,
    studentId: profile.studentId || null
  };
}

async function resolveFirebaseStudentByAccessCode(accessCode) {
  const snapshot = await getDocs(query(collectionGroup(firebaseDb, "students"), where("accessCode", "==", accessCode)));
  const match = snapshot.docs[0];
  if (!match) return null;
  return {
    teacherId: match.ref.parent.parent.id,
    studentId: match.id,
    student: match.data()
  };
}

async function loadTeacherData(teacherId) {
  const sections = ["students", "transactions", "lessons", "homeworks"];
  const result = emptyData();
  await Promise.all(
    sections.map(async (section) => {
      const snapshot = await getDocs(collection(firebaseDb, "users", teacherId, section));
      result[section] = snapshot.docs.map((item) => ({ id: item.id, ...item.data() }));
    })
  );
  return result;
}

async function loadStudentData(teacherId, studentId) {
  const teacher = await loadTeacherData(teacherId);
  return filterStudentData(teacher, studentId);
}

function subscribeTeacherData(teacherId, onData, onError) {
  const targets = ["students", "transactions", "lessons", "homeworks"];
  const store = emptyData();

  const unsubscribers = targets.map((key) =>
    onSnapshot(
      collection(firebaseDb, "users", teacherId, key),
      (snapshot) => {
        store[key] = snapshot.docs.map((item) => ({ id: item.id, ...item.data() }));
        onData({ ...store, students: [...store.students], transactions: [...store.transactions], lessons: [...store.lessons], homeworks: [...store.homeworks] });
      },
      onError
    )
  );

  return () => unsubscribers.forEach((unsubscribe) => unsubscribe());
}

function subscribeStudentData(teacherId, studentId, onData, onError) {
  return subscribeTeacherData(
    teacherId,
    (data) => onData(filterStudentData(data, studentId)),
    onError
  );
}

function filterStudentData(data, studentId) {
  return {
    students: data.students.filter((item) => item.id === studentId),
    transactions: data.transactions.filter((item) => item.studentId === studentId),
    lessons: data.lessons.filter((item) => item.studentId === studentId),
    homeworks: data.homeworks.filter((item) => item.studentId === studentId)
  };
}

async function replaceTeacherData(uid, data) {
  const sections = ["students", "transactions", "lessons", "homeworks"];
  const batch = writeBatch(firebaseDb);
  for (const section of sections) {
    const snapshot = await getDocs(collection(firebaseDb, "users", uid, section));
    snapshot.forEach((item) => batch.delete(item.ref));
  }
  await batch.commit();
  for (const section of sections) {
    for (const item of data[section]) {
      await setDoc(doc(collection(firebaseDb, "users", uid, section), item.id), item);
    }
  }
}

async function loadDocData(ref) {
  return (await getDoc(ref)).data();
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
    accessCode: student.accessCode || makeAccessCode(student.name),
    balance: Number(student.balance || 0),
    lessonsLeft: Number(student.lessonsLeft || 0),
    studentAuthUid: student.studentAuthUid || null,
    studentEmail: student.studentEmail || ""
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
    teacherNote: String(homework.teacherNote || "").trim(),
    imageUrl: String(homework.imageUrl || "").trim()
  };
}

function readLocalSession() {
  try {
    return JSON.parse(localStorage.getItem(`${STORAGE_KEY}:session`) || "null");
  } catch {
    return null;
  }
}

function emitLocalAuthChange(user) {
  if (user) localStorage.setItem(`${STORAGE_KEY}:session`, JSON.stringify(user));
  else localStorage.removeItem(`${STORAGE_KEY}:session`);
  localAuthListeners.forEach((listener) => listener(user));
}

function readUsers() {
  try {
    return JSON.parse(localStorage.getItem(`${STORAGE_KEY}:users`) || "[]");
  } catch {
    return [];
  }
}

function writeUsers(users) {
  localStorage.setItem(`${STORAGE_KEY}:users`, JSON.stringify(users));
}

function readLocalTeacherData(uid) {
  try {
    const raw = localStorage.getItem(`${STORAGE_KEY}:teacher:${uid}`);
    return raw ? JSON.parse(raw) : createSeedData();
  } catch {
    return createSeedData();
  }
}

function writeLocalTeacherData(uid, data) {
  localStorage.setItem(`${STORAGE_KEY}:teacher:${uid}`, JSON.stringify(data));
}

function resolveLocalStudentByAccessCode(accessCode) {
  const users = readUsers().filter((item) => item.role === "teacher");
  for (const teacher of users) {
    const data = readLocalTeacherData(teacher.uid);
    const student = data.students.find((item) => item.accessCode === accessCode);
    if (student) {
      return {
        teacherId: teacher.uid,
        studentId: student.id,
        student
      };
    }
  }
  return null;
}

function toSessionUser(user) {
  return {
    uid: user.uid,
    email: user.email,
    displayName: user.displayName || "",
    role: user.role || "teacher",
    teacherId: user.teacherId || user.uid,
    studentId: user.studentId || null
  };
}

function ensureTeacher(user) {
  if (user.role !== "teacher") {
    throw new Error("Эта операция доступна только преподавателю.");
  }
}

function emptyData() {
  return { students: [], transactions: [], lessons: [], homeworks: [] };
}

function createSeedData() {
  const today = new Date();
  return {
    students: [
      {
        id: "student-1",
        portalCode: "ANNA-241",
        accessCode: "STU-241",
        name: "Анна Соколова",
        subject: "Математика",
        rate: 1800,
        balance: 5400,
        lessonsLeft: 3,
        phone: "+7 999 123-45-67",
        goal: "Подготовка к ЕГЭ на 85+",
        notes: "Сильная мотивация. Лучше заходят короткие задания и разбор ошибок в начале урока.",
        createdAt: today.toISOString(),
        studentAuthUid: null,
        studentEmail: ""
      },
      {
        id: "student-2",
        portalCode: "ILYA-815",
        accessCode: "STU-815",
        name: "Илья Миронов",
        subject: "Английский",
        rate: 1500,
        balance: 1500,
        lessonsLeft: 1,
        phone: "+7 999 222-11-22",
        goal: "Разговорная практика для собеседований",
        notes: "Фокус на speaking, ответы без длинных пауз и уверенная самопрезентация.",
        createdAt: today.toISOString(),
        studentAuthUid: null,
        studentEmail: ""
      }
    ],
    transactions: [
      { id: "tr-1", studentId: "student-1", amount: 5400, date: todayISO(), comment: "Пакет из трех занятий" }
    ],
    lessons: [
      { id: "ls-1", studentId: "student-1", ...plusDays(1, "17:00"), duration: 60, status: "planned", topic: "Параметры и графики" },
      { id: "ls-2", studentId: "student-2", ...plusDays(2, "19:00"), duration: 60, status: "planned", topic: "HR interview" }
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
        teacherNote: "Проверь аккуратность в последнем номере и распиши переходы.",
        imageUrl: ""
      }
    ]
  };
}

function plusDays(days, time) {
  const base = new Date();
  base.setDate(base.getDate() + days);
  const [hours, minutes] = time.split(":");
  base.setHours(Number(hours), Number(minutes), 0, 0);
  return { date: toISODate(base), time };
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
  const source = String(name || "STU").split(" ").filter(Boolean).slice(0, 2).map((part) => part[0]).join("").toUpperCase();
  const suffix = Math.floor(100 + Math.random() * 900);
  return `${source || "STU"}-${suffix}`;
}

function makeAccessCode(name) {
  const source = String(name || "STU").replaceAll(/\s+/g, "").slice(0, 3).toUpperCase();
  const suffix = Math.floor(100 + Math.random() * 900);
  return `${source || "STU"}-${suffix}`;
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
