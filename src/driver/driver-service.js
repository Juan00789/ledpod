// src/driver/driver-service.js
// Perfil del repartidor: vehículo, disponibilidad, ganancias
// acumuladas. Vive en drivers/{uid} — mismo uid que auth/users.

import {
  doc,
  getDoc,
  setDoc,
  onSnapshot,
  updateDoc,
  serverTimestamp
} from 'https://www.gstatic.com/firebasejs/12.1.0/firebase-firestore.js';
import { db } from '../../firebase.js';

export function watchDriverProfile(uid, callback, onError = console.error) {
  return onSnapshot(doc(db, 'drivers', uid), (snap) => {
    callback(snap.exists() ? { uid, ...snap.data() } : null);
  }, onError);
}

export async function ensureDriverProfile(uid, { phone, vehicleType, vehiclePlate }) {
  const ref = doc(db, 'drivers', uid);
  const snap = await getDoc(ref);
  const base = {
    userId: uid,
    phone: phone || '',
    vehicle: { type: vehicleType || '', plate: vehiclePlate || '' },
    updatedAt: serverTimestamp()
  };
  if (!snap.exists()) {
    await setDoc(ref, {
      ...base,
      status: 'pending', // el Admin aprueba al repartidor, igual que al comercio
      dispatchStatus: 'offline',
      completedDeliveries: 0,
      earnings: 0,
      createdAt: serverTimestamp()
    });
  } else {
    await updateDoc(ref, base);
  }
}

export async function setDispatchStatus(uid, dispatchStatus) {
  const permitido = ['offline', 'available', 'busy'];
  if (!permitido.includes(dispatchStatus)) throw new Error('Estado inválido');
  await updateDoc(doc(db, 'drivers', uid), { dispatchStatus, updatedAt: serverTimestamp() });
}

export async function registerCompletedDelivery(uid, earnedAmount) {
  const ref = doc(db, 'drivers', uid);
  const snap = await getDoc(ref);
  const current = snap.exists() ? snap.data() : { completedDeliveries: 0, earnings: 0 };
  await updateDoc(ref, {
    completedDeliveries: (current.completedDeliveries || 0) + 1,
    earnings: (current.earnings || 0) + Number(earnedAmount || 0),
    updatedAt: serverTimestamp()
  });
}
