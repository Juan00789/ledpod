# QuickieRapidito

Nombre comercial de la aplicación: **QuickieRapidito**.

## Identidad de usuarios
Cada cuenta es independiente y se identifica por el `uid` de Firebase Authentication. El perfil se guarda en `users/{uid}`.

## Roles
`cliente`, `comercio`, `repartidor`, `admin`.

El registro público crea `cliente`; no hay selector de rol en el registro. El cambio de rol se realiza desde el panel Admin Central y actualiza Firestore.

## Paneles
- Cliente: `src/panels/client.html`
- Comercio: `src/panels/merchant.html`
- Repartidor: `src/panels/driver.html`
- Admin: `src/panels/admin.html`

## El Admin tiene control real, no solo visibilidad
- **Bloqueo de cuentas de verdad**: poner `status: 'blocked'` en Usuarios cierra la sesión del usuario al instante (o en su próximo intento de login) y bloquea sus escrituras directas en Firestore, no solo el acceso a la interfaz.
- **Aprobación de comercios y repartidores**: nadie recibe pedidos hasta que el Admin cambia su estado a `active`.
- **Control de pedidos**: en "Todos los pedidos" puede forzar cualquier estado (para resolver incidencias a mano) y quitarle el repartidor a un pedido asignado (vuelve al pool de "Disponibles").
- **Incidencias con seguimiento**: los pedidos cancelados/fallidos se pueden marcar como resueltos o pendientes.
- **Configuración del negocio**: nombre, teléfono, correo y zona de cobertura, editables desde el propio panel (`adminSettings/config`).
- Buscadores en Usuarios, Comercios, Repartidores y Pedidos.

## Colecciones de Firestore
- `users/{uid}` — perfil base: `name`, `email`, `role`, `status` (`active`/`blocked`).
- `customers/{uid}` — datos extendidos del cliente: `phone`, `address`, `favorites` (array de `storeId`).
- `stores/{storeId}` — perfil del comercio: `ownerId`, `name`, `category`, `status` (`pending`/`active`/`paused`/`suspended`), `open`.
  - `stores/{storeId}/products/{productId}` — `name`, `price`, `description`, `emoji`, `photo` (data URL opcional), `available`.
- `drivers/{uid}` — perfil del repartidor: `status`, `vehicle: { type, plate }`.
- `orders/{orderId}` — ciclo completo del pedido: `customerId`, `storeId`, `driverId`, `status`, `items`, `total`, `rating: { stars, comment }` (opcional), `resolvedByAdmin` (solo si tuvo incidencia).
- `adminSettings/config` — configuración general del negocio.

## Fotos de producto
El comercio puede tomar una foto con la cámara del celular o subir un archivo desde el formulario de producto. Se comprime en el navegador (`src/shared/img-utils.js`, redimensiona a ~900px y comprime a JPEG) y se guarda como data URL directo en el documento del producto (`photo`) — no usa Firebase Storage, porque desde el 3 de febrero de 2026 exige el plan de pago Blaze. Si no hay foto, la tarjeta usa el emoji como respaldo.

## Favoritos y calificación (cliente)
- El cliente puede marcar comercios como favoritos (❤️ en cualquier tarjeta de Inicio); se guardan en `customers/{uid}.favorites`.
- Puede cancelar su propio pedido mientras el comercio todavía no lo ha confirmado.
- Al recibir el pedido, puede calificarlo (1–5 estrellas + comentario opcional); comercio y repartidor ven su promedio calculado en vivo a partir de sus propios pedidos calificados.

## Despliegue
Es un sitio estático (el frontend habla directo con Firebase; `server.js`/Express es solo para pruebas locales opcionales). Ver `DEPLOY.md` para la guía paso a paso en Vercel y Netlify, incluyendo el checklist de configuración de Firebase (Authentication, reglas de Firestore, dominios autorizados).
