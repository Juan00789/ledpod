// src/catalog/stores-service.js
//
// Gestión de comercios (stores) y su subcolección de productos.
// `status` (pending/active/paused/suspended) lo controla el Admin —
// es la aprobación del negocio. `open` (true/false) lo controla el
// propio comercio día a día — es el interruptor manual de
// "abierto/cerrado ahora mismo", usado solo cuando el comercio NO
// tiene un horario semanal configurado (`hours`). Si el Admin le
// configuró un horario, ese horario manda y `open` se ignora para
// decidir si aparece en Inicio — ver `isStoreOpenNow`.
// Un comercio puede estar aprobado (status: active) pero cerrado
// (fuera de horario, o open: false) fuera de horario.

import {
  collection,
  doc,
  addDoc,
  getDocs,
  onSnapshot,
  updateDoc,
  deleteDoc,
  deleteField,
  query,
  where,
  serverTimestamp
} from 'https://www.gstatic.com/firebasejs/12.1.0/firebase-firestore.js';
import { db } from '../../firebase.js';
import { getProductPhotos, productPhotoFields } from '../shared/product-photos.js';

// ---- Horario semanal -------------------------------------------------
//
// `store.hours` (opcional) tiene forma:
//   { lun: {closed, open, close}, mar: {...}, ..., dom: {...} }
// con `open`/`close` como "HH:MM" en hora local del dispositivo.
// DIAS mapea el índice de Date.getDay() (0 = domingo) a esas claves.
export const DIAS = ['dom', 'lun', 'mar', 'mie', 'jue', 'vie', 'sab'];
export const DIA_LABEL = { lun: 'Lunes', mar: 'Martes', mie: 'Miércoles', jue: 'Jueves', vie: 'Viernes', sab: 'Sábado', dom: 'Domingo' };

export function hayHorarioConfigurado(hours) {
  return !!hours && DIAS.some((d) => hours[d] && (hours[d].closed || (hours[d].open && hours[d].close)));
}

// Calcula si el comercio está abierto en este momento. Si tiene un
// horario semanal configurado, ese horario decide (ignorando `open`).
// Si no tiene horario, se respeta el interruptor manual `open` —
// así los comercios que todavía no configuraron horario siguen
// funcionando exactamente como antes.
export function isStoreOpenNow(store) {
  const hours = store?.hours;
  if (!hayHorarioConfigurado(hours)) return !!store?.open;

  const now = new Date();
  const dia = hours[DIAS[now.getDay()]];
  if (!dia || dia.closed || !dia.open || !dia.close) return false;

  const minutosAhora = now.getHours() * 60 + now.getMinutes();
  const [oh, om] = dia.open.split(':').map(Number);
  const [ch, cm] = dia.close.split(':').map(Number);
  const apertura = oh * 60 + (om || 0);
  const cierre = ch * 60 + (cm || 0);

  if (cierre <= apertura) {
    // Horario que cruza la medianoche (ej. 18:00 a 02:00).
    return minutosAhora >= apertura || minutosAhora < cierre;
  }
  return minutosAhora >= apertura && minutosAhora < cierre;
}

function formatHora(hhmm) {
  const [h, m] = String(hhmm || '').split(':').map(Number);
  if (Number.isNaN(h)) return '';
  return `${String(h).padStart(2, '0')}:${String(m || 0).padStart(2, '0')}`;
}

// Texto corto para mostrarle al cliente el horario de hoy — solo
// cuando el comercio tiene un horario semanal configurado (si usa el
// interruptor manual, no hay horario que mostrar). Devuelve null si
// no hay nada que mostrar.
export function getTodayHoursLabel(store) {
  const hours = store?.hours;
  if (!hayHorarioConfigurado(hours)) return null;

  const dia = hours[DIAS[new Date().getDay()]];
  if (!dia || dia.closed || !dia.open || !dia.close) return 'Cerrado hoy';
  const cierre = dia.close === '00:00' ? '24:00' : formatHora(dia.close);
  return `Hoy ${formatHora(dia.open)} – ${cierre}`;
}

// ---- El comercio asignado al empleado logueado -------------------
//
// Se conserva `ownerId` como nombre histórico del campo Firestore; ahora
// contiene el UID del empleado asignado. Cada empleado gestiona un solo
// comercio en este MVP.
export async function findOwnStore(employeeId) {
  const q = query(collection(db, 'stores'), where('ownerId', '==', employeeId));
  const snap = await getDocs(q);
  if (snap.empty) return null;
  return { id: snap.docs[0].id, ...snap.docs[0].data() };
}

export function watchOwnStore(employeeId, callback, onError = console.error) {
  const q = query(collection(db, 'stores'), where('ownerId', '==', employeeId));
  return onSnapshot(q, (snap) => {
    callback(snap.empty ? null : { id: snap.docs[0].id, ...snap.docs[0].data() });
  }, onError);
}

// ---- Registro de comercio desde el Admin ----------------------------
//
// El Admin da de alta los comercios y puede asignarles un empleado.
//   - Elegir el estado inicial (activo de una vez, sin esperar
//     aprobación — el propio Admin es quien lo está aprobando al
//     crearlo) y si nace abierto, para que aparezca ya en Inicio.
//   - Crear el comercio sin empleado todavía (`ownerId: null`),
//     guardando el correo en `ownerEmail` para asignarlo cuando esa
//     persona se registre.
export async function adminCreateStore({
  name, description, phone, address, category,
  employeeId = null, employeeEmail = '', status = 'active', open = true
}) {
  return addDoc(collection(db, 'stores'), {
    ownerId: employeeId || null,
    ownerEmail: employeeId ? '' : (employeeEmail || ''),
    name,
    description: description || '',
    phone: phone || '',
    address: address || '',
    category: category || '',
    status,
    open: !!open,
    createdByAdmin: true,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp()
  });
}

// Asigna el comercio a una cuenta existente. El rol interno `comercio`
// se gestiona aparte desde user-manager.js.
export async function assignStoreEmployee(storeId, employeeId) {
  await updateDoc(doc(db, 'stores', storeId), {
    ownerId: employeeId,
    ownerEmail: '',
    updatedAt: serverTimestamp()
  });
}

// `photo` y `hours` son opcionales — si no se pasan (undefined), no se
// tocan en Firestore. Esto permite que el formulario de perfil del
// propio comercio (que no maneja foto ni horario) siga funcionando
// igual, mientras el editor del Admin sí puede enviarlos.
export async function updateStoreProfile(storeId, { name, description, phone, address, category, photo, hours }) {
  const payload = {
    name, description: description || '', phone: phone || '', address: address || '', category: category || '',
    updatedAt: serverTimestamp()
  };
  if (photo !== undefined) payload.photo = photo || null;
  if (hours !== undefined) payload.hours = hours || null;
  await updateDoc(doc(db, 'stores', storeId), payload);
}

export async function setStoreOpen(storeId, open) {
  await updateDoc(doc(db, 'stores', storeId), { open, updatedAt: serverTimestamp() });
}

// ---- Productos del comercio ----------------------------------------

export function watchOwnProducts(storeId, callback, onError = console.error) {
  return onSnapshot(collection(db, 'stores', storeId, 'products'), (snap) => {
    callback(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
  }, onError);
}

// `photo` es opcional — un data URL JPEG ya comprimido (ver
// src/shared/img-utils.js), guardado directo en el documento porque
// este proyecto vive en el plan gratuito Spark de Firebase, que no
// incluye acceso a Cloud Storage (desde feb-2026 requiere Blaze).
// Si no hay foto, la tarjeta del producto usa un ícono genérico fijo.
//
// `stock` (opcional) es un número de unidades disponibles. `null`/
// `undefined` significa "sin control de inventario" (comportamiento
// de siempre, siempre disponible) — así los productos ya creados
// antes de este campo siguen funcionando exactamente igual. Cuando
// SÍ es un número, se descuenta automáticamente al confirmar cada
// pedido (ver updateOrderStatusByStore en orders-service.js) y el
// producto se oculta como "Agotado" en cuanto llega a 0.
export async function addProduct(storeId, { name, description, price, category, photo, photos, available, stock }) {
  const productPhotos = getProductPhotos({ photo, photos });
  return addDoc(collection(db, 'stores', storeId, 'products'), {
    name, description: description || '', price: Number(price) || 0,
    category: category || '', ...productPhotoFields(productPhotos),
    available: available !== false,
    stock: (stock === '' || stock === null || stock === undefined) ? null : Math.max(0, Math.floor(Number(stock)) || 0),
    createdAt: serverTimestamp(), updatedAt: serverTimestamp()
  });
}

export async function updateProduct(storeId, productId, fields) {
  const payload = { ...fields, updatedAt: serverTimestamp() };
  if ('photo' in fields || 'photos' in fields) {
    Object.assign(payload, productPhotoFields(getProductPhotos(fields)));
    payload.photo = payload.photo || deleteField();
  }
  await updateDoc(doc(db, 'stores', storeId, 'products', productId), payload);
}

export async function deleteProduct(storeId, productId) {
  await deleteDoc(doc(db, 'stores', storeId, 'products', productId));
}

// ---- Navegación del cliente -----------------------------------------

// Solo comercios aprobados por Admin Y abiertos ahora mismo (por
// horario si lo tienen configurado, o por el interruptor manual si no).
//
// El horario semanal lo decide isStoreOpenNow() comparando contra la
// hora actual — pero un onSnapshot de Firestore solo dispara cuando
// CAMBIAN LOS DATOS, no cuando cambia el reloj. Sin el setInterval de
// abajo, un comercio que cierra a las 22:00 seguía apareciendo como
// abierto en Inicio pasada esa hora hasta que algo (el Admin editando
// otro comercio, por ejemplo) disparara un nuevo snapshot. Por eso se
// re-evalúa el filtro cada minuto contra el último snapshot recibido,
// además de cada vez que sí llegan datos nuevos.
export function watchOpenStores(callback, onError = console.error) {
  const q = query(collection(db, 'stores'), where('status', '==', 'active'));
  let latestActive = [];

  const emit = () => callback(latestActive.filter((s) => isStoreOpenNow(s)));

  const unsubscribe = onSnapshot(q, (snap) => {
    latestActive = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
    emit();
  }, onError);

  const intervalId = setInterval(emit, 60000);

  return () => {
    unsubscribe();
    clearInterval(intervalId);
  };
}

export async function getStoreProducts(storeId) {
  const snap = await getDocs(collection(db, 'stores', storeId, 'products'));
  return snap.docs.map((d) => ({ id: d.id, ...d.data() })).filter((p) => p.available !== false);
}
