import { watchSession, logout } from './auth/auth-service.js';
import { initAdminDashboard } from './admin/dashboard.js';
import { initClientDashboard } from './client/dashboard.js';
import { initMerchantDashboard } from './merchant/dashboard.js';
import { initDriverDashboard } from './driver/dashboard.js';

const panelByRole = {
  cliente: './panels/client.html',
  comercio: './panels/merchant.html',
  repartidor: './panels/driver.html',
  admin: './panels/admin.html'
};

const panelInitByRole = {
  cliente: initClientDashboard,
  comercio: initMerchantDashboard,
  repartidor: initDriverDashboard,
  admin: session => initAdminDashboard(session)
};

const navByRole = {
  cliente: [
    ['inicio', '🏠', 'Inicio'],
    ['favoritos', '❤️', 'Favoritos'],
    ['pedidos', '📦', 'Mis pedidos'],
    ['carrito', '🛒', 'Carrito'],
    ['perfil', '👤', 'Perfil']
  ],
  comercio: [
    ['inicio', '🏪', 'Inicio'],
    ['productos', '🍔', 'Productos'],
    ['pedidos', '📦', 'Pedidos'],
    ['perfil', '👤', 'Perfil']
  ],
  repartidor: [
    ['perfil', '🛵', 'Perfil'],
    ['disponibles', '📍', 'Disponibles'],
    ['activa', '📦', 'Entrega activa'],
    ['historial', '🕘', 'Historial']
  ],
  admin: [
    ['resumen', '📊', 'Resumen'],
    ['catalogo', '🛍️', 'Inventario LEDPOD'],
    ['usuarios', '👥', 'Usuarios'],
    ['comercios', '🏪', 'Comercios'],
    ['repartidores', '🛵', 'Repartidores'],
    ['pedidos', '📦', 'Pedidos'],
    ['incidencias', '🚨', 'Incidencias'],
    ['configuracion', '⚙️', 'Configuración']
  ]
};

const panelMount = document.getElementById('panelMount');
const nav = document.getElementById('sideNav');
const loading = document.getElementById('loading');
const dashboard = document.getElementById('dashboard');
const profileName = document.getElementById('profileName');
const profileRole = document.getElementById('profileRole');
const profileAvatar = document.getElementById('profileAvatar');
let stopPanel = null;

function titleCase(value) {
  return String(value || 'cliente').replace(/^./, c => c.toUpperCase());
}

function renderNav(role) {
  nav.innerHTML = (navByRole[role] || navByRole.cliente).map(([id, icon, label], index) =>
    `<button class="side-link ${index === 0 ? 'active' : ''}" data-section="${id}">
      <span>${icon}</span><span>${label}</span>
    </button>`
  ).join('');
}

function activateSection(section) {
  nav.querySelectorAll('.side-link').forEach(button => {
    button.classList.toggle('active', button.dataset.section === section);
  });
  panelMount.querySelectorAll('[data-section]').forEach(element => {
    element.style.display = element.dataset.section === section ? '' : 'none';
  });
}

async function loadPanel(role) {
  const url = new URL(panelByRole[role] || panelByRole.cliente, import.meta.url);
  const response = await fetch(url, { cache: 'no-store' });
  if (!response.ok) throw new Error(`Panel ${role} no disponible (HTTP ${response.status})`);
  panelMount.innerHTML = await response.text();
  stopPanel?.();
  stopPanel = null;
}

nav.addEventListener('click', event => {
  const button = event.target.closest('.side-link');
  if (button) activateSection(button.dataset.section);
});

watchSession(async session => {
  if (!session) {
    location.href = './login.html';
    return;
  }

  const role = session.profile.role || 'cliente';
  profileName.textContent = session.profile.name || session.user.email || 'Usuario';
  profileRole.textContent = titleCase(role);
  if (profileAvatar) {
    if (session.profile.photoURL) {
      profileAvatar.innerHTML = `<img src="${session.profile.photoURL}" alt="">`;
    } else {
      profileAvatar.textContent = (session.profile.name || session.user.email || 'L').trim().charAt(0).toUpperCase();
    }
  }
  renderNav(role);

  try {
    await loadPanel(role);
    const firstSection = (navByRole[role] || navByRole.cliente)[0][0];
    activateSection(firstSection);
    stopPanel = (panelInitByRole[role] || panelInitByRole.cliente)(session) || null;
    loading.style.display = 'none';
    dashboard.style.display = 'grid';
  } catch (error) {
    console.error(error);
    loading.textContent = `No se pudo cargar tu panel: ${error.message || error}`;
  }
}, () => {
  sessionStorage.setItem('ledpodBlocked', '1');
  location.href = './login.html';
});

document.getElementById('logout').addEventListener('click', async () => {
  await logout();
  location.href = './login.html';
});
