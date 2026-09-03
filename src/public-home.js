import { watchOpenStores, getStoreProducts } from './catalog/stores-service.js';
import { esc } from './shared/utils.js';

const box = document.getElementById('products');
const search = document.getElementById('search');
const chipsBox = document.getElementById('categoryChips');
const clock = document.getElementById('rdClock');
let publicItems = [];
let activeCategory = '';

function updateClock() {
  clock.textContent = new Intl.DateTimeFormat('es-DO', {
    timeZone: 'America/Santo_Domingo', hour: 'numeric', minute: '2-digit', hour12: true
  }).format(new Date());
}

updateClock();
setInterval(updateClock, 1000);

function renderChips(items) {
  if (!chipsBox) return;
  const categories = [...new Set(items.map((item) => item.category).filter(Boolean))].sort();
  if (!categories.length) {
    chipsBox.innerHTML = '';
    return;
  }
  chipsBox.innerHTML = [`<button type="button" class="chip ${activeCategory ? '' : 'active'}" data-category="">Todo</button>`]
    .concat(categories.map((cat) => `<button type="button" class="chip ${activeCategory === cat ? 'active' : ''}" data-category="${esc(cat)}">${esc(cat)}</button>`))
    .join('');
  chipsBox.querySelectorAll('.chip').forEach((btn) => {
    btn.addEventListener('click', () => {
      activeCategory = btn.dataset.category;
      render(publicItems);
    });
  });
}

function render(items) {
  const query = search.value.trim().toLowerCase();
  let filtered = query
    ? items.filter((item) => `${item.name} ${item.store} ${item.category} ${item.subcategory || ''}`.toLowerCase().includes(query))
    : items;
  if (activeCategory) filtered = filtered.filter((item) => item.category === activeCategory);

  renderChips(items);

  if (!items.length) {
    box.innerHTML = '<div class="empty">Todavía no hay comercios abiertos. Vuelve a intentarlo en un rato.</div>';
    return;
  }
  if (!filtered.length) {
    box.innerHTML = '<div class="empty">Ningún producto o comercio coincide con tu búsqueda.</div>';
    return;
  }

  box.innerHTML = filtered.map((item) => `
    <article class="card">
      <div class="pic" style="${item.photo ? 'padding:0;overflow:hidden' : ''}">
        ${item.photo ? `<img src="${item.photo}" alt="${esc(item.name)}" style="width:100%;height:100%;object-fit:cover;border-radius:13px">` : '<span class="no-photo">Sin foto</span>'}
      </div>
      <h3>${esc(item.name)}</h3>
      <div class="muted">${esc(item.store)}${item.category ? ` · ${esc(item.category)}` : ''}${item.subcategory ? ` · ${esc(item.subcategory)}` : ''}</div>
      ${item.description ? `<div class="muted">${esc(item.description)}</div>` : ''}
      ${item.price != null ? `<div class="price">RD$${esc(item.price)}</div>` : ''}
      <a class="add" style="display:block;text-align:center;text-decoration:none" href="./login.html">Ver comercio</a>
    </article>
  `).join('');
}

async function loadStores(stores) {
  const items = [];
  for (const store of stores) {
    const products = await getStoreProducts(store.id);
    if (products.length) {
      items.push(...products.map((product) => ({
        ...product,
        store: store.name,
        storePhoto: store.photo || null,
        category: product.category || store.category || '',
        subcategory: product.subcategory || store.subcategory || ''
      })));
    } else {
      items.push({
        name: store.name,
        store: store.name,
        category: store.category || 'Comercio',
        description: store.description || '',
        photo: store.photo || null
      });
    }
  }
  publicItems = items;
  render(publicItems);
}

search.addEventListener('input', () => render(publicItems));
watchOpenStores(loadStores, (error) => console.error('No se pudieron cargar los comercios públicos:', error));
