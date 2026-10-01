import { register } from './register.js';
import { watchSession } from './auth-service.js';
import { mensajeErrorAuth } from '../shared/utils.js';

const form = document.getElementById('registerForm');
const nameInput = document.getElementById('name');
const emailInput = document.getElementById('email');
const passwordInput = document.getElementById('password');
const errorBox = document.getElementById('error');
const successBox = document.getElementById('ok');

form.addEventListener('submit', async (event) => {
  event.preventDefault();
  errorBox.style.display = 'none';
  successBox.style.display = 'none';

  try {
    await register(nameInput.value, emailInput.value, passwordInput.value);
    successBox.textContent = 'Cuenta creada. Entrando al panel Ledpod...';
    successBox.style.display = 'block';
    setTimeout(() => location.href = './app.html', 500);
  } catch (error) {
    errorBox.textContent = mensajeErrorAuth(error.code);
    errorBox.style.display = 'block';
  }
});

watchSession((session) => {
  if (session) location.href = './app.html';
});