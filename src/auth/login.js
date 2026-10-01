import { signInWithEmailAndPassword, sendPasswordResetEmail } from 'https://www.gstatic.com/firebasejs/12.1.0/firebase-auth.js';
import { auth } from '../../firebase.js';

export async function login(email, password) {
  return signInWithEmailAndPassword(auth, email.trim(), password);
}

// Firebase Auth envía el enlace de restablecimiento; acá solo se
// dispara la llamada.
export async function resetPassword(email) {
  return sendPasswordResetEmail(auth, email.trim());
}
