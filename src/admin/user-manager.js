import {
  collection,
  getDocs,
  onSnapshot,
  doc,
  updateDoc,
  serverTimestamp,
  query,
  orderBy
} from 'https://www.gstatic.com/firebasejs/12.1.0/firebase-firestore.js';
import { db } from '../../firebase.js';

export const ROLES = ['cliente', 'comercio', 'repartidor', 'admin'];

export async function listUsers() {
  const snap = await getDocs(collection(db, 'users'));
  return snap.docs.map(d => ({ uid: d.id, ...d.data() }));
}

// Busca una cuenta ya registrada por su correo (sin distinguir
// mayúsculas/minúsculas). Se usa para vincular un comercio creado por
// el Admin (sin dueño todavía) a la cuenta real en cuanto esa persona
// se registra en Ledpod.
export async function findUserByEmail(email) {
  const target = (email || '').trim().toLowerCase();
  if (!target) return null;
  const users = await listUsers();
  return users.find(u => (u.email || '').trim().toLowerCase() === target) || null;
}

export function watchUsers(callback, onError = console.error) {
  const usersQuery = query(collection(db, 'users'), orderBy('createdAt', 'desc'));
  return onSnapshot(usersQuery, snap => {
    callback(snap.docs.map(d => ({ uid: d.id, ...d.data() })));
  }, onError);
}

export async function changeUserRole(uid, role) {
  if (!ROLES.includes(role)) throw new Error('Rol inválido');
  await updateDoc(doc(db, 'users', uid), {
    role,
    updatedAt: serverTimestamp()
  });
}

export async function changeUserStatus(uid, status) {
  if (!['active', 'blocked'].includes(status)) throw new Error('Estado inválido');
  await updateDoc(doc(db, 'users', uid), {
    status,
    updatedAt: serverTimestamp()
  });
}
