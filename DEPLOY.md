# LEDPOP — Deploy
Sitio estático, sin build. Publica la raíz en Vercel o Netlify (ya incluyen headers de seguridad).
Local: `npx serve .` (los módulos ES requieren servidor, no abrir con doble clic).

## Catálogo e inventario

El catálogo público se administra desde **Mi Cuenta → Inventario LEDPOD** con una cuenta cuyo rol sea `admin` en Firestore. En el primer ingreso, usa **Importar los 4 productos actuales con sus fotos** para conservar las imágenes existentes como productos del inventario.

Cada producto puede guardarse como **Público** (aparece en la tienda) o **Privado** (solo lo ve el administrador). Las imágenes nuevas se comprimen en el navegador antes de guardarse en Firestore.

Al desplegar, publica también las reglas de `firestore.rules` en Firebase Console. El sitio necesita lectura pública de `catalogProducts` y `catalogSettings`; `catalogInventory` y las escrituras quedan limitados a administradores.

Si el catálogo todavía no se ha inicializado, la tienda conserva los productos locales de `src/data.js` y sus imágenes de `src/assets/products/`.

## Compartir y dominio

La página incluye metadatos básicos Open Graph y Twitter. Para añadir una imagen de vista previa y una URL canónica hace falta el dominio definitivo; actualízalos después de configurarlo.
