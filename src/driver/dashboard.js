// src/driver/dashboard.js
import { esc, money, formatDate, showToast } from '../shared/utils.js';
import { watchDriverProfile, ensureDriverProfile, setDispatchStatus, registerCompletedDelivery } from './driver-service.js';
import {
  watchAvailableDeliveries,
  watchDriverOrders,
  claimDelivery,
  updateOrderStatusByDriver,
  ESTADO_LABEL
} from '../orders/orders-service.js';

export const driverDashboard = {
  role: 'repartidor',
  title: 'Centro del Repartidor',
  sections: ['perfil', 'disponibles', 'activa', 'historial']
};

const SIGUIENTE_ESTADO = { assigned: 'picked_up', picked_up: 'on_the_way', on_the_way: 'delivered' };
const ETIQUETA_ACCION = { assigned: 'Marcar como recogido', picked_up: 'Marcar en camino', on_the_way: 'Marcar entregado' };

let currentUid = null;

function renderProfile(profile) {
  const dispatchBox = document.getElementById('dispatchBox');
  const subtitle = document.getElementById('driverSubtitle');
  const hint = document.getElementById('approvalHint');

  if (!profile) {
    dispatchBox.style.display = 'none';
    subtitle.textContent = 'Completa tu perfil para empezar a recibir entregas.';
    return;
  }

  document.getElementById('driverPhoneInput').value = profile.phone || '';
  document.getElementById('driverVehicleInput').value = profile.vehicle?.type || '';
  document.getElementById('driverPlateInput').value = profile.vehicle?.plate || '';
  document.getElementById('statCompleted').textContent = profile.completedDeliveries || 0;
  document.getElementById('statEarnings').textContent = money(profile.earnings || 0);

  dispatchBox.style.display = 'block';
  const APROBACION = {
    pending: 'Pendiente de aprobación — un administrador tiene que activar tu cuenta antes de que puedas tomar entregas.',
    active: 'Tu cuenta está aprobada.',
    suspended: 'Tu cuenta está suspendida. Contacta a soporte.'
  };
  hint.textContent = APROBACION[profile.status] || APROBACION.pending;
  subtitle.textContent = profile.dispatchStatus === 'available' ? 'Estás disponible para recibir entregas.' : 'Estás desconectado.';

  document.querySelectorAll('[data-dispatch]').forEach((btn) => {
    btn.classList.toggle('primary', btn.dataset.dispatch === (profile.dispatchStatus || 'offline'));
    btn.disabled = profile.status !== 'active' && btn.dataset.dispatch === 'available';
  });
}

function renderAvailable(orders) {
  const box = document.getElementById('availableList');
  if (!orders.length) {
    box.innerHTML = '<div class="empty">No hay entregas disponibles ahora mismo.</div>';
    return;
  }
  box.innerHTML = orders.map((o) => `
    <article class="user-row">
      <div class="user-main">
        <div>
          <strong>${esc(o.storeName || 'Comercio')}</strong>
          <div class="muted">${esc(o.customerAddress || '')}</div>
          <small class="muted">${formatDate(o.createdAt)} · Envío: ${money(o.deliveryFee)}</small>
        </div>
      </div>
      <div class="user-controls">
        <button type="button" class="btn primary" data-claim="${o.id}">Tomar entrega</button>
      </div>
    </article>
  `).join('');

  box.querySelectorAll('[data-claim]').forEach((btn) => {
    btn.addEventListener('click', async () => {
      btn.disabled = true;
      try {
        await claimDelivery(btn.dataset.claim, currentUid);
        await setDispatchStatus(currentUid, 'busy').catch(() => {});
        showToast('driverToast', 'Entrega tomada.');
        document.querySelector('.side-link[data-section="activa"]')?.click();
      } catch (err) {
        showToast('driverToast', err.message || 'No se pudo tomar la entrega.', true);
        btn.disabled = false;
      }
    });
  });
}

function renderActive(order) {
  const box = document.getElementById('activeDelivery');
  if (!order) {
    box.innerHTML = '<div class="empty">No tienes una entrega en curso.</div>';
    return;
  }
  box.innerHTML = `
    <div class="box">
      <h3>${esc(order.storeName || 'Comercio')}</h3>
      <p class="muted">${(order.items || []).map((i) => `${esc(i.name)} ×${i.quantity}`).join(', ')}</p>
      <p><strong>Entregar en:</strong> ${esc(order.customerAddress || '')}</p>
      <p class="muted">Estado actual: ${esc(ESTADO_LABEL[order.status] || order.status)}</p>
      <button type="button" id="btnAvanzarEntrega" class="btn primary" style="width:100%;padding:13px">
        ${ETIQUETA_ACCION[order.status] || 'Actualizar'}
      </button>
    </div>
  `;

  document.getElementById('btnAvanzarEntrega')?.addEventListener('click', async (e) => {
    const siguiente = SIGUIENTE_ESTADO[order.status];
    if (!siguiente) return;
    e.target.disabled = true;
    try {
      await updateOrderStatusByDriver(order.id, siguiente);
      if (siguiente === 'delivered') {
        await registerCompletedDelivery(currentUid, order.deliveryFee);
        await setDispatchStatus(currentUid, 'available').catch(() => {});
        showToast('driverToast', 'Entrega completada. ¡Buen trabajo!');
      }
    } catch (err) {
      console.error(err);
      showToast('driverToast', 'No se pudo actualizar la entrega.', true);
      e.target.disabled = false;
    }
  });
}

function renderHistory(orders) {
  const box = document.getElementById('historyList');
  if (!orders.length) {
    box.innerHTML = '<div class="empty">Todavía no has completado entregas.</div>';
    return;
  }
  box.innerHTML = orders.map((o) => `
    <article class="user-row">
      <div class="user-main">
        <div>
          <strong>${esc(o.storeName || 'Comercio')}</strong>
          <div class="muted">${esc(o.customerAddress || '')}</div>
          <small class="muted">${formatDate(o.updatedAt || o.createdAt)}</small>
        </div>
      </div>
      <div class="user-controls">
        <span class="role">${esc(ESTADO_LABEL[o.status] || o.status)}</span>
        <strong>${money(o.deliveryFee)}</strong>
      </div>
    </article>
  `).join('');
}

export function initDriverDashboard(session) {
  currentUid = session.user.uid;

  document.getElementById('driverProfileForm')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    try {
      await ensureDriverProfile(currentUid, {
        phone: document.getElementById('driverPhoneInput').value.trim(),
        vehicleType: document.getElementById('driverVehicleInput').value.trim(),
        vehiclePlate: document.getElementById('driverPlateInput').value.trim()
      });
      showToast('driverToast', 'Perfil guardado.');
    } catch (err) {
      console.error(err);
      showToast('driverToast', 'No se pudo guardar el perfil.', true);
    }
  });

  document.querySelectorAll('[data-dispatch]').forEach((btn) => {
    btn.addEventListener('click', async () => {
      try {
        await setDispatchStatus(currentUid, btn.dataset.dispatch);
      } catch (err) {
        showToast('driverToast', err.message || 'No se pudo actualizar tu disponibilidad.', true);
      }
    });
  });

  const unsubProfile = watchDriverProfile(currentUid, renderProfile);
  const unsubAvailable = watchAvailableDeliveries(renderAvailable);
  const unsubOrders = watchDriverOrders(currentUid, (orders) => {
    const activa = orders.find((o) => ['assigned', 'picked_up', 'on_the_way'].includes(o.status)) || null;
    const historial = orders.filter((o) => ['delivered', 'cancelled'].includes(o.status));
    renderActive(activa);
    renderHistory(historial);

    const calificados = orders.filter((o) => o.rating?.stars);
    const ratingEl = document.getElementById('statDriverRating');
    if (ratingEl) {
      ratingEl.textContent = calificados.length
        ? `⭐ ${(calificados.reduce((sum, o) => sum + o.rating.stars, 0) / calificados.length).toFixed(1)} (${calificados.length})`
        : '—';
    }
  });

  return () => {
    unsubProfile();
    unsubAvailable();
    unsubOrders();
  };
}
