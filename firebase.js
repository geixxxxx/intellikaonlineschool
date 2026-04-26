import { firebaseWebConfig } from "./firebase-config.js";
import { deleteApp, initializeApp } from "https://www.gstatic.com/firebasejs/12.7.0/firebase-app.js";
import {
  createUserWithEmailAndPassword,
  deleteUser,
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
      await ensureFirebaseAccountDoc(credential.user, {
        role: "tutor",
        displayName: displayName || "",
        email,
        tutorId: credential.user.uid,
        studentId: null,
        disabled: false
      });
    },
    async signOut() {
      await signOut(firebaseAuth);
    },
    async loadSession(user) {
      return loadFirebaseSession(user);
    },
    async loadData(user, account) {
      return loadFirebaseData(account || (await loadFirebaseSession(user)));
    },
    subscribeData(user, account, onData, onError) {
      return subscribeFirebaseData(account, onData, onError);
    },
    async resetDemoData(user, account) {
      const targetAccount = account || (await loadFirebaseSession(user));
      requireTutorAccount(targetAccount);
      await replaceUserData(targetAccount.tutorId, createSeedData());
    },
    async saveStudent(user, student) {
      const account = await loadFirebaseSession(user);
      requireTutorAccount(account);
      const payload = sanitizeStudent(student);
      const studentsRef = collection(firebaseDb, "users", account.tutorId, "students");

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
    async createStudentAccount(user, studentId, credentials, studentSeed = null) {
      const account = await loadFirebaseSession(user);
      requireTutorAccount(account);
      return createFirebaseStudentAccount(account.tutorId, studentId, credentials, studentSeed);
    },
    async savePayment(user, payment) {
      const account = await loadFirebaseSession(user);
      requireTutorAccount(account);
      const transactionsRef = collection(firebaseDb, "users", account.tutorId, "transactions");
      const studentsRef = collection(firebaseDb, "users", account.tutorId, "students");

      await addDoc(transactionsRef, {
        ...sanitizePayment(payment),
        createdAt: new Date().toISOString()
      });

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
      const account = await loadFirebaseSession(user);
      requireTutorAccount(account);
      const lessonsRef = collection(firebaseDb, "users", account.tutorId, "lessons");
      const studentsRef = collection(firebaseDb, "users", account.tutorId, "students");

      await addDoc(lessonsRef, {
        ...sanitizeLesson(lesson),
        createdAt: new Date().toISOString()
      });

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
      const account = await loadFirebaseSession(user);
      requireTutorAccount(account);
      const homeworkRef = collection(firebaseDb, "users", account.tutorId, "homeworks");
      const payload = sanitizeHomework(homework);

      if (homework.id) {
        await updateDoc(doc(homeworkRef, homework.id), payload);
        return homework.id;
      }

      const created = await addDoc(homeworkRef, {
        ...payload,
        createdAt: new Date().toISOString()
      });
      return created.id;
    },
    async updateHomeworkStatus(user, homeworkId, status) {
      const account = await loadFirebaseSession(user);
      requireTutorAccount(account);
      const homeworkRef = doc(firebaseDb, "users", account.tutorId, "homeworks", homeworkId);
      const payload = { status };
      if (status === "reviewed") payload.progress = 100;
      await updateDoc(homeworkRef, payload);
    },
    async saveVideo(user, video) {
      const account = await loadFirebaseSession(user);
      requireTutorAccount(account);
      const videosRef = collection(firebaseDb, "users", account.tutorId, "videos");
      const payload = sanitizeVideo(video);

      if (video.id) {
        await updateDoc(doc(videosRef, video.id), payload);
        return video.id;
      }

      const created = await addDoc(videosRef, {
        ...payload,
        createdAt: new Date().toISOString()
      });
      return created.id;
    },
    async deleteStudent(user, studentId) {
      const account = await loadFirebaseSession(user);
      requireTutorAccount(account);
      const studentsRef = collection(firebaseDb, "users", account.tutorId, "students");
      const studentRef = doc(studentsRef, studentId);
      const student = await loadStudent(studentRef);

      if (student?.accountUid) {
        await setDoc(
          doc(firebaseDb, "users", student.accountUid),
          {
            role: "student",
            tutorId: account.tutorId,
            studentId: null,
            displayName: student.name || "",
            email: student.email || "",
            disabled: true,
            archivedStudentName: student.name || ""
          },
          { merge: true }
        );
      }

      const batch = writeBatch(firebaseDb);
      batch.delete(studentRef);

      const related = await Promise.all([
        getDocs(query(collection(firebaseDb, "users", account.tutorId, "transactions"), where("studentId", "==", studentId))),
        getDocs(query(collection(firebaseDb, "users", account.tutorId, "lessons"), where("studentId", "==", studentId))),
        getDocs(query(collection(firebaseDb, "users", account.tutorId, "homeworks"), where("studentId", "==", studentId))),
        getDocs(query(collection(firebaseDb, "users", account.tutorId, "videos"), where("studentId", "==", studentId)))
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
        displayName,
        role: "tutor",
        tutorId: null,
        studentId: null,
        disabled: false
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
    async loadSession(user) {
      return normalizeLocalAccount(user);
    },
    async loadData(user, account) {
      const targetAccount = account || normalizeLocalAccount(user);
      return loadLocalDataForAccount(targetAccount);
    },
    subscribeData(user, account, onData) {
      queueMicrotask(() => onData(loadLocalDataForAccount(account || normalizeLocalAccount(user))));
      return () => {};
    },
    async resetDemoData(user, account) {
      const targetAccount = account || normalizeLocalAccount(user);
      requireTutorAccount(targetAccount);
      writeLocalData(targetAccount.tutorId, createSeedData());
    },
    async saveStudent(user, student) {
      const account = normalizeLocalAccount(user);
      requireTutorAccount(account);
      const data = readLocalData(account.tutorId);
      const payload = sanitizeStudent(student);

      if (student.id) {
        const target = data.students.find((item) => item.id === student.id);
        Object.assign(target, payload);
      } else {
        data.students.unshift({
          id: makeId(),
          createdAt: new Date().toISOString(),
          ...payload
        });
      }

      writeLocalData(account.tutorId, data);
      return student.id || data.students[0].id;
    },
    async createStudentAccount(user, studentId, credentials) {
      const account = normalizeLocalAccount(user);
      requireTutorAccount(account);
      const users = readUsers();
      if (users.some((item) => item.email === credentials.email)) {
        throw new Error("Этот email уже используется другим аккаунтом.");
      }

      const data = readLocalData(account.tutorId);
      const student = data.students.find((item) => item.id === studentId);
      if (!student) {
        throw new Error("Профиль ученика не найден.");
      }
      if (student.accountUid) {
        throw new Error("Для этого ученика кабинет уже создан.");
      }

      const studentUser = {
        uid: makeId(),
        email: credentials.email,
        password: credentials.password,
        displayName: credentials.displayName || student.name || "",
        role: "student",
        tutorId: account.tutorId,
        studentId,
        disabled: false
      };

      users.push(studentUser);
      localStorage.setItem(`${STORAGE_KEY}:users`, JSON.stringify(users));

      student.email = credentials.email;
      student.accountUid = studentUser.uid;
      student.hasPortalAccess = true;
      student.accountCreatedAt = new Date().toISOString();
      writeLocalData(account.tutorId, data);

      return studentUser.uid;
    },
    async savePayment(user, payment) {
      const account = normalizeLocalAccount(user);
      requireTutorAccount(account);
      const data = readLocalData(account.tutorId);
      data.transactions.unshift({
        id: makeId(),
        createdAt: new Date().toISOString(),
        ...sanitizePayment(payment)
      });
      const student = data.students.find((item) => item.id === payment.studentId);
      student.balance += Number(payment.amount || 0);
      student.lessonsLeft += Math.floor(Number(payment.amount || 0) / Number(student.rate || 1));
      writeLocalData(account.tutorId, data);
    },
    async saveLesson(user, lesson) {
      const account = normalizeLocalAccount(user);
      requireTutorAccount(account);
      const data = readLocalData(account.tutorId);
      data.lessons.unshift({
        id: makeId(),
        createdAt: new Date().toISOString(),
        ...sanitizeLesson(lesson)
      });
      if (lesson.status === "done") {
        const student = data.students.find((item) => item.id === lesson.studentId);
        student.lessonsLeft = Math.max(0, Number(student.lessonsLeft || 0) - 1);
        student.balance = Math.max(0, Number(student.balance || 0) - Number(student.rate || 0));
      }
      writeLocalData(account.tutorId, data);
    },
    async saveHomework(user, homework) {
      const account = normalizeLocalAccount(user);
      requireTutorAccount(account);
      const data = readLocalData(account.tutorId);
      const payload = sanitizeHomework(homework);
      if (homework.id) {
        const target = data.homeworks.find((item) => item.id === homework.id);
        Object.assign(target, payload);
      } else {
        data.homeworks.unshift({
          id: makeId(),
          createdAt: new Date().toISOString(),
          ...payload
        });
      }
      writeLocalData(account.tutorId, data);
      return homework.id || data.homeworks[0].id;
    },
    async updateHomeworkStatus(user, homeworkId, status) {
      const account = normalizeLocalAccount(user);
      requireTutorAccount(account);
      const data = readLocalData(account.tutorId);
      const target = data.homeworks.find((item) => item.id === homeworkId);
      target.status = status;
      if (status === "reviewed") target.progress = 100;
      writeLocalData(account.tutorId, data);
    },
    async saveVideo(user, video) {
      const account = normalizeLocalAccount(user);
      requireTutorAccount(account);
      const data = readLocalData(account.tutorId);
      const payload = sanitizeVideo(video);
      if (video.id) {
        const target = data.videos.find((item) => item.id === video.id);
        Object.assign(target, payload);
      } else {
        data.videos.unshift({
          id: makeId(),
          createdAt: new Date().toISOString(),
          ...payload
        });
      }
      writeLocalData(account.tutorId, data);
      return video.id || data.videos[0].id;
    },
    async deleteStudent(user, studentId) {
      const account = normalizeLocalAccount(user);
      requireTutorAccount(account);
      const data = readLocalData(account.tutorId);
      const student = data.students.find((item) => item.id === studentId);

      if (student?.accountUid) {
        const users = readUsers();
        const linkedUser = users.find((item) => item.uid === student.accountUid);
        if (linkedUser) {
          linkedUser.disabled = true;
          linkedUser.studentId = null;
          linkedUser.archivedStudentName = student.name || "";
          localStorage.setItem(`${STORAGE_KEY}:users`, JSON.stringify(users));
        }
      }

      data.students = data.students.filter((item) => item.id !== studentId);
      data.transactions = data.transactions.filter((item) => item.studentId !== studentId);
      data.lessons = data.lessons.filter((item) => item.studentId !== studentId);
      data.homeworks = data.homeworks.filter((item) => item.studentId !== studentId);
      data.videos = data.videos.filter((item) => item.studentId !== studentId);
      writeLocalData(account.tutorId, data);
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
    lessonsLeft: Number(student.lessonsLeft || 0),
    email: String(student.email || "").trim(),
    accountUid: student.accountUid || null,
    hasPortalAccess: Boolean(student.accountUid || student.hasPortalAccess),
    accountCreatedAt: student.accountCreatedAt || null
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
    attachments: sanitizeAttachments(homework.attachments)
  };
}

function sanitizeVideo(video) {
  return {
    title: String(video.title || "").trim(),
    description: String(video.description || "").trim(),
    sourceUrl: String(video.sourceUrl || "").trim(),
    embedUrl: String(video.embedUrl || "").trim(),
    studentId: video.studentId || null,
    audience: video.studentId ? "student" : "all"
  };
}

function sanitizeAttachments(attachments) {
  return Array.isArray(attachments)
    ? attachments
        .filter((item) => item && item.dataUrl)
        .map((item) => ({
          id: item.id || makeId(),
          name: String(item.name || "photo.jpg"),
          dataUrl: String(item.dataUrl),
          mimeType: String(item.mimeType || "image/jpeg")
        }))
    : [];
}

async function replaceUserData(uid, data) {
  const sections = ["students", "transactions", "lessons", "homeworks", "videos"];
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

async function loadFirebaseSession(user) {
  const userRef = doc(firebaseDb, "users", user.uid);
  let snapshot = null;
  let data = null;

  try {
    snapshot = await getDoc(userRef);
    data = snapshot.exists() ? snapshot.data() : null;
  } catch (error) {
    if (!isOfflineFirestoreError(error)) {
      throw error;
    }

    const cached = readCachedFirebaseAccount(user.uid);
    if (cached) {
      return cached;
    }

    return normalizeFirebaseAccount(user, null);
  }

  const normalized = normalizeFirebaseAccount(user, data);

  if (!snapshot.exists() || !data?.role || (!data?.tutorId && normalized.role === "tutor")) {
    await setDoc(
      userRef,
      {
        displayName: normalized.displayName,
        email: normalized.email,
        role: normalized.role,
        tutorId: normalized.role === "tutor" ? user.uid : normalized.tutorId,
        studentId: normalized.studentId,
        disabled: normalized.disabled,
        createdAt: data?.createdAt || new Date().toISOString()
      },
      { merge: true }
    );
  }

  cacheFirebaseAccount(normalized);
  return normalized;
}

async function loadFirebaseData(account) {
  if (!account) {
    return createEmptyData();
  }
  if (account.role === "student") {
    return loadFirebaseStudentData(account);
  }
  return loadFirestoreCollections(account.tutorId);
}

function subscribeFirebaseData(account, onData, onError) {
  if (!account) {
    queueMicrotask(() => onData(createEmptyData()));
    return () => {};
  }
  if (account.role === "student") {
    return subscribeFirebaseStudentData(account, onData, onError);
  }

  const targets = ["students", "transactions", "lessons", "homeworks", "videos"];
  const store = createEmptyData();

  const unsubscribers = targets.map((key) =>
    onSnapshot(
      collection(firebaseDb, "users", account.tutorId, key),
      (snapshot) => {
        store[key] = snapshot.docs.map((item) => ({
          id: item.id,
          ...item.data()
        }));
        onData({ ...store });
      },
      onError
    )
  );

  return () => {
    unsubscribers.forEach((unsubscribe) => unsubscribe());
  };
}

async function loadFirebaseStudentData(account) {
  const [studentSnapshot, lessonsSnapshot, homeworksSnapshot, sharedVideosSnapshot, personalVideosSnapshot] =
    await Promise.all([
      getDoc(doc(firebaseDb, "users", account.tutorId, "students", account.studentId)),
      getDocs(query(collection(firebaseDb, "users", account.tutorId, "lessons"), where("studentId", "==", account.studentId))),
      getDocs(query(collection(firebaseDb, "users", account.tutorId, "homeworks"), where("studentId", "==", account.studentId))),
      getDocs(query(collection(firebaseDb, "users", account.tutorId, "videos"), where("audience", "==", "all"))),
      getDocs(query(collection(firebaseDb, "users", account.tutorId, "videos"), where("studentId", "==", account.studentId)))
    ]);

  return {
    students: studentSnapshot.exists()
      ? [{ id: studentSnapshot.id, ...studentSnapshot.data() }]
      : [],
    transactions: [],
    lessons: lessonsSnapshot.docs.map(mapSnapshotDoc),
    homeworks: homeworksSnapshot.docs.map(mapSnapshotDoc),
    videos: mergeVideoSnapshots(sharedVideosSnapshot, personalVideosSnapshot)
  };
}

function subscribeFirebaseStudentData(account, onData, onError) {
  const store = createEmptyData();

  const emit = () => {
    store.videos = dedupeById(store.videos);
    onData({
      students: [...store.students],
      transactions: [],
      lessons: [...store.lessons],
      homeworks: [...store.homeworks],
      videos: [...store.videos]
    });
  };

  const unsubscribers = [
    onSnapshot(
      doc(firebaseDb, "users", account.tutorId, "students", account.studentId),
      (snapshot) => {
        store.students = snapshot.exists() ? [{ id: snapshot.id, ...snapshot.data() }] : [];
        emit();
      },
      onError
    ),
    onSnapshot(
      query(collection(firebaseDb, "users", account.tutorId, "lessons"), where("studentId", "==", account.studentId)),
      (snapshot) => {
        store.lessons = snapshot.docs.map(mapSnapshotDoc);
        emit();
      },
      onError
    ),
    onSnapshot(
      query(collection(firebaseDb, "users", account.tutorId, "homeworks"), where("studentId", "==", account.studentId)),
      (snapshot) => {
        store.homeworks = snapshot.docs.map(mapSnapshotDoc);
        emit();
      },
      onError
    ),
    onSnapshot(
      query(collection(firebaseDb, "users", account.tutorId, "videos"), where("audience", "==", "all")),
      (snapshot) => {
        const personal = store.videos.filter((item) => item.audience === "student");
        store.videos = [...snapshot.docs.map(mapSnapshotDoc), ...personal];
        emit();
      },
      onError
    ),
    onSnapshot(
      query(collection(firebaseDb, "users", account.tutorId, "videos"), where("studentId", "==", account.studentId)),
      (snapshot) => {
        const shared = store.videos.filter((item) => item.audience === "all");
        store.videos = [...shared, ...snapshot.docs.map(mapSnapshotDoc)];
        emit();
      },
      onError
    )
  ];

  return () => {
    unsubscribers.forEach((unsubscribe) => unsubscribe());
  };
}

async function createFirebaseStudentAccount(tutorId, studentId, credentials, studentSeed = null) {
  const studentRef = doc(firebaseDb, "users", tutorId, "students", studentId);
  const student = studentSeed || await loadStudent(studentRef);

  if (!student) {
    throw new Error("Профиль ученика не найден.");
  }
  if (student.accountUid) {
    throw new Error("Для этого ученика кабинет уже создан.");
  }

  const secondaryApp = initializeApp(firebaseWebConfig, `student-account-${Date.now()}`);
  const secondaryAuth = getAuth(secondaryApp);
  let createdUser = null;

  try {
    const credential = await createUserWithEmailAndPassword(secondaryAuth, credentials.email, credentials.password);
    createdUser = credential.user;
    await updateProfile(credential.user, { displayName: credentials.displayName || student.name || "" });

    await setDoc(
      doc(firebaseDb, "users", credential.user.uid),
      {
        role: "student",
        tutorId,
        studentId,
        displayName: credentials.displayName || student.name || "",
        email: credentials.email,
        disabled: false,
        createdAt: new Date().toISOString()
      },
      { merge: true }
    );

    await updateDoc(studentRef, {
      email: credentials.email,
      accountUid: credential.user.uid,
      hasPortalAccess: true,
      accountCreatedAt: new Date().toISOString()
    });

    return credential.user.uid;
  } catch (error) {
    if (createdUser) {
      try {
        await deleteUser(createdUser);
      } catch {}
    }
    throw error;
  } finally {
    try {
      await signOut(secondaryAuth);
    } catch {}
    await deleteApp(secondaryApp);
  }
}

async function ensureFirebaseAccountDoc(user, data) {
  await setDoc(
    doc(firebaseDb, "users", user.uid),
    {
      createdAt: new Date().toISOString(),
      disabled: false,
      ...data
    },
    { merge: true }
  );
}

async function loadFirestoreCollections(uid) {
  const sections = ["students", "transactions", "lessons", "homeworks", "videos"];
  const result = createEmptyData();

  await Promise.all(
    sections.map(async (section) => {
      const snapshot = await getDocs(collection(firebaseDb, "users", uid, section));
      result[section] = snapshot.docs.map(mapSnapshotDoc);
    })
  );

  return result;
}

async function loadStudent(studentRef) {
  const snapshot = await getDoc(studentRef);
  return snapshot.exists() ? snapshot.data() : null;
}

function normalizeFirebaseAccount(user, data) {
  return {
    uid: user.uid,
    email: data?.email || user.email || "",
    displayName: data?.displayName || user.displayName || "",
    role: data?.role || "tutor",
    tutorId: data?.role === "student" ? data?.tutorId || null : user.uid,
    studentId: data?.studentId || null,
    disabled: Boolean(data?.disabled)
  };
}

function cacheFirebaseAccount(account) {
  try {
    localStorage.setItem(`${STORAGE_KEY}:firebase-account:${account.uid}`, JSON.stringify(account));
  } catch {}
}

function readCachedFirebaseAccount(uid) {
  try {
    const raw = localStorage.getItem(`${STORAGE_KEY}:firebase-account:${uid}`);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function isOfflineFirestoreError(error) {
  const message = String(error?.message || "").toLowerCase();
  const code = String(error?.code || "").toLowerCase();
  return code.includes("unavailable")
    || code.includes("offline")
    || message.includes("client is offline")
    || message.includes("offline");
}

function normalizeLocalAccount(user) {
  const users = readUsers();
  const stored = users.find((item) => item.uid === user?.uid) || user || {};
  return {
    uid: stored.uid,
    email: stored.email || "",
    displayName: stored.displayName || "",
    role: stored.role || "tutor",
    tutorId: stored.role === "student" ? stored.tutorId || null : stored.uid,
    studentId: stored.studentId || null,
    disabled: Boolean(stored.disabled)
  };
}

function loadLocalDataForAccount(account) {
  if (!account?.uid) return createEmptyData();
  const tutorId = account.role === "student" ? account.tutorId : account.uid;
  const data = readLocalData(tutorId);

  if (account.role !== "student") {
    return data;
  }

  return {
    students: data.students.filter((item) => item.id === account.studentId),
    transactions: [],
    lessons: data.lessons.filter((item) => item.studentId === account.studentId),
    homeworks: data.homeworks.filter((item) => item.studentId === account.studentId),
    videos: data.videos.filter((item) => item.audience === "all" || item.studentId === account.studentId)
  };
}

function createSeedData() {
  const today = new Date();
  const createdAt = today.toISOString();

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
        email: "",
        accountUid: null,
        hasPortalAccess: false,
        accountCreatedAt: null,
        createdAt
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
        email: "",
        accountUid: null,
        hasPortalAccess: false,
        accountCreatedAt: null,
        createdAt
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
        email: "",
        accountUid: null,
        hasPortalAccess: false,
        accountCreatedAt: null,
        createdAt
      }
    ],
    transactions: [
      { id: "tr-1", studentId: "student-1", amount: 5400, date: todayISO(), comment: "Пакет из трех занятий", createdAt },
      { id: "tr-2", studentId: "student-2", amount: 3000, date: todayISO(), comment: "Аванс за две недели", createdAt },
      { id: "tr-3", studentId: "student-3", amount: 8000, date: todayISO(), comment: "Оплата за месяц", createdAt }
    ],
    lessons: [
      { id: "ls-1", studentId: "student-1", ...plusDays(0, "17:00"), duration: 60, status: "planned", topic: "Параметры и графики", createdAt },
      { id: "ls-2", studentId: "student-2", ...plusDays(1, "19:00"), duration: 60, status: "planned", topic: "HR interview", createdAt },
      { id: "ls-3", studentId: "student-3", ...plusDays(2, "16:30"), duration: 90, status: "planned", topic: "Электродинамика", createdAt },
      { id: "ls-4", studentId: "student-1", ...plusDays(-2, "17:00"), duration: 60, status: "done", topic: "Производные", createdAt }
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
        attachments: [],
        createdAt
      },
      {
        id: "hw-2",
        studentId: "student-2",
        title: "Self-introduction for interviews",
        dueDate: plusDays(2, "00:00").date,
        status: "rework",
        progress: 65,
        description: "Подготовить устную самопрезентацию на 90 секунд и записать ключевые фразы.",
        teacherNote: "Добавь примеры достижений и убери повторяющиеся конструкции.",
        attachments: [],
        createdAt
      },
      {
        id: "hw-3",
        studentId: "student-3",
        title: "Разбор задачи по электрическому полю",
        dueDate: plusDays(4, "00:00").date,
        status: "reviewed",
        progress: 100,
        description: "Решение с альтернативным способом и проверкой размерности.",
        teacherNote: "Очень хороший ход решения, особенно в части проверки результата.",
        attachments: [],
        createdAt
      }
    ],
    videos: [
      {
        id: "vd-1",
        title: "Разбор типовых ошибок",
        description: "Общее видео для всех учеников с пояснением, как оформлять решения.",
        sourceUrl: "https://vk.com/video_ext.php?oid=-1&id=456239017&hd=2",
        embedUrl: "https://vk.com/video_ext.php?oid=-1&id=456239017&hd=2",
        studentId: null,
        audience: "all",
        createdAt
      },
      {
        id: "vd-2",
        title: "Персональный разбор по параметрам",
        description: "Видео-комментарий для Анны с разбором домашней работы.",
        sourceUrl: "https://vk.com/video_ext.php?oid=-1&id=456239018&hd=2",
        embedUrl: "https://vk.com/video_ext.php?oid=-1&id=456239018&hd=2",
        studentId: "student-1",
        audience: "student",
        createdAt
      }
    ]
  };
}

function createEmptyData() {
  return {
    students: [],
    transactions: [],
    lessons: [],
    homeworks: [],
    videos: []
  };
}

function mergeVideoSnapshots(sharedSnapshot, personalSnapshot) {
  return dedupeById([
    ...sharedSnapshot.docs.map(mapSnapshotDoc),
    ...personalSnapshot.docs.map(mapSnapshotDoc)
  ]);
}

function dedupeById(items) {
  return Array.from(new Map(items.map((item) => [item.id, item])).values());
}

function mapSnapshotDoc(snapshot) {
  return {
    id: snapshot.id,
    ...snapshot.data()
  };
}

function requireTutorAccount(account) {
  if (!account || account.role !== "tutor") {
    throw new Error("Эта функция доступна только репетитору.");
  }
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
    displayName: user.displayName || "",
    role: user.role || "tutor",
    tutorId: user.role === "student" ? user.tutorId || null : user.uid,
    studentId: user.studentId || null,
    disabled: Boolean(user.disabled)
  };
}

function readLocalData(uid) {
  try {
    const raw = localStorage.getItem(`${STORAGE_KEY}:${uid}`);
    const parsed = raw ? JSON.parse(raw) : createSeedData();
    return {
      students: parsed.students || [],
      transactions: parsed.transactions || [],
      lessons: parsed.lessons || [],
      homeworks: parsed.homeworks || [],
      videos: parsed.videos || []
    };
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
