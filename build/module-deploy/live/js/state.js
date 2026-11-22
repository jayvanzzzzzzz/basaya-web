import {
  collection,
  getDocs,
  query,
  where,
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import { db } from "./firebase.js";

export const state = {
  user: null,
  profile: null,
  classes: [],
  lessons: [],
  allLessons: [],
  teachers: [],
  allClasses: [],
};

export async function getTeacherClasses() {
  const snapshot = await getDocs(
    query(collection(db, "classes"), where("teacherId", "==", state.user.uid)),
  );
  state.classes = snapshot.docs
    .map((d) => ({ id: d.id, ...d.data() }))
    .sort((a, b) => (b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0));
}

export async function getTeacherLessons() {
  const snapshot = await getDocs(
    query(collection(db, "lessons"), where("teacherId", "==", state.user.uid)),
  );
  state.lessons = snapshot.docs
    .map((d) => ({ id: d.id, ...d.data() }))
    .sort(
      (a, b) =>
        (b.updatedAt?.seconds || b.createdAt?.seconds || 0) -
        (a.updatedAt?.seconds || a.createdAt?.seconds || 0),
    );
}

// Every lesson in the lessons collection, from any teacher — unfiltered.
export async function getAllLessons() {
  const snapshot = await getDocs(collection(db, "lessons"));
  state.allLessons = snapshot.docs
    .map((d) => ({ id: d.id, ...d.data() }))
    .sort(
      (a, b) =>
        (b.updatedAt?.seconds || b.createdAt?.seconds || 0) -
        (a.updatedAt?.seconds || a.createdAt?.seconds || 0),
    );
}

// Admin: every teacher account.
export async function getAllTeachers() {
  const snapshot = await getDocs(
    query(collection(db, "users"), where("role", "==", "teacher")),
  );
  state.teachers = snapshot.docs.map((d) => ({ id: d.id, ...d.data() }));
}

// Admin: every class across every teacher.
export async function getAllClasses() {
  const snapshot = await getDocs(collection(db, "classes"));
  state.allClasses = snapshot.docs
    .map((d) => ({ id: d.id, ...d.data() }))
    .sort((a, b) => (b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0));
}