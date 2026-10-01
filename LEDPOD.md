# Operación interna de Ledpod

La portada pública de Ledpod es un catálogo consultivo: muestra iluminación, revestimientos PVC y pisos SPC, y deriva las cotizaciones a WhatsApp. No requiere carrito ni checkout.

## Firebase conservado
El panel interno continúa usando Firebase Authentication y Firestore. Las cuentas mantienen su `uid`; los perfiles siguen en `users/{uid}` y las reglas actuales se conservan.

## Roles y paneles
- Cliente: `src/panels/client.html`
- Comercio: `src/panels/merchant.html`
- Repartidor: `src/panels/driver.html`
- Admin: `src/panels/admin.html`

El registro sigue creando el rol `cliente`. Los roles se administran desde el panel Admin. Los flujos de pedidos y entregas existentes siguen disponibles dentro de los paneles, pero ya no forman parte de la experiencia pública de Ledpod.

## Colecciones conservadas
- `users/{uid}`: nombre, correo, rol y estado de cuenta.
- `customers/{uid}`: teléfono, dirección y favoritos.
- `stores/{storeId}` y `stores/{storeId}/products/{productId}`: catálogo, fotos y disponibilidad.
- `drivers/{uid}` y `orders/{orderId}`: perfiles de repartidor y flujo interno de pedidos.
- `adminSettings/config`: configuración editable del negocio.

La persistencia offline de Firestore y las reglas de seguridad existentes permanecen activas. El proyecto Firebase conserva sus identificadores actuales para no interrumpir Auth ni Firestore.

## Imágenes
No se encontró una integración de Cloudinary. Las fotos subidas desde los paneles se comprimen en el navegador y se guardan como data URL en Firestore; esto se mantiene sin cambios. Las imágenes de la portada pública son recursos remotos de inspiración.

## Publicación
El sitio se sirve estáticamente desde la raíz. Ver `DEPLOY.md` para Vercel, Netlify y los dominios autorizados de Firebase.