import { createUserWithEmailAndPassword } from 'https://www.gstatic.com/firebasejs/12.1.0/firebase-auth.js';
import { doc, setDoc, serverTimestamp } from 'https://www.gstatic.com/firebasejs/12.1.0/firebase-firestore.js';
import { auth, db } from '../../firebase.js';

export async function register(name, email, password) {
  const credential = await createUserWithEmailAndPassword(auth, email.trim(), password);
  await setDoc(doc(db, 'users', credential.user.uid), {
    name: name.trim(), email: email.trim(), role: 'cliente', status: 'active', createdAt: serverTimestamp()
  });
  return credential.user;
}
