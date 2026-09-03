// src/orders/orders-service.js
//
// Ciclo de vida del pedido, compartido entre los 3 roles operativos.
// Todas las consultas usan un solo filtro de igualdad (where) y
// ordenan del lado del cliente (Array.sort) en vez de combinar
// where()+orderBy() en campos distintos — eso evita depender de
// índices compuestos que habría que crear a mano en la consola de
// Firebase, algo que no podemos verificar desde acá.
//
// Ciclo de estado de un pedido:
// created -> confirmed -> preparing -> ready -> assigned -> picked_up
//         -> on_the_way -> delivered
// (o bien -> cancelled en cualquier punto antes de "delivered")

import {
  collection,
  doc,
  addDoc,
  onSnapshot,
  updateDoc,
  runTransaction,
  serverTimestamp,
  query,
  where
} from 'https://www.gstatic.com/firebasejs/12.1.0/firebase-firestore.js';
import { db } from '../../firebase.js';

export const ESTADO_LABEL = {
  created: 'Recibido',
  confirmed: 'Confirmado',
  preparing: 'En preparación',
  ready: 'Listo para recoger',
  assigned: 'Repartidor asignado',
  picked_up: 'Recogido',
  on_the_way: 'En camino',
  delivered: 'Entregado',
  cancelled: 'Cancelado',
  failed: 'Fallido'
};

function porFechaDesc(a, b) {
  const fa = a.createdAt?.toMillis ? a.createdAt.toMillis() : 0;
  const fb = b.createdAt?.toMillis ? b.createdAt.toMillis() : 0;
  return fb - fa;
}

function porFechaAsc(a, b) {
  return -porFechaDesc(a, b);
}

// ---- Cliente ----------------------------------------------------

export async function createOrder({ customerId, storeId, storeName, items, deliveryFee, customerAddress }) {
  const subtotal = items.reduce((sum, it) => sum + Number(it.price || 0) * Number(it.quantity || 1), 0);
  const total = subtotal + Number(deliveryFee || 0);

  return addDoc(collection(db, 'orders'), {
    customerId,
    storeId,
    storeName,
    driverId: null,
    items,
    subtotal,
    deliveryFee: Number(deliveryFee || 0),
    total,
    customerAddress: customerAddress || '',
    status: 'created',
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp()
  });
}

export function watchCustomerOrders(customerId, callback, onError = console.error) {
  const q = query(collection(db, 'orders'), where('customerId', '==', customerId));
  return onSnapshot(q, (snap) => {
    callback(snap.docs.map((d) => ({ id: d.id, ...d.data() })).sort(porFechaDesc));
  }, onError);
}

// El cliente solo puede cancelar mientras el comercio todavía no ha
// confirmado nada ('created'). Una vez el comercio empieza a
// prepararlo, la cancelación debe pasar por soporte/Admin.
export async function cancelOrderByCustomer(orderId) {
  await updateDoc(doc(db, 'orders', orderId), { status: 'cancelled', updatedAt: serverTimestamp() });
}

// Calificación del pedido entregado — una vez, del cliente dueño.
// Vive en el propio documento del pedido (rating: { stars, comment }),
// así el comercio y el repartidor pueden leerla sin colecciones
// nuevas ni reglas adicionales (ya pueden leer sus propios pedidos).
export async function rateOrder(orderId, stars, comment) {
  const value = Number(stars);
  if (!Number.isInteger(value) || value < 1 || value > 5) throw new Error('Calificación inválida');
  await updateDoc(doc(db, 'orders', orderId), {
    rating: { stars: value, comment: (comment || '').slice(0, 300), createdAt: serverTimestamp() },
    updatedAt: serverTimestamp()
  });
}

// ---- Comercio -----------------------------------------------------

export function watchStoreOrders(storeId, callback, onError = console.error) {
  const q = query(collection(db, 'orders'), where('storeId', '==', storeId));
  return onSnapshot(q, (snap) => {
    callback(snap.docs.map((d) => ({ id: d.id, ...d.data() })).sort(porFechaDesc));
  }, onError);
}

// El comercio solo mueve el pedido dentro de su propio tramo
// (created -> confirmed -> preparing -> ready), o lo cancela.
export async function updateOrderStatusByStore(orderId, status) {
  const permitido = ['confirmed', 'preparing', 'ready', 'cancelled'];
  if (!permitido.includes(status)) throw new Error('Estado no permitido para el comercio');
  await updateDoc(doc(db, 'orders', orderId), { status, updatedAt: serverTimestamp() });
}

// ---- Admin -----------------------------------------------------

// Vista global: todos los pedidos, sin filtro por rol. Solo el admin
// tiene permiso de lectura sin restricción (ver firestore.rules).
export function watchAllOrders(callback, onError = console.error) {
  return onSnapshot(collection(db, 'orders'), (snap) => {
    callback(snap.docs.map((d) => ({ id: d.id, ...d.data() })).sort(porFechaDesc));
  }, onError);
}

// El Admin es el único rol que puede forzar CUALQUIER estado (para
// resolver incidencias manualmente) y desasignar un repartidor de un
// pedido (lo regresa al pool de "Disponibles" para que otro lo tome).
// Esto es lo que le da control real sobre la operación, no solo
// visibilidad de solo lectura.
export async function adminSetOrderStatus(orderId, status) {
  if (!ESTADO_LABEL[status]) throw new Error('Estado inválido');
  await updateDoc(doc(db, 'orders', orderId), { status, updatedAt: serverTimestamp() });
}

export async function adminUnassignDriver(orderId) {
  await updateDoc(doc(db, 'orders', orderId), { driverId: null, status: 'ready', updatedAt: serverTimestamp() });
}

export async function adminResolveIssue(orderId, resolved = true) {
  await updateDoc(doc(db, 'orders', orderId), { resolvedByAdmin: resolved, updatedAt: serverTimestamp() });
}

// ---- Repartidor -----------------------------------------------------

// Pedidos 'ready' y todavía sin repartidor asignado — el pool de
// entregas disponibles para tomar.
export function watchAvailableDeliveries(callback, onError = console.error) {
  const q = query(collection(db, 'orders'), where('status', '==', 'ready'));
  return onSnapshot(q, (snap) => {
    callback(
      snap.docs
        .map((d) => ({ id: d.id, ...d.data() }))
        .filter((o) => !o.driverId)
        .sort(porFechaAsc)
    );
  }, onError);
}

// Todos los pedidos de un repartidor (activos + historial) — se
// separan del lado del cliente para no necesitar un índice compuesto
// por driverId + status.
export function watchDriverOrders(driverId, callback, onError = console.error) {
  const q = query(collection(db, 'orders'), where('driverId', '==', driverId));
  return onSnapshot(q, (snap) => {
    callback(snap.docs.map((d) => ({ id: d.id, ...d.data() })).sort(porFechaDesc));
  }, onError);
}

// Transacción: solo asigna el pedido si SIGUE 'ready' y sin
// repartidor en el momento exacto de confirmar — evita que dos
// repartidores tomen el mismo pedido si tocan "Tomar entrega" casi
// al mismo tiempo.
export async function claimDelivery(orderId, driverId) {
  const ref = doc(db, 'orders', orderId);
  await runTransaction(db, async (tx) => {
    const snap = await tx.get(ref);
    if (!snap.exists()) throw new Error('El pedido ya no existe.');
    const data = snap.data();
    if (data.status !== 'ready' || data.driverId) {
      throw new Error('Este pedido ya fue tomado por otro repartidor.');
    }
    tx.update(ref, { status: 'assigned', driverId, updatedAt: serverTimestamp() });
  });
}

export async function updateOrderStatusByDriver(orderId, status) {
  const permitido = ['picked_up', 'on_the_way', 'delivered'];
  if (!permitido.includes(status)) throw new Error('Estado no permitido para el repartidor');
  await updateDoc(doc(db, 'orders', orderId), { status, updatedAt: serverTimestamp() });
}
