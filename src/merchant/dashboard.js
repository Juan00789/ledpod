// src/merchant/dashboard.js
import { esc, money, formatDate, showToast } from '../shared/utils.js';
import {
  addSelectedProductPhotos,
  getProductPhotos,
  productPhotoFields,
  renderProductPhotoGallery
} from '../shared/product-photos.js';
import { CATEGORIES, categoryIdFromValue } from '../data.js';
import {
  watchOwnStore,
  createStore,
  updateStoreProfile,
  setStoreOpen,
  isStoreOpenNow,
  hayHorarioConfigurado,
  watchOwnProducts,
  addProduct,
  updateProduct,
  deleteProduct
} from '../catalog/stores-service.js';
import { watchStoreOrders, updateOrderStatusByStore, ESTADO_LABEL } from '../orders/orders-service.js';

export const merchantDashboard = {
  role: 'comercio',
  title: 'Centro del Comercio',
  sections: ['inicio', 'productos', 'pedidos', 'perfil']
};

const ESTADOS_COMERCIO = ['confirmed', 'preparing', 'ready', 'cancelled'];
const ESTADOS_FUERA_DE_ALCANCE = ['assigned', 'picked_up', 'on_the_way', 'delivered'];

let currentStore = null;
let unsubProducts = null;
let unsubOrders = null;
let editingProductId = null;
let pendingProductPhotos = [];

function renderStoreState(store) {
  const noStoreBox = document.getElementById('noStoreBox');
  const statusBox = document.getElementById('storeStatusBox');
  const title = document.getElementById('merchantTitle');
  const subtitle = document.getElementById('merchantSubtitle');

  if (!store) {
    noStoreBox.style.display = 'block';
    statusBox.style.display = 'none';
    return;
  }

  noStoreBox.style.display = 'none';
  statusBox.style.display = 'block';
  title.textContent = store.name;

  const APROBACION = {
    pending: ['Pendiente de aprobación', 'Un administrador tiene que activar tu comercio antes de que puedas recibir pedidos.'],
    active: ['Comercio aprobado', 'Ya puedes abrir y empezar a recibir pedidos.'],
    paused: ['Comercio pausado', 'Contacta a soporte si esto no era lo esperado.'],
    suspended: ['Comercio suspendido', 'Contacta a soporte para más información.']
  };
  const [estadoTexto, estadoHint] = APROBACION[store.status] || APROBACION.pending;
  document.getElementById('storeApprovalStatus').textContent = estadoTexto;
  document.getElementById('storeApprovalHint').textContent = estadoHint;

  const tieneHorario = hayHorarioConfigurado(store.hours);
  const abiertoAhora = isStoreOpenNow(store);
  subtitle.textContent = tieneHorario
    ? (abiertoAhora ? 'Abierto ahora según tu horario configurado por el Admin.' : 'Cerrado ahora según tu horario configurado por el Admin.')
    : (store.open ? 'Tu comercio está abierto y visible para clientes.' : 'Tu comercio está cerrado ahora mismo.');

  const btnToggle = document.getElementById('btnToggleOpen');
  btnToggle.textContent = store.open ? 'Cerrar comercio' : 'Abrir comercio';
  btnToggle.disabled = store.status !== 'active' || tieneHorario;
  btnToggle.title = tieneHorario
    ? 'El horario semanal (configurado por el Admin) controla cuándo apareces en Inicio.'
    : (store.status !== 'active' ? 'Tu comercio todavía no está aprobado.' : '');

  // Precargar el formulario de edición de perfil.
  document.getElementById('editStoreName').value = store.name || '';
  document.getElementById('editStoreCategory').value = store.category || '';
  document.getElementById('editStorePhone').value = store.phone || '';
  document.getElementById('editStoreAddress').value = store.address || '';
  document.getElementById('editStoreDescription').value = store.description || '';
}

function renderStats(orders) {
  const total = orders.length;
  const delivered = orders.filter((o) => o.status === 'delivered');
  const pending = orders.filter((o) => !['delivered', 'cancelled', 'failed'].includes(o.status));
  const revenue = delivered.reduce((sum, o) => sum + Number(o.subtotal || 0), 0);
  const calificados = orders.filter((o) => o.rating?.stars);
  const promedio = calificados.length
    ? calificados.reduce((sum, o) => sum + o.rating.stars, 0) / calificados.length
    : null;

  document.getElementById('statTotal').textContent = total;
  document.getElementById('statDelivered').textContent = delivered.length;
  document.getElementById('statPending').textContent = pending.length;
  document.getElementById('statRevenue').textContent = money(revenue);
  const ratingEl = document.getElementById('statRating');
  if (ratingEl) ratingEl.textContent = promedio ? `⭐ ${promedio.toFixed(1)} (${calificados.length})` : '—';
}

function renderOrders(orders) {
  const box = document.getElementById('storeOrdersList');
  if (!orders.length) {
    box.innerHTML = '<div class="empty">Todavía no has recibido pedidos.</div>';
    return;
  }
  box.innerHTML = orders.map((o) => {
    const fueraDeAlcance = ESTADOS_FUERA_DE_ALCANCE.includes(o.status) || ['delivered', 'cancelled'].includes(o.status);
    const controlEstado = fueraDeAlcance
      ? `<span class="role">${esc(ESTADO_LABEL[o.status] || o.status)}</span>`
      : `<select class="estadoSelect" data-id="${o.id}">
          ${ESTADOS_COMERCIO.map((s) => `<option value="${s}" ${s === o.status ? 'selected' : ''}>${ESTADO_LABEL[s]}</option>`).join('')}
        </select>`;
    return `
      <article class="user-row">
        <div class="user-main">
          <div>
            <strong>${(o.items || []).map((i) => `${esc(i.name)} ×${i.quantity}`).join(', ')}</strong>
            <div class="muted">${money(o.subtotal)} · ${esc(o.customerAddress || '')}</div>
            <small class="muted">${formatDate(o.createdAt)}</small>
          </div>
        </div>
        <div class="user-controls">${controlEstado}</div>
      </article>
    `;
  }).join('');

  box.querySelectorAll('.estadoSelect').forEach((select) => {
    select.addEventListener('change', async (e) => {
      const previo = select.dataset.previous || select.value;
      select.disabled = true;
      try {
        await updateOrderStatusByStore(select.dataset.id, select.value);
        select.dataset.previous = select.value;
        showToast('merchantToast', 'Estado del pedido actualizado.');
      } catch (err) {
        select.value = previo;
        showToast('merchantToast', err.message || 'No se pudo actualizar el pedido.', true);
        console.error(err);
      } finally {
        select.disabled = false;
      }
    });
  });
}

let latestProducts = [];

function renderProducts(products) {
  latestProducts = products;
  const box = document.getElementById('productsList');
  const count = document.getElementById('productCount');
  if (count) count.textContent = `${products.length} ${products.length === 1 ? 'producto' : 'productos'}`;
  if (!products.length) {
    box.innerHTML = '<div class="empty">Todavía no tienes productos.</div>';
    return;
  }
  box.innerHTML = products.map((p) => {
    const photos = getProductPhotos(p);
    const tieneStock = typeof p.stock === 'number';
    const agotado = tieneStock && p.stock <= 0;
    const stockBadge = !tieneStock
      ? ''
      : agotado
        ? '<span class="product-stock product-stock-empty">Agotado</span>'
        : `<span class="product-stock${p.stock <= 3 ? ' product-stock-low' : ''}">Stock: ${p.stock}</span>`;
    return `
    <article class="card product-tile">
      <div class="pic product-tile-photo${photos.length ? '' : ' product-tile-no-photo'}">
        ${photos.length ? `<img src="${esc(photos[0])}" alt="${esc(p.name)}">` : '📦'}
        ${photos.length > 1 ? `<span class="product-photo-count">1 / ${photos.length}</span>` : ''}
      </div>
      <div class="product-tile-body">
        <h3>${esc(p.name)}</h3>
        ${p.category ? `<span class="product-category">${esc(p.category)}</span>` : ''}
        <div class="muted">${esc(p.description || '')}</div>
      </div>
      <div class="price">${money(p.price)}</div>
      ${stockBadge ? `<div>${stockBadge}</div>` : ''}
      <div class="product-tile-actions">
        <button type="button" class="btn" data-edit="${p.id}">Editar</button>
        <button type="button" class="btn" data-delete="${p.id}">Eliminar</button>
      </div>
    </article>
  `;
  }).join('');

  box.querySelectorAll('[data-delete]').forEach((btn) => {
    btn.addEventListener('click', async () => {
      if (!confirm('¿Eliminar este producto?')) return;
      try {
        await deleteProduct(currentStore.id, btn.dataset.delete);
        if (editingProductId === btn.dataset.delete) resetProductForm();
      } catch (err) {
        console.error(err);
        showToast('merchantToast', 'No se pudo eliminar el producto.', true);
      }
    });
  });

  box.querySelectorAll('[data-edit]').forEach((btn) => {
    btn.addEventListener('click', () => startEditingProduct(btn.dataset.edit));
  });
}

function startEditingProduct(productId) {
  const product = latestProducts.find((p) => p.id === productId);
  if (!product) return;
  editingProductId = productId;
  pendingProductPhotos = getProductPhotos(product);

  document.getElementById('prodNameInput').value = product.name || '';
  document.getElementById('prodPriceInput').value = product.price ?? '';
  document.getElementById('prodCategoryInput').value = categoryIdFromValue(product.category);
  document.getElementById('prodDescriptionInput').value = product.description || '';
  document.getElementById('prodStockInput').value = typeof product.stock === 'number' ? product.stock : '';

  renderMerchantProductPhotoPreview();

  document.getElementById('btnProductSubmit').textContent = 'Guardar cambios';
  document.getElementById('btnCancelarEdicion').style.display = 'inline-block';
  document.getElementById('prodNameInput').scrollIntoView({ behavior: 'smooth', block: 'center' });
}

function renderMerchantProductPhotoPreview() {
  const preview = document.getElementById('prodPhotoPreview');
  renderProductPhotoGallery(preview, pendingProductPhotos, index => {
    pendingProductPhotos.splice(index, 1);
    renderMerchantProductPhotoPreview();
  });
  const clearButton = document.getElementById('btnQuitarFoto');
  if (clearButton) clearButton.style.display = pendingProductPhotos.length ? 'inline-block' : 'none';
}

function resetProductForm() {
  editingProductId = null;
  pendingProductPhotos = [];
  document.getElementById('productForm')?.reset();
  renderMerchantProductPhotoPreview();
  document.getElementById('btnProductSubmit').textContent = 'Agregar producto';
  document.getElementById('btnCancelarEdicion').style.display = 'none';
}

function startStoreScopedListeners(storeId) {
  unsubProducts?.();
  unsubOrders?.();
  unsubProducts = watchOwnProducts(storeId, renderProducts);
  unsubOrders = watchStoreOrders(storeId, (orders) => {
    renderStats(orders);
    renderOrders(orders);
  });
}

export function initMerchantDashboard(session) {
  const uid = session.user.uid;
  const categorySelect = document.getElementById('prodCategoryInput');
  renderMerchantProductPhotoPreview();
  if (categorySelect) {
    categorySelect.innerHTML = '<option value="" selected disabled>Selecciona una categoría</option>' + CATEGORIES.map(category =>
      `<option value="${esc(category.id)}">${esc(category.name)}</option>`
    ).join('');
  }

  document.getElementById('createStoreForm')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    try {
      await createStore(uid, {
        name: document.getElementById('storeNameInput').value.trim(),
        category: document.getElementById('storeCategoryInput').value.trim(),
        phone: document.getElementById('storePhoneInput').value.trim(),
        address: document.getElementById('storeAddressInput').value.trim(),
        description: document.getElementById('storeDescriptionInput').value.trim()
      });
      showToast('merchantToast', 'Comercio creado. Queda pendiente de aprobación.');
    } catch (err) {
      console.error(err);
      showToast('merchantToast', 'No se pudo crear el comercio.', true);
    }
  });

  document.getElementById('btnToggleOpen')?.addEventListener('click', async () => {
    if (!currentStore) return;
    try {
      await setStoreOpen(currentStore.id, !currentStore.open);
    } catch (err) {
      console.error(err);
      showToast('merchantToast', 'No se pudo cambiar el estado del comercio.', true);
    }
  });

  document.getElementById('storeProfileForm')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    if (!currentStore) return;
    try {
      await updateStoreProfile(currentStore.id, {
        name: document.getElementById('editStoreName').value.trim(),
        category: document.getElementById('editStoreCategory').value.trim(),
        phone: document.getElementById('editStorePhone').value.trim(),
        address: document.getElementById('editStoreAddress').value.trim(),
        description: document.getElementById('editStoreDescription').value.trim()
      });
      showToast('merchantToast', 'Perfil del comercio actualizado.');
    } catch (err) {
      console.error(err);
      showToast('merchantToast', 'No se pudo guardar el perfil.', true);
    }
  });

  document.getElementById('prodPhotoInput')?.addEventListener('change', async (e) => {
    const input = e.target;
    if (!input.files?.length) return;
    try {
      pendingProductPhotos = await addSelectedProductPhotos(input.files, pendingProductPhotos);
      renderMerchantProductPhotoPreview();
    } catch (err) {
      console.error(err);
      showToast('merchantToast', err.message || 'No se pudo procesar la foto.', true);
    } finally {
      input.value = '';
    }
  });

  document.getElementById('btnQuitarFoto')?.addEventListener('click', () => {
    pendingProductPhotos = [];
    const input = document.getElementById('prodPhotoInput');
    if (input) input.value = '';
    renderMerchantProductPhotoPreview();
  });

  document.getElementById('btnCancelarEdicion')?.addEventListener('click', () => resetProductForm());

  document.getElementById('productForm')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    if (!currentStore) {
      showToast('merchantToast', 'Crea tu comercio primero.', true);
      return;
    }
    const payload = {
      name: document.getElementById('prodNameInput').value.trim(),
      price: document.getElementById('prodPriceInput').value,
      category: categorySelect.value,
      description: document.getElementById('prodDescriptionInput').value.trim(),
      ...productPhotoFields(pendingProductPhotos),
      stock: document.getElementById('prodStockInput').value.trim()
    };
    try {
      if (editingProductId) {
        await updateProduct(currentStore.id, editingProductId, {
          ...payload,
          price: Number(payload.price) || 0,
          stock: payload.stock === '' ? null : Math.max(0, Math.floor(Number(payload.stock)) || 0)
        });
        showToast('merchantToast', 'Producto actualizado.');
      } else {
        await addProduct(currentStore.id, payload);
        showToast('merchantToast', 'Producto agregado.');
      }
      resetProductForm();
    } catch (err) {
      console.error(err);
      showToast('merchantToast', 'No se pudo guardar el producto.', true);
    }
  });

  const unsubStore = watchOwnStore(uid, (store) => {
    const eraNuevo = !currentStore && store;
    currentStore = store;
    renderStoreState(store);
    if (eraNuevo) startStoreScopedListeners(store.id);
  });

  return () => {
    unsubStore();
    unsubProducts?.();
    unsubOrders?.();
    unsubProducts = null;
    unsubOrders = null;
    currentStore = null;
  };
}
