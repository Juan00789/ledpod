// src/shared/utils.js
// Utilidades compartidas entre los paneles de cliente, comercio,
// repartidor y admin.

export function esc(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

export function money(value) {
  return `RD$${(Number(value) || 0).toLocaleString('es-DO', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export function formatDate(value) {
  if (!value) return '—';
  const date = value.toDate ? value.toDate() : new Date(value);
  if (Number.isNaN(date.getTime())) return '—';
  return date.toLocaleString('es-DO', { dateStyle: 'short', timeStyle: 'short' });
}

// Mismo patrón de "toast" que ya usa el panel admin (#adminToast) —
// cualquier panel que tenga un elemento con este id puede reusarlo.
export function showToast(toastId, message, isError = false) {
  const toast = document.getElementById(toastId);
  if (!toast) return;
  toast.textContent = message;
  toast.className = `toast ${isError ? 'toast-error' : ''} show`;
  setTimeout(() => toast.classList.remove('show'), 2600);
}

// Traduce los códigos de error de Firebase Auth a mensajes en
// español. Antes, login.html/register.html mostraban el mismo mensaje genérico sin
// importar la causa real (contraseña incorrecta, correo ya
// registrado, contraseña débil, sin conexión...); ahora cada caso
// dice algo útil.
export function mensajeErrorAuth(codigo) {
  const mapa = {
    'auth/invalid-email': 'El correo no es válido.',
    'auth/user-not-found': 'Correo o contraseña incorrectos.',
    'auth/wrong-password': 'Correo o contraseña incorrectos.',
    'auth/invalid-credential': 'Correo o contraseña incorrectos.',
    'auth/too-many-requests': 'Demasiados intentos. Espera un momento e inténtalo de nuevo.',
    'auth/email-already-in-use': 'Ya existe una cuenta con ese correo.',
    'auth/weak-password': 'La contraseña debe tener al menos 6 caracteres.',
    'auth/network-request-failed': 'Sin conexión. Revisa tu internet e inténtalo de nuevo.'
  };
  return mapa[codigo] || 'Ocurrió un problema. Inténtalo de nuevo.';
}
