# Desplegar Ledpod

## Qué tipo de proyecto es esto
El frontend (`index.html`, `login.html`, `register.html`, `app.html` +
todo `src/`) habla **directo con Firebase** (Auth y Firestore) desde
el navegador — no necesita ningún servidor propio para funcionar en
producción. Es un sitio 100% estático.

`server.js` / `package.json` (Express) es un servidor **solo para
pruebas locales opcionales** de una API de ejemplo (`/api/health`,
`/api/products`, `/api/orders`) que documenta `README-MVP.md` — el
frontend real no lo llama para nada (`app.js`, `client/dashboard.js`,
etc. usan Firestore directamente). Puedes ignorarlo por completo para
el despliegue.

Eso significa: **para Vercel y Netlify, se despliega como sitio
estático, sin build command y sin backend.**

## Antes de desplegar — checklist de Firebase
1. En Firebase Console → Authentication → habilita el método
   **Correo/contraseña**.
2. En Firebase Console → Firestore → reglas: pega el contenido de
   `firestore.rules` (Publicar).
3. Crea manualmente en Firestore el primer usuario `admin`: regístrate
   normal desde `register.html` (queda como `cliente`), y luego en la
   consola de Firestore cambia a mano ese documento en
   `users/{tu-uid}` → `role: "admin"`. De ahí en adelante ya puedes
   cambiar roles desde el propio panel Admin.
4. En Firebase Console → Authentication → Settings → **Authorized
   domains**: agrega el dominio que te dé Vercel/Netlify (ej.
   `ledpod.vercel.app`) — si no lo agregas, el login fallará
   con `auth/unauthorized-domain`.

Las claves en `firebase.js` (`apiKey`, etc.) son claves públicas de
cliente — es normal y seguro que viajen en el código del frontend. La
seguridad real vive en `firestore.rules`.

## Desplegar en Vercel
**Opción A — Dashboard:**
1. Sube este proyecto a un repositorio de GitHub/GitLab.
2. En vercel.com → "Add New Project" → importa el repo.
3. Framework preset: **Other**. Build command: (vacío). Output
   directory: `.` (raíz).
4. Deploy.

**Opción B — CLI:**
```bash
npm install -g vercel
cd <directorio-del-proyecto>
vercel --prod
```
`vercel.json` ya está incluido con cabeceras de seguridad básicas y
caché larga para los assets (logos).

## Desplegar en Netlify
**Opción A — Dashboard:**
1. Sube el proyecto a GitHub/GitLab.
2. En app.netlify.com → "Add new site" → "Import an existing project".
3. Build command: (vacío). Publish directory: `.` (raíz).
4. Deploy.

**Opción B — CLI:**
```bash
npm install -g netlify-cli
cd <directorio-del-proyecto>
netlify deploy --prod
```
`netlify.toml` ya está incluido (`publish = "."`, sin build command,
mismas cabeceras de seguridad).

## Después de desplegar
- Prueba registrar una cuenta nueva, hacer login, y confirma que cada
  rol carga su panel.
- Ve al primer paso del checklist de arriba si el login da
  `auth/unauthorized-domain`.
- `node_modules/` no se sube (ver `.gitignore`) — ni falta, el sitio
  no lo necesita para correr.
