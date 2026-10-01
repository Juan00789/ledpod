import { login, resetPassword } from './login.js';
import { watchSession } from './auth-service.js';
import { mensajeErrorAuth } from '../shared/utils.js';

const form = document.getElementById('loginForm');
const emailInput = document.getElementById('email');
const passwordInput = document.getElementById('password');
const errorBox = document.getElementById('error');
const successBox = document.getElementById('ok');

function showError(message) {
  errorBox.textContent = message;
  errorBox.style.display = 'block';
}

if (sessionStorage.getItem('ledpodBlocked') || sessionStorage.getItem('rapiditoBlocked')) {
  sessionStorage.removeItem('ledpodBlocked');
  sessionStorage.removeItem('rapiditoBlocked');
  showError('Tu cuenta fue bloqueada por un administrador. Contacta a soporte.');
}

form.addEventListener('submit', async (event) => {
  event.preventDefault();
  errorBox.style.display = 'none';
  successBox.style.display = 'none';

  try {
    await login(emailInput.value, passwordInput.value);
  } catch (error) {
    showError(mensajeErrorAuth(error.code));
  }
});

document.getElementById('forgotPassword').addEventListener('click', async (event) => {
  event.preventDefault();
  errorBox.style.display = 'none';
  successBox.style.display = 'none';

  if (!emailInput.value.trim()) {
    showError('Escribe tu correo arriba para poder enviarte el enlace.');
    return;
  }

  try {
    await resetPassword(emailInput.value);
    successBox.textContent = 'Te enviamos un correo para restablecer tu contraseña.';
    successBox.style.display = 'block';
  } catch (error) {
    showError(mensajeErrorAuth(error.code));
  }
});

watchSession((session) => {
  if (session) location.href = './app.html';
}, () => {
  showError('Tu cuenta fue bloqueada por un administrador. Contacta a soporte.');
});