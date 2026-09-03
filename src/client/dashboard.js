// src/client/dashboard.js
import {
  doc,
  getDoc,
  setDoc,
  updateDoc,
  serverTimestamp,
  arrayUnion,
  arrayRemove
} from 'https://www.gstatic.com/firebasejs/12.1.0/firebase-firestore.js';
import { db } from '../../firebase.js';
import { esc, money, formatDate, showToast } from '../shared/utils.js';
import { compressImageToDataUrl } from '../shared/img-utils.js';
import { watchOpenStores, getStoreProducts } from '../catalog/stores-service.js';
import {
  createOrder,
  watchCustomerOrders,
  cancelOrderByCustomer,
  rateOrder,
  ESTADO_LABEL
} from '../orders/orders-service.js';

export const clientDashboard = {
  role: 'cliente',
  title: 'Mi Rapidito',
  sections: ['inicio', 'favoritos', 'pedidos', 'carrito', 'perfil']
};

const DELIVERY_FEE = 100; // tarifa fija de envío para el MVP

let cart = [];               // [{ productId, name, price, quantity }]
let cartStore = null;        // { id, name }
let cartAddress = '';
let currentUid = null;
let favoriteIds = [];         // storeId[] — cargados de customers/{uid}.favorites
let latestOpenStores = [];    // última lista de comercios abiertos (para pintar favoritos sin otra consulta)

function renderStores(stores) {
  latestOpenStores = stores;
  const box = document.getElementById('storeGrid');
  if (!box) return;
  const search = document.getElementById('storeSearchInput')?.value.trim().toLowerCase() || '';
  const filtered = search
    ? stores.filter((s) => `${s.name || ''} ${s.category || ''}`.toLowerCase().includes(search))
    : stores;

  if (!stores.length) {
    box.innerHTML = '<div class="empty">Todavía no hay comercios abiertos. Vuelve a intentarlo en un rato.</div>';
    return;
  }
  if (!filtered.length) {
    box.innerHTML = '<div class="empty">Ningún comercio coincide con tu búsqueda.</div>';
    return;
  }
  box.innerHTML = filtered.map((s) => `
    <article class="card" style="position:relative">
      <button type="button" class="favBtn" data-fav-toggle="${s.id}" data-fav-name="${esc(s.name)}"
        aria-label="Favorito" style="position:absolute;top:10px;right:10px;background:#fff;border-radius:50%;width:32px;height:32px;font-size:16px;box-shadow:0 1px 4px rgba(0,0,0,.15)">
        ${favoriteIds.includes(s.id) ? '❤️' : '🤍'}
      </button>
      <div class="pic" data-store-id="${s.id}" data-store-name="${esc(s.name)}" style="cursor:pointer">
        ${s.photo ? `<img src="${s.photo}" alt="${esc(s.name)}">` : '🏪'}
      </div>
      <h3 data-store-id="${s.id}" data-store-name="${esc(s.name)}" style="cursor:pointer">${esc(s.name)}</h3>
      <div class="muted">${esc(s.category || 'Comercio')}</div>
    </article>
  `).join('');

  box.querySelectorAll('[data-store-id]').forEach((el) => {
    el.addEventListener('click', () => openStore(el.dataset.storeId, el.dataset.storeName));
  });
  box.querySelectorAll('[data-fav-toggle]').forEach((btn) => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      toggleFavorite(btn.dataset.favToggle, btn.dataset.favName);
    });
  });
}

async function toggleFavorite(storeId, storeName) {
  const isFav = favoriteIds.includes(storeId);
  try {
    await setDoc(doc(db, 'customers', currentUid), {
      userId: currentUid,
      favorites: isFav ? arrayRemove(storeId) : arrayUnion(storeId),
      updatedAt: serverTimestamp()
    }, { merge: true });
    favoriteIds = isFav ? favoriteIds.filter((id) => id !== storeId) : [...favoriteIds, storeId];
    renderStores(latestOpenStores);
    renderFavorites();
    showToast('clientToast', isFav ? `${storeName} quitado de favoritos.` : `${storeName} agregado a favoritos.`);
  } catch (err) {
    console.error(err);
    showToast('clientToast', 'No se pudo actualizar tus favoritos.', true);
  }
}

function renderFavorites() {
  const box = document.getElementById('favoritesGrid');
  if (!box) return;
  if (!favoriteIds.length) {
    box.innerHTML = '<div class="empty">Todavía no tienes comercios favoritos. Toca el corazón en cualquier comercio de Inicio.</div>';
    return;
  }
  const disponibles = latestOpenStores.filter((s) => favoriteIds.includes(s.id));
  const noDisponibles = favoriteIds.length - disponibles.length;

  box.innerHTML = disponibles.map((s) => `
    <article class="card" data-store-id="${s.id}" data-store-name="${esc(s.name)}" style="cursor:pointer">
      <div class="pic">🏪</div>
      <h3>${esc(s.name)}</h3>
      <div class="muted">${esc(s.category || 'Comercio')}</div>
    </article>
  `).join('') + (noDisponibles > 0
    ? `<div class="empty">${noDisponibles} favorito${noDisponibles > 1 ? 's' : ''} más, cerrado${noDisponibles > 1 ? 's' : ''} o no disponible${noDisponibles > 1 ? 's' : ''} ahora.</div>`
    : '');

  box.querySelectorAll('[data-store-id]').forEach((card) => {
    card.addEventListener('click', () => {
      document.querySelector('.side-link[data-section="inicio"]')?.click();
      openStore(card.dataset.storeId, card.dataset.storeName);
    });
  });
}

async function openStore(storeId, storeName) {
  document.getElementById('storeBrowser').style.display = 'none';
  const productBrowser = document.getElementById('productBrowser');
  productBrowser.style.display = 'block';
  document.getElementById('storeTitle').textContent = storeName;

  const grid = document.getElementById('productGrid');
  grid.innerHTML = '<div class="empty">Cargando productos…</div>';

  try {
    const products = await getStoreProducts(storeId);
    if (!products.length) {
      grid.innerHTML = '<div class="empty">Este comercio todavía no tiene productos.</div>';
      return;
    }
    grid.innerHTML = products.map((p) => `
      <article class="card">
        <div class="pic">
          ${p.photo ? `<img src="${p.photo}" alt="${esc(p.name)}">` : '🍽️'}
        </div>
        <h3>${esc(p.name)}</h3>
        <div class="muted">${esc(p.description || '')}</div>
        <div class="price">${money(p.price)}</div>
        <button type="button" class="add" data-add-product="${p.id}" data-name="${esc(p.name)}" data-price="${p.price}">Agregar</button>
      </article>
    `).join('');

    grid.querySelectorAll('[data-add-product]').forEach((btn) => {
      btn.addEventListener('click', () => addToCart(storeId, storeName, {
        productId: btn.dataset.addProduct,
        name: btn.dataset.name,
        price: Number(btn.dataset.price)
      }));
    });
  } catch (err) {
    console.error(err);
    grid.innerHTML = '<div class="empty">No se pudieron cargar los productos.</div>';
  }
}

function addToCart(storeId, storeName, product) {
  if (cartStore && cartStore.id !== storeId && cart.length) {
    const cambiar = confirm(`Tu carrito tiene productos de "${cartStore.name}". ¿Vaciarlo y pedir en "${storeName}" en su lugar?`);
    if (!cambiar) return;
    cart = [];
  }
  cartStore = { id: storeId, name: storeName };

  const existente = cart.find((it) => it.productId === product.productId);
  if (existente) existente.quantity += 1;
  else cart.push({ ...product, quantity: 1 });

  renderCart();
  showToast('clientToast', `${product.name} agregado al carrito.`);
}

function renderCart() {
  const empty = document.getElementById('cartEmpty');
  const itemsBox = document.getElementById('cartItems');
  if (!itemsBox) return;

  if (!cart.length) {
    empty.style.display = 'block';
    itemsBox.style.display = 'none';
    return;
  }
  empty.style.display = 'none';
  itemsBox.style.display = 'block';

  const subtotal = cart.reduce((sum, it) => sum + it.price * it.quantity, 0);
  const total = subtotal + DELIVERY_FEE;

  itemsBox.innerHTML = `
    <p class="muted">Pedido de <strong>${esc(cartStore?.name || '')}</strong></p>
    ${cart.map((it) => `
      <div class="user-row">
        <div class="user-main">
          <div>
            <strong>${esc(it.name)}</strong>
            <div class="muted">${money(it.price)} c/u</div>
          </div>
        </div>
        <div class="user-controls">
          <button type="button" class="btn" data-qty-down="${it.productId}">−</button>
          <span>${it.quantity}</span>
          <button type="button" class="btn" data-qty-up="${it.productId}">+</button>
          <button type="button" class="btn" data-remove="${it.productId}">Quitar</button>
        </div>
      </div>
    `).join('')}
    <div class="field">
      <label>Dirección de entrega</label>
      <input id="cartAddressInput" value="${esc(cartAddress)}" placeholder="Calle, sector, referencia">
    </div>
    <p class="muted">Subtotal: ${money(subtotal)} · Envío: ${money(DELIVERY_FEE)}</p>
    <h3>Total: ${money(total)}</h3>
    <button type="button" id="btnConfirmarPedido" class="btn primary" style="width:100%;padding:13px">Confirmar pedido</button>
  `;

  itemsBox.querySelectorAll('[data-qty-up]').forEach((b) => b.addEventListener('click', () => {
    const item = cart.find((it) => it.productId === b.dataset.qtyUp);
    if (item) item.quantity += 1;
    renderCart();
  }));
  itemsBox.querySelectorAll('[data-qty-down]').forEach((b) => b.addEventListener('click', () => {
    const item = cart.find((it) => it.productId === b.dataset.qtyDown);
    if (item) item.quantity -= 1;
    cart = cart.filter((it) => it.quantity > 0);
    renderCart();
  }));
  itemsBox.querySelectorAll('[data-remove]').forEach((b) => b.addEventListener('click', () => {
    cart = cart.filter((it) => it.productId !== b.dataset.remove);
    renderCart();
  }));

  document.getElementById('cartAddressInput')?.addEventListener('input', (e) => {
    cartAddress = e.target.value;
  });

  document.getElementById('btnConfirmarPedido')?.addEventListener('click', () => confirmOrder());
}

async function confirmOrder() {
  if (!cartAddress.trim()) {
    showToast('clientToast', 'Escribe una dirección de entrega.', true);
    return;
  }
  try {
    await createOrder({
      customerId: currentUid,
      storeId: cartStore.id,
      storeName: cartStore.name,
      items: cart.map(({ productId, name, price, quantity }) => ({ productId, name, price, quantity })),
      deliveryFee: DELIVERY_FEE,
      customerAddress: cartAddress
    });
    cart = [];
    cartStore = null;
    renderCart();
    showToast('clientToast', '¡Pedido enviado! Puedes seguirlo en "Mis pedidos".');
    document.querySelector('.side-link[data-section="pedidos"]')?.click();
  } catch (err) {
    console.error(err);
    showToast('clientToast', 'No se pudo enviar el pedido. Intenta de nuevo.', true);
  }
}

function renderOrders(orders) {
  const box = document.getElementById('ordersList');
  if (!box) return;
  if (!orders.length) {
    box.innerHTML = '<div class="empty">Todavía no has hecho ningún pedido.</div>';
    return;
  }
  box.innerHTML = orders.map((o) => {
    const puedeCancelar = o.status === 'created';
    const puedeCalificar = o.status === 'delivered' && !o.rating;
    return `
    <article class="user-row" style="flex-direction:column;align-items:stretch">
      <div style="display:flex;justify-content:space-between;gap:15px;align-items:center;flex-wrap:wrap">
        <div class="user-main">
          <div>
            <strong>${esc(o.storeName || 'Comercio')}</strong>
            <div class="muted">${(o.items || []).map((i) => `${esc(i.name)} ×${i.quantity}`).join(', ')}</div>
            <small class="muted">${formatDate(o.createdAt)}</small>
          </div>
        </div>
        <div class="user-controls">
          <span class="role">${esc(ESTADO_LABEL[o.status] || o.status)}</span>
          <strong>${money(o.total)}</strong>
          ${puedeCancelar ? `<button type="button" class="btn" data-cancel-order="${o.id}">Cancelar</button>` : ''}
        </div>
      </div>
      ${o.rating ? `<div class="muted" style="margin-top:8px">Tu calificación: ${'⭐'.repeat(o.rating.stars)} ${o.rating.comment ? `— "${esc(o.rating.comment)}"` : ''}</div>` : ''}
      ${puedeCalificar ? `
        <div class="rateBox" data-order-id="${o.id}" style="margin-top:10px;padding-top:10px;border-top:1px solid #eee">
          <p class="muted" style="margin:0 0 6px">¿Cómo estuvo tu pedido?</p>
          <div class="stars" data-stars="0" style="font-size:22px;cursor:pointer;letter-spacing:3px">🤍🤍🤍🤍🤍</div>
          <input type="text" class="rateComment" placeholder="Comentario opcional…" style="margin-top:8px;width:100%;padding:8px;border:1px solid #ddd;border-radius:9px">
          <button type="button" class="btn primary rateSubmit" style="margin-top:8px" disabled>Enviar calificación</button>
        </div>
      ` : ''}
    </article>
  `;
  }).join('');

  box.querySelectorAll('[data-cancel-order]').forEach((btn) => {
    btn.addEventListener('click', async () => {
      if (!confirm('¿Cancelar este pedido? El comercio aún no lo ha confirmado.')) return;
      btn.disabled = true;
      try {
        await cancelOrderByCustomer(btn.dataset.cancelOrder);
        showToast('clientToast', 'Pedido cancelado.');
      } catch (err) {
        console.error(err);
        showToast('clientToast', 'No se pudo cancelar el pedido.', true);
        btn.disabled = false;
      }
    });
  });

  box.querySelectorAll('.rateBox').forEach((rateBox) => {
    const starsEl = rateBox.querySelector('.stars');
    const submitBtn = rateBox.querySelector('.rateSubmit');
    const commentInput = rateBox.querySelector('.rateComment');

    starsEl.addEventListener('click', (e) => {
      const boundingBox = starsEl.getBoundingClientRect();
      const relativeX = e.clientX - boundingBox.left;
      const picked = Math.min(5, Math.max(1, Math.ceil((relativeX / boundingBox.width) * 5)));
      starsEl.dataset.stars = String(picked);
      starsEl.textContent = '⭐'.repeat(picked) + '🤍'.repeat(5 - picked);
      submitBtn.disabled = false;
    });

    submitBtn.addEventListener('click', async () => {
      const stars = Number(starsEl.dataset.stars || 0);
      if (!stars) return;
      submitBtn.disabled = true;
      try {
        await rateOrder(rateBox.dataset.orderId, stars, commentInput.value.trim());
        showToast('clientToast', '¡Gracias por tu calificación!');
      } catch (err) {
        console.error(err);
        showToast('clientToast', 'No se pudo enviar tu calificación.', true);
        submitBtn.disabled = false;
      }
    });
  });
}

export function initClientDashboard(session) {
  currentUid = session.user.uid;
  const profile = session.profile;

  // --- Volver a la lista de comercios desde la vista de productos ---
  document.getElementById('btnVolverTiendas')?.addEventListener('click', () => {
    document.getElementById('productBrowser').style.display = 'none';
    document.getElementById('storeBrowser').style.display = 'block';
  });

  renderCart();

  // --- Perfil: precargar datos y guardar cambios ---
  const nameInput = document.getElementById('profileNameInput');
  const phoneInput = document.getElementById('profilePhoneInput');
  const emailInput = document.getElementById('profileEmailInput');
  const addressInput = document.getElementById('profileAddressInput');
  const photoPreview = document.getElementById('profilePhotoPreview');
  const btnQuitarFotoPerfil = document.getElementById('btnQuitarFotoPerfil');
  let pendingProfilePhotoDataUrl = profile.photoURL || null;

  if (nameInput) nameInput.value = profile.name || '';
  if (emailInput) emailInput.value = profile.email || session.user.email || '';
  if (profile.photoURL && photoPreview && btnQuitarFotoPerfil) {
    photoPreview.src = profile.photoURL;
    photoPreview.style.display = 'block';
    btnQuitarFotoPerfil.style.display = 'inline-block';
  }

  document.getElementById('profilePhotoInput')?.addEventListener('change', async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      photoPreview.style.display = 'none';
      pendingProfilePhotoDataUrl = await compressImageToDataUrl(file);
      photoPreview.src = pendingProfilePhotoDataUrl;
      photoPreview.style.display = 'block';
      btnQuitarFotoPerfil.style.display = 'inline-block';
    } catch (err) {
      console.error(err);
      showToast('clientToast', err.message || 'No se pudo procesar la foto.', true);
      e.target.value = '';
    }
  });

  btnQuitarFotoPerfil?.addEventListener('click', () => {
    pendingProfilePhotoDataUrl = null;
    const input = document.getElementById('profilePhotoInput');
    if (input) input.value = '';
    photoPreview.style.display = 'none';
    btnQuitarFotoPerfil.style.display = 'none';
  });

  getDoc(doc(db, 'customers', currentUid)).then((snap) => {
    const data = snap.exists() ? snap.data() : {};
    if (phoneInput) phoneInput.value = data.phone || profile.phone || '';
    if (addressInput) addressInput.value = data.address || '';
    if (!cartAddress && data.address) {
      cartAddress = data.address;
      renderCart();
    }
    favoriteIds = Array.isArray(data.favorites) ? data.favorites : [];
    renderStores(latestOpenStores);
    renderFavorites();
  }).catch(() => {});

  document.getElementById('storeSearchInput')?.addEventListener('input', () => renderStores(latestOpenStores));

  document.getElementById('profileForm')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    try {
      await updateDoc(doc(db, 'users', currentUid), {
        name: nameInput.value.trim(),
        photoURL: pendingProfilePhotoDataUrl || null,
        updatedAt: serverTimestamp()
      });
      await setDoc(doc(db, 'customers', currentUid), {
        userId: currentUid,
        phone: phoneInput.value.trim(),
        address: addressInput.value.trim(),
        updatedAt: serverTimestamp()
      }, { merge: true });
      showToast('clientToast', 'Perfil actualizado.');
    } catch (err) {
      console.error(err);
      showToast('clientToast', 'No se pudo guardar el perfil.', true);
    }
  });

  // --- Suscripciones en vivo ---
  const unsubStores = watchOpenStores(renderStores);
  const unsubOrders = watchCustomerOrders(currentUid, renderOrders);

  return () => {
    unsubStores();
    unsubOrders();
  };
}
