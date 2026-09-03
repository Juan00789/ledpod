import { onAuthStateChanged, signOut } from 'https://www.gstatic.com/firebasejs/12.1.0/firebase-auth.js';
import { doc, getDoc, setDoc, serverTimestamp } from 'https://www.gstatic.com/firebasejs/12.1.0/firebase-firestore.js';
import { auth, db } from '../../firebase.js';

// watchSession(callback, onBlocked?)
//
// callback(session|null) — se comporta igual que antes.
// onBlocked() — opcional. Se llama cuando el usuario SÍ tiene sesión
// válida en Firebase Auth, pero su perfil en Firestore tiene
// status: 'blocked'. En ese caso se cierra la sesión automáticamente
// (signOut) y se invoca callback(null) — un usuario bloqueado nunca
// llega a ver ningún panel, sin importar por dónde entre.
//
// Esto es lo que le da al Admin control real: antes, poner
// status: 'blocked' en el panel de Usuarios no bloqueaba nada de
// verdad — el usuario seguía usando la app con la sesión que ya tenía
// abierta en el navegador.
export function watchSession(callback, onBlocked) {
  return onAuthStateChanged(auth, async user => {
    if (!user) return callback(null);
    try {
      const ref = doc(db, 'users', user.uid);
      const snap = await getDoc(ref);

      if (!snap.exists()) {
        // Cuenta "fantasma": existe en Firebase Authentication (por
        // eso llegamos hasta acá) pero nunca se creó su documento en
        // Firestore — típicamente porque se creó a mano desde la
        // consola de Firebase, o porque el registro se interrumpió
        // justo después de crear la cuenta de Auth. Sin este
        // documento, la cuenta queda invisible en el panel de
        // Usuarios del Admin y, más grave, las reglas de seguridad de
        // Firestore niegan CUALQUIER escritura (pedidos, perfil,
        // favoritos) porque no tienen de dónde leer su rol/estado.
        // Lo creamos aquí mismo, en el primer login, para que la
        // cuenta quede completa automáticamente.
        const perfilNuevo = {
          name: user.displayName || '',
          email: user.email || '',
          role: 'cliente',
          status: 'active',
          createdAt: serverTimestamp()
        };
        await setDoc(ref, perfilNuevo);
        callback({ user, profile: { uid: user.uid, ...perfilNuevo } });
        return;
      }

      const profile = { uid: user.uid, ...snap.data() };

      if (profile.status === 'blocked') {
        await signOut(auth);
        if (onBlocked) onBlocked();
        callback(null);
        return;
      }

      callback({ user, profile });
    } catch (error) {
      console.error('No se pudo cargar el perfil:', error);
      callback({
        user,
        profile: { uid: user.uid, name: user.displayName || '', email: user.email || '', role: 'cliente', status: 'active' }
      });
    }
  });
}

export function logout() {
  return signOut(auth);
}
