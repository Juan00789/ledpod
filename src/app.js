import { CATEGORIES, WHATSAPP, SLIDES, categoryIdFromValue } from "./data.js";
import { watchCatalogProducts, watchCatalogState } from "./catalog/public-catalog.js";
import { getStoreProducts, watchOpenStores } from "./catalog/stores-service.js";
import { getProductPhotos } from "./shared/product-photos.js";
const $ = (s) => document.querySelector(s);
const money = (n) => "RD$ " + n.toLocaleString("es-DO");
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const store = {
  get() { try { return JSON.parse(localStorage.getItem("ledpop-cart")) || {}; } catch { return {}; } },
  set(v) { try { localStorage.setItem("ledpop-cart", JSON.stringify(v)); } catch {} }
};
let products = [];
let publishedProducts = [];
let sucursalProducts = [];
let managedCatalog = false;
let cart = store.get(), cat = "todos", query = "";
let activeProduct = null;
let activeProductPhoto = 0;
const PRIMARY_STORE_NAME = "sucursal puerto plata";

function normalizeText(value) {
  return String(value || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim().toLowerCase();
}

function renderCats() {
  $("#categorias").innerHTML = CATEGORIES.map((c) =>
    `<button class="cat ${cat === c.id ? "on" : ""}" data-cat="${c.id}"><span>${c.icon}</span><b>${esc(c.name)}</b><small>${esc(c.sub)}</small></button>`).join("");
}
function renderGrid() {
  const q = query.trim().toLowerCase();
  const list = products.filter((p) => (cat === "todos" || p.cat === cat) &&
    (!q || `${p.name} ${p.sub} ${p.cat}`.toLowerCase().includes(q)));
  $("#grid").innerHTML = list.length ? list.map((p) => `
    <article class="card product-card">
      <button class="product-card-preview" type="button" data-product-detail="${esc(p.id)}" aria-label="Ver detalles de ${esc(p.name)}">
        <span class="ph">${p.img ? `<img src="${esc(p.img)}" alt="" loading="lazy">` : p.icon}${p.photoCount > 1 ? `<span class="product-photo-count">${p.photoCount} fotos</span>` : ''}</span>
        <span class="product-card-open">Ver producto <span aria-hidden="true">↗</span></span>
      </button>
      <div class="b"><h4>${esc(p.name)}</h4><small>${esc(CATEGORIES.find((category) => category.id === p.cat)?.name || '')}</small><small>${esc(p.sub || '')}</small></div>
      <div class="row"><b>${money(p.price)}</b><button class="add" data-add="${esc(p.id)}" aria-label="Agregar ${esc(p.name)} al carrito">🛒</button></div>
    </article>`).join("")
    : `<p class="empty">No encontramos productos. Escríbenos por WhatsApp y te ayudamos.</p>`;
}

function renderProductDetailPhoto() {
  if (!activeProduct) return;
  const photos = activeProduct.photos?.length ? activeProduct.photos : activeProduct.img ? [activeProduct.img] : [];
  const image = $("#productDetailImage");
  const noPhoto = $("#productDetailNoPhoto");
  const hasPhotos = photos.length > 0;
  image.hidden = !hasPhotos;
  noPhoto.hidden = hasPhotos;
  image.src = hasPhotos ? photos[activeProductPhoto] : "";
  image.alt = hasPhotos ? `${activeProduct.name}, foto ${activeProductPhoto + 1}` : "";
  $("#productDetailPhotoCount").textContent = photos.length > 1 ? `${activeProductPhoto + 1} / ${photos.length}` : "";
  document.querySelectorAll("[data-photo-step]").forEach(button => {
    button.hidden = photos.length < 2;
  });
  $("#productDetailThumbnails").innerHTML = photos.length > 1 ? photos.map((photo, index) => `
    <button class="product-detail-thumb${index === activeProductPhoto ? " is-active" : ""}" type="button"
      data-product-photo="${index}" aria-label="Ver foto ${index + 1}">
      <img src="${esc(photo)}" alt="">
    </button>`).join("") : "";
}

function openProductDetail(productId) {
  activeProduct = products.find(product => product.id === productId);
  if (!activeProduct) return;
  activeProductPhoto = 0;
  $("#productDetailCategory").textContent =
    CATEGORIES.find(category => category.id === activeProduct.cat)?.name || "Producto LEDPOD";
  $("#productDialogName").textContent = activeProduct.name;
  $("#productDetailDescription").textContent = activeProduct.sub || "Consulta con nosotros para más información sobre este producto.";
  $("#productDetailPrice").textContent = money(activeProduct.price);
  $("#productDetailAdd").dataset.add = activeProduct.id;
  renderProductDetailPhoto();
  $("#productDialog").showModal();
}
function renderCart() {
  const rows = Object.entries(cart).map(([id, n]) => [products.find((p) => p.id === id), n]).filter(([p]) => p);
  const count = rows.reduce((a, [, n]) => a + n, 0), total = rows.reduce((a, [p, n]) => a + p.price * n, 0);
  $("#cartCount").textContent = count; $("#total").textContent = money(total);
  $("#order").disabled = !count; $("#order").style.opacity = count ? 1 : .5;
  $("#downloadOrder").disabled = !count;
  $("#items").innerHTML = rows.length ? rows.map(([p, n]) => `
    <div class="line"><span>${esc(p.name)}</span><b>${money(p.price * n)}</b>
    <div class="qty"><button data-dec="${p.id}">−</button>${n}<button data-add="${p.id}">+</button></div></div>`).join("")
    : `<p class="empty">Tu carrito está vacío.</p>`;
  store.set(cart);
}
function change(id, d) { cart[id] = (cart[id] || 0) + d; if (cart[id] <= 0) delete cart[id]; renderCart(); }

function getCartRows() {
  return Object.entries(cart)
    .map(([id, quantity]) => [products.find((product) => product.id === id), quantity])
    .filter(([product]) => product);
}

function getOrderDetails() {
  const rows = getCartRows();
  return {
    rows,
    total: rows.reduce((sum, [product, quantity]) => sum + product.price * quantity, 0),
    createdAt: new Date()
  };
}

function downloadOrderSheet() {
  const { rows, total, createdAt } = getOrderDetails();
  if (!rows.length) return;
  const orderNumber = `LP-${createdAt.getFullYear()}${String(createdAt.getMonth() + 1).padStart(2, "0")}${String(createdAt.getDate()).padStart(2, "0")}-${String(createdAt.getHours()).padStart(2, "0")}${String(createdAt.getMinutes()).padStart(2, "0")}`;
  const tableRows = rows.map(([product, quantity]) => {
    const category = CATEGORIES.find((item) => item.id === categoryIdFromValue(product.cat))?.name || "Sin categoría";
    return `<tr><td>${esc(product.name)}</td><td>${esc(category)}</td><td>${quantity}</td><td>${money(product.price)}</td><td>${money(product.price * quantity)}</td></tr>`;
  }).join("");
  const sheet = `<!doctype html>
<html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Pedido ${orderNumber} | LEDPOD</title>
<style>
*{box-sizing:border-box}body{margin:0;padding:32px;color:#17202a;font:14px/1.5 Arial,sans-serif}.sheet{max-width:850px;margin:auto}
header{display:flex;justify-content:space-between;gap:20px;align-items:flex-start;border-bottom:3px solid #f6bd16;padding-bottom:16px}
h1{margin:0;font-size:28px}h2{margin:26px 0 10px;font-size:17px}.muted{color:#65717e}.meta{text-align:right}
.fields{display:grid;grid-template-columns:1fr 1fr;gap:18px 26px;margin:22px 0}.field{border-bottom:1px solid #9aa3ad;min-height:35px}
table{width:100%;border-collapse:collapse;margin-top:14px}th,td{padding:10px 8px;border:1px solid #ccd2d8;text-align:left}th{background:#f3f5f7}
.total{margin:18px 0 0 auto;width:max-content;font-size:20px;font-weight:bold}.notes{margin-top:26px}.notes .field{min-height:50px}
.print{margin:24px 0;padding:10px 18px;border:0;border-radius:8px;background:#f6bd16;font-weight:bold;cursor:pointer}
@media print{body{padding:0}.sheet{max-width:none}.print{display:none}header,table,.fields,.notes{break-inside:avoid}}
@media(max-width:600px){body{padding:16px}.fields{grid-template-columns:1fr}header{flex-direction:column}.meta{text-align:left}table{font-size:12px}th,td{padding:6px 4px}}
</style></head><body><main class="sheet">
<header><div><h1>LEDPOD</h1><div class="muted">Hoja de pedido · Puerto Plata, R.D.</div><div>+1 849 886 5556</div></div>
<div class="meta"><strong>${orderNumber}</strong><div>${createdAt.toLocaleString("es-DO")}</div></div></header>
<h2>Datos de entrega</h2><div class="fields">
<div class="field">Cliente:</div><div class="field">Teléfono:</div>
<div class="field">Dirección de entrega:</div><div class="field">Repartidor:</div>
</div>
<h2>Productos solicitados</h2><table><thead><tr><th>Producto</th><th>Categoría</th><th>Cant.</th><th>Precio unitario</th><th>Subtotal</th></tr></thead><tbody>${tableRows}</tbody></table>
<div class="total">Total: ${money(total)}</div><div class="notes"><h2>Notas / instrucciones</h2><div class="field"></div><div class="field"></div></div>
<button class="print" onclick="window.print()">Imprimir / Guardar como PDF</button>
</main></body></html>`;
  const blob = new Blob([sheet], { type: "text/html;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `pedido-ledpod-${createdAt.getFullYear()}-${String(createdAt.getMonth() + 1).padStart(2, "0")}-${String(createdAt.getDate()).padStart(2, "0")}.html`;
  document.body.append(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

document.addEventListener("click", (e) => {
  const t = e.target.closest("[data-add],[data-dec],[data-cat],[data-product-detail],[data-product-photo],[data-photo-step],[data-product-close]");
  if (!t) return;
  if (t.hasAttribute("data-product-close")) {
    $("#productDialog").close();
  } else if (t.dataset.productDetail) {
    openProductDetail(t.dataset.productDetail);
  } else if (t.dataset.productPhoto !== undefined) {
    activeProductPhoto = Number(t.dataset.productPhoto);
    renderProductDetailPhoto();
  } else if (t.dataset.photoStep) {
    const photoCount = activeProduct?.photos?.length || (activeProduct?.img ? 1 : 0);
    if (photoCount > 1) {
      activeProductPhoto = (activeProductPhoto + Number(t.dataset.photoStep) + photoCount) % photoCount;
      renderProductDetailPhoto();
    }
  } else if (t.dataset.add) {
    change(t.dataset.add, 1);
    if (t.classList.contains("add")) {
      if ($("#productDialog").open) $("#productDialog").close();
      $("#drawer").classList.add("open");
    }
  }
  else if (t.dataset.dec) change(t.dataset.dec, -1);
  else { cat = cat === t.dataset.cat ? "todos" : t.dataset.cat; renderCats(); renderGrid(); $("#productos").scrollIntoView(); }
});
$("#productDialog").addEventListener("click", (event) => {
  if (event.target === $("#productDialog")) $("#productDialog").close();
});
$("#allBtn").onclick = () => { cat = "todos"; query = ""; $("#search").value = ""; renderCats(); renderGrid(); };
$("#search").oninput = (e) => { query = e.target.value; renderGrid(); if (query) $("#productos").scrollIntoView(); };
$("#cartBtn").onclick = () => $("#drawer").classList.add("open");
$("#closeCart").onclick = () => $("#drawer").classList.remove("open");
$("#menuBtn").onclick = () => $("#side").classList.toggle("open");
$("#side").onclick = (e) => { if (e.target.closest("a")) $("#side").classList.remove("open"); };
const sideLinks = [...document.querySelectorAll("#side a[href^='#']")];
const sideSections = sideLinks.map((link) => document.querySelector(link.getAttribute("href"))).filter(Boolean);
function updateSideLink() {
  let current = sideSections[0];
  const threshold = window.innerHeight * 0.4;
  const sectionsByPosition = [...sideSections].sort((a, b) =>
    a.getBoundingClientRect().top - b.getBoundingClientRect().top);
  for (const section of sectionsByPosition) {
    if (section.getBoundingClientRect().top <= threshold) current = section;
  }
  sideLinks.forEach((link) => link.classList.toggle("on", link.hash === `#${current.id}`));
}
window.addEventListener("scroll", updateSideLink, { passive: true });
window.addEventListener("hashchange", updateSideLink);
$("#order").onclick = () => {
  const { rows, total } = getOrderDetails();
  if (!rows.length) return;
  const msg = ["Hola LEDPOD, quiero hacer este pedido:", ...rows.map(([p, n]) => `• ${n} x ${p.name} — ${money(p.price * n)}`), `Total: ${money(total)}`, "Por favor, confirmen los datos de entrega."].join("\n");
  window.open(`https://wa.me/${WHATSAPP}?text=${encodeURIComponent(msg)}`, "_blank", "noopener");
};
$("#downloadOrder").onclick = downloadOrderSheet;

let slide = 0;
function showSlide(i) {
  slide = i; $("#heroTitle").textContent = SLIDES[i][0]; $("#heroCopy").textContent = SLIDES[i][1];
  $("#dots").innerHTML = SLIDES.map((_, k) => `<i class="${k === i ? "on" : ""}" data-s="${k}"></i>`).join("");
}
$("#dots").onclick = (e) => { if (e.target.dataset.s) showSlide(+e.target.dataset.s); };
setInterval(() => showSlide((slide + 1) % SLIDES.length), 6000);

function usePublishedCatalog() {
  const adminProducts = publishedProducts.map((p) => ({
    id: p.id, img: getProductPhotos(p)[0] || null, photos: getProductPhotos(p), photoCount: getProductPhotos(p).length, cat: p.category, name: p.name,
    sub: p.description, price: p.price, icon: "🛍️"
  }));
  products = [...adminProducts, ...sucursalProducts];
  renderGrid();
  renderCart();
  if (!products.length) {
    $("#catalogStatus").textContent = "Todavía no hay productos públicos. En el panel Admin, cambia la visibilidad del producto a Público para mostrarlo aquí.";
    $("#catalogStatus").hidden = false;
  } else {
    $("#catalogStatus").hidden = true;
  }
}

function useDefaultCatalog() {
  usePublishedCatalog();
}

watchCatalogProducts((items) => {
  publishedProducts = items;
  if (managedCatalog || publishedProducts.length) {
    usePublishedCatalog();
  } else {
    useDefaultCatalog();
  }
}, (error) => {
  console.error("No se pudo cargar el catálogo LEDPOD:", error);
  products = [];
  renderGrid();
  renderCart();
  const status = $("#catalogStatus");
  status.textContent = "No se pudo conectar con el catálogo de Firebase. Intenta de nuevo más tarde.";
  status.hidden = false;
});
watchCatalogState((initialized) => {
  managedCatalog = initialized;
  if (managedCatalog || publishedProducts.length) {
    usePublishedCatalog();
  } else {
    useDefaultCatalog();
  }
}, (error) => {
  console.error("No se pudo comprobar el estado del catálogo LEDPOD:", error);
  const status = $("#catalogStatus");
  status.textContent = "No se pudo comprobar el estado del catálogo en Firebase.";
  status.hidden = false;
});

watchOpenStores(async (stores) => {
  const primaryStore = stores.find(store => normalizeText(store.name) === PRIMARY_STORE_NAME);
  if (!primaryStore) {
    sucursalProducts = [];
    usePublishedCatalog();
    return;
  }
  try {
    const storeProducts = await getStoreProducts(primaryStore.id);
    sucursalProducts = storeProducts.map(product => ({
      id: `sucursal-${primaryStore.id}-${product.id}`,
      img: getProductPhotos(product)[0] || null,
      photos: getProductPhotos(product),
      photoCount: getProductPhotos(product).length,
      cat: categoryIdFromValue(product.category),
      name: product.name,
      sub: product.description,
      price: Number(product.price) || 0,
      icon: "🛍️"
    }));
    usePublishedCatalog();
  } catch (error) {
    console.error("No se pudieron cargar los productos de Sucursal Puerto Plata:", error);
    const status = $("#catalogStatus");
    status.textContent = "No se pudieron cargar los productos de Sucursal Puerto Plata.";
    status.hidden = false;
  }
}, (error) => {
  console.error("No se pudo consultar Sucursal Puerto Plata:", error);
  const status = $("#catalogStatus");
  status.textContent = "No se pudo comprobar la disponibilidad de Sucursal Puerto Plata.";
  status.hidden = false;
});

renderCats(); renderGrid(); renderCart(); showSlide(0); updateSideLink();
