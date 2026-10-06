# LEDPOP — Deploy
Sitio estático, sin build. Publica la raíz en Vercel o Netlify (ya incluyen headers de seguridad).
Local: `npx serve .` (los módulos ES requieren servidor, no abrir con doble clic).

## Catálogo e inventario

El catálogo público se administra desde **Mi Cuenta → Inventario LEDPOD** con una cuenta cuyo rol sea `admin` en Firestore. En el primer ingreso, usa **Importar los 4 productos actuales con sus fotos** para conservar las imágenes existentes como productos del inventario.

El inventario Admin se separa en las pestañas **Públicos** y **Privados**. Cada producto se puede mover entre ambas; solo los públicos aparecen en la tienda LEDPOD. El inventario permite buscar por código de producto o nombre. Si no se indica un código, LEDPOD genera uno único automáticamente. Los productos que agregan los comercios desde sus paneles no se mezclan con la tienda pública de LEDPOD. Las imágenes nuevas se comprimen en el navegador antes de guardarse en Firestore.

Publica las reglas de `firestore.rules` en Firebase Console (o ejecuta `firebase deploy --only firestore:rules` desde un entorno autenticado; `firebase.json` ya apunta al archivo correcto). El inicio lee `catalogInventory` filtrando `visibility == "public"`; las reglas permiten leer solo esos productos y mantienen los privados y las escrituras limitados a administradores. `catalogProducts` se conserva como copia de compatibilidad para despliegues anteriores.

La página Inicio muestra únicamente los productos públicos de Firebase; no sustituye un catálogo vacío por productos de ejemplo ni por imágenes locales. Si no hay productos publicados, informa que el catálogo está en preparación y ofrece consultar disponibilidad por WhatsApp. Las categorías del catálogo, incluidas Iluminación LED, Decoración, Eléctricos, Seguridad y Servicios Técnicos, se definen en `src/data.js`.

## Compartir y dominio

La página incluye metadatos básicos Open Graph y Twitter. Para añadir una imagen de vista previa y una URL canónica hace falta el dominio definitivo; actualízalos después de configurarlo.
