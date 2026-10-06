import { CATEGORIES, PRODUCTS as DEFAULT_PRODUCTS, WHATSAPP, SLIDES } from "./data.js";
import { watchCatalogProducts, watchCatalogState } from "./catalog/public-catalog.js";
const $ = (s) => document.querySelector(s);
const money = (n) => "RD$ " + n.toLocaleString("es-DO");
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const store = {
  get() { try { return JSON.parse(localStorage.getItem("ledpop-cart")) || {}; } catch { return {}; } },
  set(v) { try { localStorage.setItem("ledpop-cart", JSON.stringify(v)); } catch {} }
};
let products = DEFAULT_PRODUCTS;
let publishedProducts = [];
let managedCatalog = false;
let cart = store.get(), cat = "todos", query = "";

function renderCats() {
  $("#categorias").innerHTML = CATEGORIES.map((c) =>
    `<button class="cat ${cat === c.id ? "on" : ""}" data-cat="${c.id}"><span>${c.icon}</span><b>${esc(c.name)}</b><small>${esc(c.sub)}</small></button>`).join("") +
    `<a class="cat service-cat" href="#servicios"><span>🛠️</span><b>Servicios Técnicos</b><small>Instalación y asesoría</small></a>`;
}
function renderGrid() {
  const q = query.trim().toLowerCase();
  const list = products.filter((p) => (cat === "todos" || p.cat === cat) &&
    (!q || `${p.name} ${p.sub} ${p.cat}`.toLowerCase().includes(q)));
  $("#grid").innerHTML = list.length ? list.map((p) => `
    <article class="card"><div class="ph">${p.img ? `<img src="${esc(p.img)}" alt="${esc(p.name)}" loading="lazy">` : p.icon}</div>
    <div class="b"><h4>${esc(p.name)}</h4><small>${esc(CATEGORIES.find((category) => category.id === p.cat)?.name || '')}</small><small>${esc(p.sub || '')}</small></div>
    <div class="row"><b>${money(p.price)}</b><button class="add" data-add="${p.id}" aria-label="Agregar ${esc(p.name)}">🛒</button></div></article>`).join("")
    : `<p class="empty">No encontramos productos. Escríbenos por WhatsApp y te ayudamos.</p>`;
}
function renderCart() {
  const rows = Object.entries(cart).map(([id, n]) => [products.find((p) => p.id === id), n]).filter(([p]) => p);
  const count = rows.reduce((a, [, n]) => a + n, 0), total = rows.reduce((a, [p, n]) => a + p.price * n, 0);
  $("#cartCount").textContent = count; $("#total").textContent = money(total);
  $("#order").disabled = !count; $("#order").style.opacity = count ? 1 : .5;
  $("#items").innerHTML = rows.length ? rows.map(([p, n]) => `
    <div class="line"><span>${esc(p.name)}</span><b>${money(p.price * n)}</b>
    <div class="qty"><button data-dec="${p.id}">−</button>${n}<button data-add="${p.id}">+</button></div></div>`).join("")
    : `<p class="empty">Tu carrito está vacío.</p>`;
  store.set(cart);
}
function change(id, d) { cart[id] = (cart[id] || 0) + d; if (cart[id] <= 0) delete cart[id]; renderCart(); }

document.addEventListener("click", (e) => {
  const t = e.target.closest("[data-add],[data-dec],[data-cat]"); if (!t) return;
  if (t.dataset.add) { change(t.dataset.add, 1); if (t.classList.contains("add")) $("#drawer").classList.add("open"); }
  else if (t.dataset.dec) change(t.dataset.dec, -1);
  else { cat = cat === t.dataset.cat ? "todos" : t.dataset.cat; renderCats(); renderGrid(); $("#productos").scrollIntoView(); }
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
  const rows = Object.entries(cart).map(([id, n]) => [products.find((p) => p.id === id), n]).filter(([p]) => p);
  if (!rows.length) return;
  const total = rows.reduce((a, [p, n]) => a + p.price * n, 0);
  const msg = ["Hola LEDPOD, quiero hacer este pedido:", ...rows.map(([p, n]) => `• ${n} x ${p.name} — ${money(p.price * n)}`), `Total: ${money(total)}`].join("\n");
  window.open(`https://wa.me/${WHATSAPP}?text=${encodeURIComponent(msg)}`, "_blank", "noopener");
};

let slide = 0;
function showSlide(i) {
  slide = i; $("#heroTitle").textContent = SLIDES[i][0]; $("#heroCopy").textContent = SLIDES[i][1];
  $("#dots").innerHTML = SLIDES.map((_, k) => `<i class="${k === i ? "on" : ""}" data-s="${k}"></i>`).join("");
}
$("#dots").onclick = (e) => { if (e.target.dataset.s) showSlide(+e.target.dataset.s); };
setInterval(() => showSlide((slide + 1) % SLIDES.length), 6000);

function usePublishedCatalog() {
  products = publishedProducts.map((p) => ({
    id: p.id, img: p.photo, cat: p.category, name: p.name,
    sub: p.description, price: p.price, icon: "🛍️"
  }));
  renderGrid();
  renderCart();
  if (!publishedProducts.length) {
    $("#catalogStatus").textContent = "Todavía no hay productos públicos. En el panel Admin, cambia la visibilidad del producto a Público para mostrarlo aquí.";
    $("#catalogStatus").hidden = false;
  } else {
    $("#catalogStatus").hidden = true;
  }
}

function useDefaultCatalog() {
  products = DEFAULT_PRODUCTS;
  renderGrid();
  renderCart();
  $("#catalogStatus").hidden = true;
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
  const status = $("#catalogStatus");
  status.textContent = "No se pudo actualizar el catálogo. Se muestran los productos guardados en este sitio.";
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
  status.textContent = "No se pudo comprobar si el catálogo está actualizado. Se muestran los productos guardados en este sitio.";
  status.hidden = false;
});

renderCats(); renderGrid(); renderCart(); showSlide(0); updateSideLink();
