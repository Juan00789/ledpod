import {
  collection,
  onSnapshot,
  doc,
  getDoc,
  setDoc,
  updateDoc,
  serverTimestamp
} from 'https://www.gstatic.com/firebasejs/12.1.0/firebase-firestore.js';
import { sendPasswordResetEmail } from 'https://www.gstatic.com/firebasejs/12.1.0/firebase-auth.js';
import { auth, db } from '../../firebase.js';
import { compressImageToDataUrl } from '../shared/img-utils.js';
import { CATEGORIES, PRODUCTS } from '../data.js';
import {
  addCatalogProduct,
  deleteCatalogProduct,
  seedCatalogProducts,
  syncPublishedCatalog,
  updateCatalogProduct,
  watchCatalogInventory
} from '../catalog/public-catalog.js';
import {
  ROLES,
  watchUsers,
  changeUserRole,
  changeUserStatus,
  findUserByEmail
} from './user-manager.js';
import {
  adminCreateStore,
  linkStoreOwner,
  updateStoreProfile,
  isStoreOpenNow,
  DIAS,
  DIA_LABEL,
  watchOwnProducts,
  addProduct,
  updateProduct,
  deleteProduct
} from '../catalog/stores-service.js';
import {
  ESTADO_LABEL,
  watchAllOrders,
  adminSetOrderStatus,
  adminUnassignDriver,
  adminResolveIssue
} from '../orders/orders-service.js';

const esc = value => String(value ?? '')
  .replaceAll('&', '&amp;')
  .replaceAll('<', '&lt;')
  .replaceAll('>', '&gt;')
  .replaceAll('"', '&quot;')
  .replaceAll("'", '&#039;');

const roleLabel = role => ({
  cliente: 'Cliente',
  comercio: 'Comercio',
  repartidor: 'Repartidor',
  admin: 'Administrador'
}[role] || role);

function formatDate(value) {
  if (!value) return '—';
  const date = value.toDate ? value.toDate() : new Date(value);
  if (Number.isNaN(date.getTime())) return '—';
  return date.toLocaleString('es-DO', { dateStyle: 'short', timeStyle: 'short' });
}

function renderUsers(users) {
  const box = document.getElementById('usersTable');
  const search = document.getElementById('userSearch')?.value.trim().toLowerCase() || '';
  const roleFilter = document.getElementById('roleFilter')?.value || 'todos';
  const statusFilter = document.getElementById('statusFilter')?.value || 'todos';

  const filtered = users.filter(user => {
    const haystack = `${user.name || ''} ${user.email || ''} ${user.uid}`.toLowerCase();
    return (!search || haystack.includes(search))
      && (roleFilter === 'todos' || (user.role || 'cliente') === roleFilter)
      && (statusFilter === 'todos' || (user.status || 'active') === statusFilter);
  });

  if (!filtered.length) {
    box.innerHTML = '<div class="empty">No hay usuarios que coincidan con la búsqueda.</div>';
    return;
  }

  box.innerHTML = filtered.map(user => {
    const role = user.role || 'cliente';
    const status = user.status || 'active';
    return `
      <article class="user-row">
        <div class="user-main">
          <div class="avatar">${esc((user.name || user.email || 'U').charAt(0).toUpperCase())}</div>
          <div>
            <strong>${esc(user.name || 'Sin nombre')}</strong>
            <div class="muted">${esc(user.email || 'Sin correo')}</div>
            <small class="muted">Creado: ${esc(formatDate(user.createdAt))}</small>
          </div>
        </div>
        <div class="user-controls">
          <select class="roleSelect" data-uid="${esc(user.uid)}" aria-label="Rol de ${esc(user.name || user.email)}">
            ${ROLES.map(r => `<option value="${r}" ${r === role ? 'selected' : ''}>${roleLabel(r)}</option>`).join('')}
          </select>
          <select class="statusSelect" data-uid="${esc(user.uid)}" aria-label="Estado de ${esc(user.name || user.email)}">
            <option value="active" ${status === 'active' ? 'selected' : ''}>Activo</option>
            <option value="blocked" ${status === 'blocked' ? 'selected' : ''}>Bloqueado</option>
          </select>
        </div>
      </article>
    `;
  }).join('');

  box.querySelectorAll('.roleSelect').forEach(select => {
    select.addEventListener('change', async event => {
      const control = event.currentTarget;
      const previous = control.dataset.previous || control.value;
      control.disabled = true;
      try {
        await changeUserRole(control.dataset.uid, control.value);
        control.dataset.previous = control.value;
        showToast('Rol actualizado correctamente.');
      } catch (error) {
        control.value = previous;
        showToast('No se pudo actualizar el rol. Revisa las reglas de Firestore.', true);
        console.error(error);
      } finally {
        control.disabled = false;
      }
    });
  });

  box.querySelectorAll('.statusSelect').forEach(select => {
    select.addEventListener('change', async event => {
      const control = event.currentTarget;
      const previous = control.dataset.previous || control.value;
      control.disabled = true;
      try {
        await changeUserStatus(control.dataset.uid, control.value);
        control.dataset.previous = control.value;
        showToast('Estado actualizado correctamente.');
      } catch (error) {
        control.value = previous;
        showToast('No se pudo actualizar el estado.', true);
        console.error(error);
      } finally {
        control.disabled = false;
      }
    });
  });
}

function showToast(message, error = false) {
  const toast = document.getElementById('adminToast');
  if (!toast) return;
  toast.textContent = message;
  toast.className = `toast ${error ? 'toast-error' : ''} show`;
  setTimeout(() => toast.classList.remove('show'), 2600);
}

function setCount(id, value) {
  const node = document.getElementById(id);
  if (node) node.textContent = value;
}

const ESTADOS_COMERCIO = ['pending', 'active', 'paused', 'suspended'];
const ESTADOS_COMERCIO_LABEL = { pending: 'Pendiente', active: 'Activo', paused: 'Pausado', suspended: 'Suspendido' };

function renderStores(stores) {
  const box = document.getElementById('storesTable');
  if (!box) return;
  const search = document.getElementById('storeSearch')?.value.trim().toLowerCase() || '';
  const filtered = search
    ? stores.filter((s) => `${s.name || ''} ${s.category || ''}`.toLowerCase().includes(search))
    : stores;

  if (!stores.length) {
    box.innerHTML = '<div class="empty">Todavía no hay comercios registrados.</div>';
    return;
  }
  if (!filtered.length) {
    box.innerHTML = '<div class="empty">Ningún comercio coincide con la búsqueda.</div>';
    return;
  }
  box.innerHTML = filtered.map((s) => {
    const ownerHint = s.ownerId
      ? 'Dueño vinculado'
      : (s.ownerEmail ? `Sin cuenta vinculada aún · correo: ${esc(s.ownerEmail)}` : 'Sin dueño vinculado — creado por Admin');
    return `
    <article class="user-row" style="flex-wrap:wrap">
      <div class="user-main">
        <div class="avatar">${esc((s.name || 'C').charAt(0).toUpperCase())}</div>
        <div>
          <strong>${esc(s.name || 'Sin nombre')}</strong>
          <div class="muted">${esc(s.category || '')} · ${isStoreOpenNow(s) ? 'Abierto' : 'Cerrado'}</div>
          <small class="muted">${ownerHint}</small>
        </div>
      </div>
      <div class="user-controls">
        <select class="storeStatusSelect" data-id="${esc(s.id)}">
          ${ESTADOS_COMERCIO.map((e) => `<option value="${e}" ${e === s.status ? 'selected' : ''}>${ESTADOS_COMERCIO_LABEL[e]}</option>`).join('')}
        </select>
        <button type="button" class="btn adminEditStore" data-id="${esc(s.id)}">✏️ Editar perfil</button>
        <button type="button" class="btn adminViewProducts" data-id="${esc(s.id)}" data-name="${esc(s.name || '')}">🛍️ Productos</button>
      </div>
      ${!s.ownerId ? `
        <div style="display:flex;gap:8px;flex:1 1 100%;margin-top:2px">
          <input type="email" class="linkOwnerEmail" data-id="${esc(s.id)}" placeholder="Correo del dueño para vincular" value="${esc(s.ownerEmail || '')}" style="flex:1;padding:9px 12px;border:1px solid #ddd;border-radius:9px">
          <button type="button" class="btn linkOwnerBtn" data-id="${esc(s.id)}">Vincular cuenta</button>
        </div>
      ` : ''}
    </article>
  `;
  }).join('');

  box.querySelectorAll('.adminEditStore').forEach((btn) => {
    btn.addEventListener('click', () => openAdminStoreEdit(btn.dataset.id));
  });

  box.querySelectorAll('.storeStatusSelect').forEach((select) => {
    select.addEventListener('change', async (e) => {
      const previo = select.dataset.previous || select.value;
      select.disabled = true;
      try {
        await updateDoc(doc(db, 'stores', select.dataset.id), { status: select.value, updatedAt: serverTimestamp() });
        select.dataset.previous = select.value;
        showToast('Comercio actualizado.');
      } catch (err) {
        select.value = previo;
        showToast('No se pudo actualizar el comercio.', true);
        console.error(err);
      } finally {
        select.disabled = false;
      }
    });
  });

  box.querySelectorAll('.adminViewProducts').forEach((btn) => {
    btn.addEventListener('click', () => openAdminStoreProducts(btn.dataset.id, btn.dataset.name));
  });

  box.querySelectorAll('.linkOwnerBtn').forEach((btn) => {
    btn.addEventListener('click', async () => {
      const storeId = btn.dataset.id;
      const input = box.querySelector(`.linkOwnerEmail[data-id="${storeId}"]`);
      const email = input?.value.trim();
      if (!email) {
        showToast('Escribe el correo del dueño primero.', true);
        return;
      }
      btn.disabled = true;
      try {
        const user = await findUserByEmail(email);
        if (!user) {
          showToast('Ese correo todavía no tiene una cuenta registrada en Ledpod.', true);
          return;
        }
        await linkStoreOwner(storeId, user.uid);
        if (user.role !== 'comercio') await changeUserRole(user.uid, 'comercio');
        showToast(`Comercio vinculado a ${user.name || user.email}. Ya aparece en su panel de Comercio.`);
      } catch (err) {
        console.error(err);
        showToast('No se pudo vincular la cuenta.', true);
      } finally {
        btn.disabled = false;
      }
    });
  });
}

function renderDrivers(drivers) {
  const box = document.getElementById('driversTable');
  if (!box) return;
  const search = document.getElementById('driverSearch')?.value.trim().toLowerCase() || '';
  const filtered = search
    ? drivers.filter((d) => `${d.phone || ''} ${d.vehicle?.plate || ''} ${d.vehicle?.type || ''}`.toLowerCase().includes(search))
    : drivers;

  if (!drivers.length) {
    box.innerHTML = '<div class="empty">Todavía no hay repartidores registrados.</div>';
    return;
  }
  if (!filtered.length) {
    box.innerHTML = '<div class="empty">Ningún repartidor coincide con la búsqueda.</div>';
    return;
  }
  box.innerHTML = filtered.map((d) => `
    <article class="user-row">
      <div class="user-main">
        <div class="avatar">🛵</div>
        <div>
          <strong>${esc(d.vehicle?.plate || d.id)}</strong>
          <div class="muted">${esc(d.phone || '')} · ${esc(d.vehicle?.type || '')}</div>
        </div>
      </div>
      <div class="user-controls">
        <select class="driverStatusSelect" data-id="${esc(d.id)}">
          ${ESTADOS_COMERCIO.filter((e) => e !== 'paused').map((e) => `<option value="${e}" ${e === d.status ? 'selected' : ''}>${ESTADOS_COMERCIO_LABEL[e]}</option>`).join('')}
        </select>
      </div>
    </article>
  `).join('');

  box.querySelectorAll('.driverStatusSelect').forEach((select) => {
    select.addEventListener('change', async (e) => {
      const previo = select.dataset.previous || select.value;
      select.disabled = true;
      try {
        await updateDoc(doc(db, 'drivers', select.dataset.id), { status: select.value, updatedAt: serverTimestamp() });
        select.dataset.previous = select.value;
        showToast('Repartidor actualizado.');
      } catch (err) {
        select.value = previo;
        showToast('No se pudo actualizar el repartidor.', true);
        console.error(err);
      } finally {
        select.disabled = false;
      }
    });
  });
}

const EN_CURSO = ['created', 'confirmed', 'preparing', 'ready', 'assigned', 'picked_up', 'on_the_way'];
const CON_INCIDENCIA = ['cancelled', 'failed'];

// Estados finales — el Admin ya no puede reasignarlos a otro estado
// con un clic accidental (podría igual forzarlo si de verdad hiciera
// falta, pero no se lo ofrecemos como opción de rutina).
const ESTADOS_FINALES = ['delivered', 'cancelled', 'failed'];

function renderAllOrders(orders) {
  const box = document.getElementById('allOrdersTable');
  if (!box) return;
  const filter = document.getElementById('orderStatusFilter')?.value || 'todos';
  const search = document.getElementById('orderSearch')?.value.trim().toLowerCase() || '';

  let filtered = filter === 'todos' ? orders : orders.filter(o => o.status === filter);
  if (search) {
    filtered = filtered.filter(o =>
      `${o.storeName || ''} ${o.customerId || ''} ${o.id || ''}`.toLowerCase().includes(search)
    );
  }

  if (!filtered.length) {
    box.innerHTML = '<div class="empty">No hay pedidos que coincidan.</div>';
    return;
  }

  box.innerHTML = filtered.map(o => {
    const esFinal = ESTADOS_FINALES.includes(o.status);
    return `
    <article class="user-row">
      <div class="user-main">
        <div class="avatar">📦</div>
        <div>
          <strong>${esc(o.storeName || o.storeId || 'Comercio')}</strong>
          <div class="muted">${esc(ESTADO_LABEL[o.status] || o.status)} · RD$${esc(o.total ?? 0)}</div>
          <small class="muted">Cliente: ${esc(o.customerId || '—')} · Repartidor: ${esc(o.driverId || '—')} · Creado: ${esc(formatDate(o.createdAt))}</small>
        </div>
      </div>
      <div class="user-controls">
        <select class="adminOrderStatus" data-id="${esc(o.id)}" ${esFinal ? 'disabled' : ''}>
          ${Object.keys(ESTADO_LABEL).map((s) => `<option value="${s}" ${s === o.status ? 'selected' : ''}>${ESTADO_LABEL[s]}</option>`).join('')}
        </select>
        ${o.driverId ? `<button type="button" class="btn adminUnassign" data-id="${esc(o.id)}">Quitar repartidor</button>` : ''}
      </div>
    </article>
  `;
  }).join('');

  box.querySelectorAll('.adminOrderStatus').forEach((select) => {
    select.addEventListener('change', async (e) => {
      const previo = select.dataset.previous || select.value;
      select.disabled = true;
      try {
        await adminSetOrderStatus(select.dataset.id, select.value);
        select.dataset.previous = select.value;
        showToast('Estado del pedido actualizado.');
      } catch (err) {
        select.value = previo;
        showToast('No se pudo actualizar el pedido.', true);
        console.error(err);
      } finally {
        select.disabled = false;
      }
    });
  });

  box.querySelectorAll('.adminUnassign').forEach((btn) => {
    btn.addEventListener('click', async () => {
      btn.disabled = true;
      try {
        await adminUnassignDriver(btn.dataset.id);
        showToast('Repartidor removido. El pedido volvió al pool de disponibles.');
      } catch (err) {
        showToast('No se pudo quitar el repartidor.', true);
        console.error(err);
        btn.disabled = false;
      }
    });
  });
}

function renderIssues(orders) {
  const box = document.getElementById('issuesTable');
  if (!box) return;
  const filter = document.getElementById('issueFilter')?.value || 'pendientes';
  let issues = orders.filter(o => CON_INCIDENCIA.includes(o.status));
  if (filter === 'pendientes') issues = issues.filter((o) => !o.resolvedByAdmin);
  else if (filter === 'resueltas') issues = issues.filter((o) => o.resolvedByAdmin);

  if (!issues.length) {
    box.innerHTML = '<div class="empty">No hay incidencias que coincidan.</div>';
    return;
  }

  box.innerHTML = issues.map(o => `
    <article class="user-row">
      <div class="user-main">
        <div class="avatar">🚨</div>
        <div>
          <strong>${esc(o.storeName || o.storeId || 'Comercio')}</strong>
          <div class="muted">${esc(ESTADO_LABEL[o.status] || o.status)} ${o.resolvedByAdmin ? '· ✅ Resuelta' : ''}</div>
          <small class="muted">Cliente: ${esc(o.customerId || '—')} · Repartidor: ${esc(o.driverId || '—')} · ${esc(formatDate(o.updatedAt))}</small>
        </div>
      </div>
      <div class="user-controls">
        <button type="button" class="btn adminResolveIssue" data-id="${esc(o.id)}" data-resolved="${o.resolvedByAdmin ? '0' : '1'}">
          ${o.resolvedByAdmin ? 'Marcar pendiente' : 'Marcar resuelta'}
        </button>
      </div>
    </article>
  `).join('');

  box.querySelectorAll('.adminResolveIssue').forEach((btn) => {
    btn.addEventListener('click', async () => {
      btn.disabled = true;
      try {
        await adminResolveIssue(btn.dataset.id, btn.dataset.resolved === '1');
        showToast('Incidencia actualizada.');
      } catch (err) {
        showToast('No se pudo actualizar la incidencia.', true);
        console.error(err);
        btn.disabled = false;
      }
    });
  });
}

async function loadBusinessConfig() {
  try {
    const snap = await getDoc(doc(db, 'adminSettings', 'config'));
    const data = snap.exists() ? snap.data() : {};
    const setVal = (id, value) => { const el = document.getElementById(id); if (el) el.value = value || ''; };
    setVal('cfgBusinessName', data.businessName);
    setVal('cfgBusinessPhone', data.businessPhone);
    setVal('cfgBusinessEmail', data.businessEmail);
    setVal('cfgBusinessArea', data.businessArea);
  } catch (error) {
    console.error(error);
  }
}

function setupBusinessConfigForm() {
  const form = document.getElementById('businessConfigForm');
  if (!form) return;
  loadBusinessConfig();
  form.addEventListener('submit', async event => {
    event.preventDefault();
    try {
      await setDoc(doc(db, 'adminSettings', 'config'), {
        businessName: document.getElementById('cfgBusinessName').value.trim(),
        businessPhone: document.getElementById('cfgBusinessPhone').value.trim(),
        businessEmail: document.getElementById('cfgBusinessEmail').value.trim(),
        businessArea: document.getElementById('cfgBusinessArea').value.trim(),
        updatedAt: serverTimestamp()
      }, { merge: true });
      showToast('Configuración guardada.');
    } catch (error) {
      console.error(error);
      showToast('No se pudo guardar la configuración.', true);
    }
  });
}

function setupAdminCreateStoreForm() {
  const form = document.getElementById('adminCreateStoreForm');
  if (!form) return;
  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    const name = document.getElementById('newStoreName').value.trim();
    if (!name) return;
    const ownerEmail = document.getElementById('newStoreOwnerEmail').value.trim();
    const visibility = document.getElementById('newStoreVisibility').value;
    const submitBtn = form.querySelector('button[type="submit"]');
    submitBtn.disabled = true;
    try {
      let matchedUser = null;
      if (ownerEmail) matchedUser = await findUserByEmail(ownerEmail);
      if (matchedUser && matchedUser.role !== 'comercio') {
        await changeUserRole(matchedUser.uid, 'comercio');
      }
      await adminCreateStore({
        name,
        category: document.getElementById('newStoreCategory').value.trim(),
        phone: document.getElementById('newStorePhone').value.trim(),
        address: document.getElementById('newStoreAddress').value.trim(),
        description: document.getElementById('newStoreDescription').value.trim(),
        ownerId: matchedUser ? matchedUser.uid : null,
        ownerEmail: matchedUser ? '' : ownerEmail,
        status: visibility === 'pending' ? 'pending' : 'active',
        open: visibility !== 'pending'
      });
      form.reset();
      document.getElementById('newStoreVisibility').value = 'promo';
      if (ownerEmail && !matchedUser) {
        showToast('Comercio creado con promoción activa. Ese correo todavía no tiene cuenta — vincúlalo desde la lista en cuanto se registre.');
      } else if (matchedUser) {
        showToast('Comercio creado y vinculado a la cuenta existente; su rol se subió a Comercio.');
      } else {
        showToast('Comercio creado correctamente.');
      }
    } catch (error) {
      console.error(error);
      showToast('No se pudo crear el comercio.', true);
    } finally {
      submitBtn.disabled = false;
    }
  });
}

// ---- Perfil del comercio (foto + horario), editado por el Admin ----
// Permite al Admin completar la ficha del comercio con una foto y un
// horario semanal. Si el horario queda configurado, ese horario es
// lo que decide si el comercio aparece en Inicio ahora mismo — ver
// `isStoreOpenNow` en stores-service.js.

let adminEditStoreId = null;
let adminEditPendingPhotoDataUrl = null;

function crearFilaHorarioVacia() {
  return { closed: false, open: '', close: '' };
}

function renderStoreHoursForm(hours) {
  const box = document.getElementById('editStoreHours');
  if (!box) return;
  box.innerHTML = DIAS.filter((d) => d !== 'dom').concat('dom').map((d) => {
    const dia = (hours && hours[d]) || crearFilaHorarioVacia();
    return `
      <div class="hours-row" data-day="${d}" style="display:flex;gap:8px;align-items:center;flex-wrap:wrap">
        <span style="min-width:80px;font-weight:700">${DIA_LABEL[d]}</span>
        <label style="display:flex;gap:5px;align-items:center;font-size:13px"><input type="checkbox" class="hoursClosed" ${dia.closed ? 'checked' : ''}> Cerrado</label>
        <input type="time" class="hoursOpen" value="${dia.open || ''}" ${dia.closed ? 'disabled' : ''} style="padding:6px;border:1px solid #ddd;border-radius:8px">
        <span class="muted">a</span>
        <input type="time" class="hoursClose" value="${dia.close || ''}" ${dia.closed ? 'disabled' : ''} style="padding:6px;border:1px solid #ddd;border-radius:8px">
      </div>`;
  }).join('');

  box.querySelectorAll('.hoursClosed').forEach((checkbox) => {
    checkbox.addEventListener('change', () => {
      const row = checkbox.closest('.hours-row');
      row.querySelectorAll('.hoursOpen, .hoursClose').forEach((input) => { input.disabled = checkbox.checked; });
    });
  });
}

function leerHorarioDelForm() {
  const box = document.getElementById('editStoreHours');
  if (!box) return null;
  const hours = {};
  box.querySelectorAll('.hours-row').forEach((row) => {
    const dia = row.dataset.day;
    hours[dia] = {
      closed: row.querySelector('.hoursClosed').checked,
      open: row.querySelector('.hoursOpen').value || '',
      close: row.querySelector('.hoursClose').value || ''
    };
  });
  return hours;
}

async function openAdminStoreEdit(storeId) {
  adminEditStoreId = storeId;
  adminEditPendingPhotoDataUrl = null;
  const box = document.getElementById('adminStoreEditBox');
  const preview = document.getElementById('editStorePhotoPreview');
  const btnQuitarFoto = document.getElementById('btnQuitarFotoComercio');

  document.getElementById('adminStoreEditForm')?.reset();
  preview.style.display = 'none';
  btnQuitarFoto.style.display = 'none';
  renderStoreHoursForm(null);

  if (box) {
    box.style.display = 'block';
    box.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  try {
    const snap = await getDoc(doc(db, 'stores', storeId));
    if (!snap.exists()) return;
    const store = snap.data();
    document.getElementById('adminEditStoreTitle').textContent = `✏️ Editar ${store.name || 'comercio'}`;
    document.getElementById('editStoreName2').value = store.name || '';
    document.getElementById('editStoreCategory2').value = store.category || '';
    document.getElementById('editStorePhone2').value = store.phone || '';
    document.getElementById('editStoreAddress2').value = store.address || '';
    document.getElementById('editStoreDescription2').value = store.description || '';
    adminEditPendingPhotoDataUrl = store.photo || null;
    if (store.photo) {
      preview.src = store.photo;
      preview.style.display = 'block';
      btnQuitarFoto.style.display = 'inline-block';
    }
    renderStoreHoursForm(store.hours || null);
  } catch (err) {
    console.error(err);
    showToast('No se pudo cargar el comercio para editar.', true);
  }
}

function closeAdminStoreEdit() {
  adminEditStoreId = null;
  adminEditPendingPhotoDataUrl = null;
  const box = document.getElementById('adminStoreEditBox');
  if (box) box.style.display = 'none';
}

function setupAdminStoreEditPanel() {
  document.getElementById('btnCerrarEdicionComercio')?.addEventListener('click', closeAdminStoreEdit);

  document.getElementById('editStorePhotoInput')?.addEventListener('change', async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const preview = document.getElementById('editStorePhotoPreview');
    try {
      preview.style.display = 'none';
      adminEditPendingPhotoDataUrl = await compressImageToDataUrl(file);
      preview.src = adminEditPendingPhotoDataUrl;
      preview.style.display = 'block';
      document.getElementById('btnQuitarFotoComercio').style.display = 'inline-block';
    } catch (err) {
      console.error(err);
      showToast(err.message || 'No se pudo procesar la foto.', true);
      e.target.value = '';
    }
  });

  document.getElementById('btnQuitarFotoComercio')?.addEventListener('click', () => {
    adminEditPendingPhotoDataUrl = null;
    const input = document.getElementById('editStorePhotoInput');
    const preview = document.getElementById('editStorePhotoPreview');
    if (input) input.value = '';
    preview.style.display = 'none';
    document.getElementById('btnQuitarFotoComercio').style.display = 'none';
  });

  document.getElementById('adminStoreEditForm')?.addEventListener('submit', async (event) => {
    event.preventDefault();
    if (!adminEditStoreId) return;
    try {
      await updateStoreProfile(adminEditStoreId, {
        name: document.getElementById('editStoreName2').value.trim(),
        category: document.getElementById('editStoreCategory2').value.trim(),
        phone: document.getElementById('editStorePhone2').value.trim(),
        address: document.getElementById('editStoreAddress2').value.trim(),
        description: document.getElementById('editStoreDescription2').value.trim(),
        photo: adminEditPendingPhotoDataUrl,
        hours: leerHorarioDelForm()
      });
      showToast('Perfil del comercio actualizado.');
      closeAdminStoreEdit();
    } catch (err) {
      console.error(err);
      showToast('No se pudo guardar el perfil del comercio.', true);
    }
  });
}

// ---- Productos del comercio, gestionados por el Admin --------------
// Sirve para publicar productos de un comercio que el Admin creó y
// que todavía no tiene dueño (o cuyo dueño no gestiona su catálogo
// todavía) — así el negocio puede mostrarse completo en Inicio desde
// el primer momento, con promoción, antes de que exista una cuenta.

let adminProductsStoreId = null;
let unsubAdminProducts = null;
let adminEditingProductId = null;
let latestAdminProducts = [];
let adminPendingPhotoDataUrl = null; // foto ya comprimida, lista para guardar

function openAdminStoreProducts(storeId, storeName) {
  adminProductsStoreId = storeId;
  resetAdminProductForm();
  const box = document.getElementById('adminStoreProductsBox');
  const title = document.getElementById('adminProductsStoreTitle');
  if (title) title.textContent = `🛍️ Productos de ${storeName || 'este comercio'}`;
  if (box) {
    box.style.display = 'block';
    box.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }
  unsubAdminProducts?.();
  unsubAdminProducts = watchOwnProducts(storeId, renderAdminStoreProducts, (error) => {
    console.error(error);
    const list = document.getElementById('adminStoreProductsList');
    if (list) list.innerHTML = '<div class="error" style="display:block">No se pudieron cargar los productos.</div>';
  });
}

function closeAdminStoreProducts() {
  unsubAdminProducts?.();
  unsubAdminProducts = null;
  adminProductsStoreId = null;
  const box = document.getElementById('adminStoreProductsBox');
  if (box) box.style.display = 'none';
}

function renderAdminStoreProducts(products) {
  latestAdminProducts = products;
  const box = document.getElementById('adminStoreProductsList');
  if (!box) return;
  if (!products.length) {
    box.innerHTML = '<div class="empty">Este comercio todavía no tiene productos. Agrega el primero arriba.</div>';
    return;
  }
  box.innerHTML = products.map((p) => `
    <article class="card">
      <div class="pic">
        ${p.photo ? `<img src="${p.photo}" alt="${esc(p.name)}">` : '🍽️'}
      </div>
      <h3>${esc(p.name)}</h3>
      <div class="muted">${esc(p.description || '')}</div>
      <div class="price">RD$${esc(p.price ?? 0)}</div>
      <div style="display:flex;gap:6px;margin-top:8px">
        <button type="button" class="btn adminEditProduct" data-id="${p.id}" style="flex:1">Editar</button>
        <button type="button" class="btn adminDeleteProduct" data-id="${p.id}" style="flex:1">Eliminar</button>
      </div>
    </article>
  `).join('');

  box.querySelectorAll('.adminDeleteProduct').forEach((btn) => {
    btn.addEventListener('click', async () => {
      if (!confirm('¿Eliminar este producto?')) return;
      try {
        await deleteProduct(adminProductsStoreId, btn.dataset.id);
        if (adminEditingProductId === btn.dataset.id) resetAdminProductForm();
      } catch (err) {
        console.error(err);
        showToast('No se pudo eliminar el producto.', true);
      }
    });
  });

  box.querySelectorAll('.adminEditProduct').forEach((btn) => {
    btn.addEventListener('click', () => startEditingAdminProduct(btn.dataset.id));
  });
}

function startEditingAdminProduct(productId) {
  const product = latestAdminProducts.find((p) => p.id === productId);
  if (!product) return;
  adminEditingProductId = productId;
  adminPendingPhotoDataUrl = product.photo || null;
  document.getElementById('adminProdName').value = product.name || '';
  document.getElementById('adminProdPrice').value = product.price ?? '';
  document.getElementById('adminProdDescription').value = product.description || '';

  const preview = document.getElementById('adminProdPhotoPreview');
  const btnQuitarFoto = document.getElementById('adminBtnQuitarFoto');
  if (product.photo) {
    preview.src = product.photo;
    preview.style.display = 'block';
    btnQuitarFoto.style.display = 'inline-block';
  } else {
    preview.style.display = 'none';
    btnQuitarFoto.style.display = 'none';
  }

  document.getElementById('adminProdSubmit').textContent = 'Guardar cambios';
  document.getElementById('adminProdCancelEdit').style.display = 'inline-block';
}

function resetAdminProductForm() {
  adminEditingProductId = null;
  adminPendingPhotoDataUrl = null;
  document.getElementById('adminProductForm')?.reset();
  const preview = document.getElementById('adminProdPhotoPreview');
  if (preview) preview.style.display = 'none';
  const btnQuitarFoto = document.getElementById('adminBtnQuitarFoto');
  if (btnQuitarFoto) btnQuitarFoto.style.display = 'none';
  const submitBtn = document.getElementById('adminProdSubmit');
  const cancelBtn = document.getElementById('adminProdCancelEdit');
  if (submitBtn) submitBtn.textContent = 'Agregar producto';
  if (cancelBtn) cancelBtn.style.display = 'none';
}

function setupAdminProductsPanel() {
  document.getElementById('btnCerrarProductosAdmin')?.addEventListener('click', closeAdminStoreProducts);
  document.getElementById('adminProdCancelEdit')?.addEventListener('click', resetAdminProductForm);

  document.getElementById('adminProdPhotoInput')?.addEventListener('change', async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const preview = document.getElementById('adminProdPhotoPreview');
    try {
      preview.style.display = 'none';
      adminPendingPhotoDataUrl = await compressImageToDataUrl(file);
      preview.src = adminPendingPhotoDataUrl;
      preview.style.display = 'block';
      document.getElementById('adminBtnQuitarFoto').style.display = 'inline-block';
    } catch (err) {
      console.error(err);
      showToast(err.message || 'No se pudo procesar la foto.', true);
      e.target.value = '';
    }
  });

  document.getElementById('adminBtnQuitarFoto')?.addEventListener('click', () => {
    adminPendingPhotoDataUrl = null;
    const input = document.getElementById('adminProdPhotoInput');
    const preview = document.getElementById('adminProdPhotoPreview');
    if (input) input.value = '';
    preview.style.display = 'none';
    document.getElementById('adminBtnQuitarFoto').style.display = 'none';
  });

  document.getElementById('adminProductForm')?.addEventListener('submit', async (event) => {
    event.preventDefault();
    if (!adminProductsStoreId) return;
    const payload = {
      name: document.getElementById('adminProdName').value.trim(),
      price: Number(document.getElementById('adminProdPrice').value) || 0,
      description: document.getElementById('adminProdDescription').value.trim(),
      photo: adminPendingPhotoDataUrl
    };
    try {
      if (adminEditingProductId) {
        await updateProduct(adminProductsStoreId, adminEditingProductId, payload);
        showToast('Producto actualizado.');
      } else {
        await addProduct(adminProductsStoreId, payload);
        showToast('Producto agregado. Ya es visible en Inicio si el comercio está Activo y abierto.');
      }
      resetAdminProductForm();
    } catch (err) {
      console.error(err);
      showToast('No se pudo guardar el producto.', true);
    }
  });
}

let catalogProducts = [];
let editingCatalogProductId = null;
let pendingCatalogPhoto = null;

function renderCatalogInventory(products) {
  catalogProducts = products;
  const list = document.getElementById('catalogInventoryList');
  const seedButton = document.getElementById('catalogSeedDefaults');
  if (!list) return;
  if (seedButton) seedButton.style.display = products.length ? 'none' : 'inline-block';
  if (!products.length) {
    list.innerHTML = '<div class="empty">El inventario está vacío. Puedes agregar un producto o importar el catálogo que ya tiene fotos.</div>';
    return;
  }
  list.innerHTML = products.map(product => `
    <article class="card product-tile">
      <div class="pic product-tile-photo${product.photo ? '' : ' product-tile-no-photo'}">${product.photo ? `<img src="${esc(product.photo)}" alt="${esc(product.name)}">` : '📦'}</div>
      <div class="product-tile-body">
        <h3>${esc(product.name)}</h3>
        <span class="product-category">${esc(product.category || 'Sin categoría')}</span>
        <div class="muted">${esc(product.description || '')}</div>
      </div>
      <div class="price">RD$ ${esc(product.price ?? 0)}</div>
      <span class="product-stock${product.visibility === 'private' ? ' product-stock-empty' : ''}">${product.visibility === 'private' ? 'Privado' : 'Publicado'}</span>
      <div class="product-tile-actions">
        ${product.visibility === 'private' ? `<button type="button" class="btn primary catalogProductPublish" data-id="${esc(product.id)}">Publicar</button>` : ''}
        <button type="button" class="btn catalogProductEdit" data-id="${esc(product.id)}">Editar</button>
        <button type="button" class="btn catalogProductDelete" data-id="${esc(product.id)}">Eliminar</button>
      </div>
    </article>
  `).join('');
}

function resetCatalogProductForm() {
  editingCatalogProductId = null;
  pendingCatalogPhoto = null;
  document.getElementById('catalogProductForm')?.reset();
  const preview = document.getElementById('catalogProductPhotoPreview');
  const photoPlaceholder = document.getElementById('catalogProductPhotoPlaceholder');
  if (preview) {
    preview.removeAttribute('src');
    preview.style.display = 'none';
  }
  if (photoPlaceholder) photoPlaceholder.style.display = '';
  const fileInput = document.getElementById('catalogProductPhoto');
  if (fileInput) fileInput.value = '';
  const removeButton = document.getElementById('catalogProductRemovePhoto');
  if (removeButton) removeButton.style.display = 'none';
  const submitButton = document.getElementById('catalogProductSubmit');
  if (submitButton) submitButton.textContent = 'Agregar al inventario';
  const cancelButton = document.getElementById('catalogProductCancel');
  if (cancelButton) cancelButton.style.display = 'none';
}

function setupCatalogInventoryPanel() {
  const categorySelect = document.getElementById('catalogProductCategory');
  if (categorySelect) {
    categorySelect.innerHTML = CATEGORIES.map(category =>
      `<option value="${esc(category.id)}">${esc(category.name)}</option>`
    ).join('');
  }

  const form = document.getElementById('catalogProductForm');
  const list = document.getElementById('catalogInventoryList');
  const preview = document.getElementById('catalogProductPhotoPreview');
  const photoInput = document.getElementById('catalogProductPhoto');
  const removePhoto = document.getElementById('catalogProductRemovePhoto');
  const unsubscribe = watchCatalogInventory(renderCatalogInventory, error => {
    console.error(error);
    if (list) list.innerHTML = '<div class="error" style="display:block">No se pudo cargar el inventario. Revisa Firebase y las reglas de Firestore.</div>';
  });
  syncPublishedCatalog().catch(error => {
    console.error('No se pudo sincronizar el inventario público de LEDPOD:', error);
    showToast('No se pudo sincronizar el catálogo público. Revisa Firebase y las reglas de Firestore.', true);
  });

  document.getElementById('catalogSeedDefaults')?.addEventListener('click', async event => {
    const button = event.currentTarget;
    button.disabled = true;
    try {
      await seedCatalogProducts(PRODUCTS);
      showToast('Se importó el catálogo actual con sus imágenes.');
    } catch (error) {
      console.error(error);
      showToast(error.message || 'No se pudo importar el catálogo.', true);
    } finally {
      button.disabled = false;
    }
  });

  photoInput?.addEventListener('change', async () => {
    const file = photoInput.files?.[0];
    if (!file) return;
    try {
      pendingCatalogPhoto = await compressImageToDataUrl(file);
      preview.src = pendingCatalogPhoto;
      preview.style.display = 'block';
      photoPlaceholder.style.display = 'none';
      removePhoto.style.display = 'inline-block';
    } catch (error) {
      console.error(error);
      showToast(error.message || 'No se pudo procesar la imagen.', true);
      photoInput.value = '';
    }
  });

  removePhoto?.addEventListener('click', () => {
    pendingCatalogPhoto = null;
    photoInput.value = '';
    preview.removeAttribute('src');
    preview.style.display = 'none';
    photoPlaceholder.style.display = '';
    removePhoto.style.display = 'none';
  });

  document.getElementById('catalogProductCancel')?.addEventListener('click', resetCatalogProductForm);

  list?.addEventListener('click', async event => {
    const publishButton = event.target.closest('.catalogProductPublish');
    const editButton = event.target.closest('.catalogProductEdit');
    const deleteButton = event.target.closest('.catalogProductDelete');
    if (publishButton) {
      const product = catalogProducts.find(item => item.id === publishButton.dataset.id);
      if (!product) return;
      publishButton.disabled = true;
      try {
        await updateCatalogProduct(product.id, { ...product, visibility: 'public' });
        showToast('Producto publicado en la tienda.');
      } catch (error) {
        console.error(error);
        showToast('No se pudo publicar el producto. Revisa las reglas de Firestore.', true);
      } finally {
        publishButton.disabled = false;
      }
      return;
    }
    if (editButton) {
      const product = catalogProducts.find(item => item.id === editButton.dataset.id);
      if (!product) return;
      editingCatalogProductId = product.id;
      pendingCatalogPhoto = product.photo || null;
      document.getElementById('catalogProductName').value = product.name || '';
      categorySelect.value = product.category || CATEGORIES[0].id;
      document.getElementById('catalogProductPrice').value = product.price ?? '';
      document.getElementById('catalogProductDescription').value = product.description || '';
      document.getElementById('catalogProductVisibility').value = product.visibility || 'public';
      if (product.photo) {
        preview.src = product.photo;
        preview.style.display = 'block';
        photoPlaceholder.style.display = 'none';
        removePhoto.style.display = 'inline-block';
      } else {
        preview.removeAttribute('src');
        preview.style.display = 'none';
        photoPlaceholder.style.display = '';
        removePhoto.style.display = 'none';
      }
      document.getElementById('catalogProductSubmit').textContent = 'Guardar cambios';
      document.getElementById('catalogProductCancel').style.display = 'inline-block';
      form.scrollIntoView({ behavior: 'smooth', block: 'start' });
      return;
    }
    if (deleteButton && confirm('¿Eliminar este producto del inventario?')) {
      try {
        await deleteCatalogProduct(deleteButton.dataset.id);
        if (editingCatalogProductId === deleteButton.dataset.id) resetCatalogProductForm();
        showToast('Producto eliminado.');
      } catch (error) {
        console.error(error);
        showToast('No se pudo eliminar el producto.', true);
      }
    }
  });

  form?.addEventListener('submit', async event => {
    event.preventDefault();
    const product = {
      name: document.getElementById('catalogProductName').value,
      category: categorySelect.value,
      price: document.getElementById('catalogProductPrice').value,
      description: document.getElementById('catalogProductDescription').value,
      visibility: document.getElementById('catalogProductVisibility').value,
      photo: pendingCatalogPhoto
    };
    try {
      if (editingCatalogProductId) {
        await updateCatalogProduct(editingCatalogProductId, product);
        showToast(product.visibility === 'public'
          ? 'Producto actualizado y publicado en la tienda.'
          : 'Producto actualizado y guardado en el inventario privado.');
      } else {
        await addCatalogProduct(product);
        showToast(product.visibility === 'public' ? 'Producto publicado en la tienda.' : 'Producto guardado en el inventario privado.');
      }
      resetCatalogProductForm();
    } catch (error) {
      console.error(error);
      showToast('No se pudo guardar el producto. Revisa los datos y las reglas de Firestore.', true);
    }
  });

  return unsubscribe;
}

function setupAdminProfile(session) {
  const form = document.getElementById('adminProfileForm');
  if (!form) return;

  const profile = session.profile;
  const nameInput = document.getElementById('adminProfileName');
  const photoInput = document.getElementById('adminProfilePhoto');
  const preview = document.getElementById('adminProfilePhotoPreview');
  const removePhoto = document.getElementById('adminProfileRemovePhoto');
  const saveButton = document.getElementById('adminProfileSave');
  let photoURL = profile.photoURL || null;

  nameInput.value = profile.name || session.user.displayName || '';
  document.getElementById('adminProfilePhone').value = profile.phone || '';
  document.getElementById('adminProfilePosition').value = profile.position || '';
  document.getElementById('adminProfileBio').value = profile.bio || '';
  document.getElementById('adminProfileEmail').value = profile.email || session.user.email || '';

  function renderPhoto() {
    if (photoURL) {
      preview.src = photoURL;
      preview.style.display = 'block';
      removePhoto.style.display = 'inline-block';
    } else {
      preview.removeAttribute('src');
      preview.style.display = 'none';
      removePhoto.style.display = 'none';
    }
    const avatar = document.getElementById('profileAvatar');
    if (avatar) {
      if (photoURL) avatar.innerHTML = `<img src="${esc(photoURL)}" alt="">`;
      else avatar.textContent = (nameInput.value.trim() || session.user.email || 'A').charAt(0).toUpperCase();
    }
  }

  renderPhoto();

  photoInput.addEventListener('change', async () => {
    const file = photoInput.files?.[0];
    if (!file) return;
    try {
      photoURL = await compressImageToDataUrl(file);
      renderPhoto();
    } catch (error) {
      console.error(error);
      showToast(error.message || 'No se pudo procesar la imagen.', true);
      photoInput.value = '';
    }
  });

  removePhoto.addEventListener('click', () => {
    photoURL = null;
    photoInput.value = '';
    renderPhoto();
  });

  form.addEventListener('submit', async event => {
    event.preventDefault();
    saveButton.disabled = true;
    try {
      const name = nameInput.value.trim();
      await updateDoc(doc(db, 'users', session.user.uid), {
        name,
        phone: document.getElementById('adminProfilePhone').value.trim(),
        position: document.getElementById('adminProfilePosition').value.trim(),
        bio: document.getElementById('adminProfileBio').value.trim(),
        photoURL,
        updatedAt: serverTimestamp()
      });
      document.getElementById('profileName').textContent = name || session.user.email || 'Administrador';
      renderPhoto();
      showToast('Perfil actualizado.');
    } catch (error) {
      console.error(error);
      showToast('No se pudo guardar el perfil. Revisa las reglas de Firestore.', true);
    } finally {
      saveButton.disabled = false;
    }
  });

  document.getElementById('adminPasswordReset').addEventListener('click', async event => {
    const button = event.currentTarget;
    button.disabled = true;
    try {
      const email = session.user.email;
      if (!email) throw new Error('La cuenta no tiene un correo de acceso.');
      await sendPasswordResetEmail(auth, email);
      showToast(`Enviamos el enlace para cambiar la contraseña a ${email}.`);
    } catch (error) {
      console.error(error);
      showToast(error.message || 'No se pudo enviar el enlace para cambiar la contraseña.', true);
    } finally {
      button.disabled = false;
    }
  });
}

export function initAdminDashboard(session) {
  let latestUsers = [];
  let latestOrders = [];
  let latestStores = [];
  let latestDrivers = [];

  const redraw = () => renderUsers(latestUsers);
  ['userSearch', 'roleFilter', 'statusFilter'].forEach(id => {
    document.getElementById(id)?.addEventListener(id === 'userSearch' ? 'input' : 'change', redraw);
  });

  document.getElementById('orderStatusFilter')?.addEventListener('change', () => renderAllOrders(latestOrders));
  document.getElementById('orderSearch')?.addEventListener('input', () => renderAllOrders(latestOrders));
  document.getElementById('issueFilter')?.addEventListener('change', () => renderIssues(latestOrders));
  document.getElementById('storeSearch')?.addEventListener('input', () => renderStores(latestStores));
  document.getElementById('driverSearch')?.addEventListener('input', () => renderDrivers(latestDrivers));
  setupBusinessConfigForm();
  setupAdminCreateStoreForm();
  setupAdminProductsPanel();
  setupAdminStoreEditPanel();
  setupAdminProfile(session);
  const unsubscribeCatalog = setupCatalogInventoryPanel();

  const unsubscribeOrders = watchAllOrders(orders => {
    latestOrders = orders;
    setCount('statOrdersTotal', orders.length);
    setCount('statOrdersDelivered', orders.filter(o => o.status === 'delivered').length);
    setCount('statOrdersActive', orders.filter(o => EN_CURSO.includes(o.status)).length);
    setCount('statOrdersIssues', orders.filter(o => CON_INCIDENCIA.includes(o.status) && !o.resolvedByAdmin).length);
    renderAllOrders(orders);
    renderIssues(orders);
  }, error => {
    console.error(error);
    const box = document.getElementById('allOrdersTable');
    if (box) box.innerHTML = '<div class="error" style="display:block">No se pudieron cargar los pedidos.</div>';
  });

  const unsubscribeUsers = watchUsers(users => {
    latestUsers = users;
    setCount('userCount', users.length);
    setCount('clientCount', users.filter(u => (u.role || 'cliente') === 'cliente').length);
    setCount('merchantCount', users.filter(u => u.role === 'comercio').length);
    setCount('driverCount', users.filter(u => u.role === 'repartidor').length);
    setCount('adminCount', users.filter(u => u.role === 'admin').length);
    redraw();
  }, error => {
    console.error(error);
    const box = document.getElementById('usersTable');
    if (box) box.innerHTML = '<div class="error" style="display:block">No se pudieron cargar los usuarios. Revisa Firebase y las reglas de Firestore.</div>';
  });

  const unsubscribeStores = onSnapshot(collection(db, 'stores'), (snap) => {
    latestStores = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
    renderStores(latestStores);
  }, (err) => console.error(err));

  const unsubscribeDrivers = onSnapshot(collection(db, 'drivers'), (snap) => {
    latestDrivers = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
    renderDrivers(latestDrivers);
  }, (err) => console.error(err));

  return () => {
    unsubscribeUsers();
    unsubscribeStores();
    unsubscribeDrivers();
    unsubscribeOrders();
    unsubscribeCatalog();
    closeAdminStoreProducts();
  };
}

export const adminDashboard = {
  role: 'admin',
  title: 'Admin Central',
  sections: ['resumen', 'usuarios', 'comercios', 'repartidores', 'pedidos', 'incidencias', 'configuracion']
};
