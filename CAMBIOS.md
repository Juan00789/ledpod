# Cambios — Ledpod

## Se completaron los 3 paneles que estaban vacíos

**Antes:** `src/panels/client.html`, `merchant.html` y `driver.html`
pesaban 0 bytes. Cualquier cliente, comercio o repartidor que iniciara
sesión entraba a un panel en blanco. Solo el panel Admin (gestión de
usuarios y roles) estaba realmente construido. La navegación lateral
de `app.js` tampoco cambiaba de contenido al hacer clic — solo
renombraba el título de la página.

**Ahora:** los 4 roles tienen un panel funcional, con navegación real
por pestañas (un
`data-section` por vista, solo una visible a la vez), conectado a un
ciclo de pedido completo de punta a punta:

```
Cliente arma el carrito y confirma
  -> Comercio ve el pedido, lo confirma / prepara / marca listo
    -> Repartidor ve el pedido en "Disponibles", lo toma
      -> Repartidor avanza: recogido -> en camino -> entregado
        -> Cliente ve el estado avanzar en "Mis pedidos"
```

### Cliente (`src/client/dashboard.js`)
Navega comercios abiertos y aprobados → entra a un comercio → agrega
productos al carrito → confirma con dirección de entrega → ve sus
pedidos en vivo con el estado actual → edita su perfil (nombre,
teléfono, dirección, guardados en `customers/{uid}`).

### Comercio (`src/merchant/dashboard.js`)
Primer uso: crea su comercio (queda `pending`, a la espera de
aprobación del Admin). Una vez aprobado (`status: active`), puede
abrir/cerrar (`open: true/false`), agregar productos, ver pedidos
entrantes y mover su estado dentro de su tramo
(confirmado → preparando → listo), y ver un resumen simple de ventas.

### Repartidor (`src/driver/dashboard.js`)
Completa su perfil (teléfono, vehículo) — igual que el comercio, queda
`pending` hasta que el Admin lo aprueba. Puede marcarse
disponible/desconectado, ver el pool de entregas listas para tomar
("Disponibles"), tomar una (con una transacción que evita que dos
repartidores tomen el mismo pedido a la vez), avanzar su entrega activa
y ver su historial + ganancias acumuladas.

### Admin (`src/admin/dashboard.js`) — extendido, no reescrito
Ya gestionaba usuarios/roles. Se agregaron dos listas más, mismo
patrón visual: **Comercios** y **Repartidores**, para aprobar
(`status: pending -> active`) — sin esto, ningún comercio ni repartidor
recién creado podía operar nunca, porque no había forma de aprobarlos.

## Nuevos módulos compartidos
- `src/shared/utils.js` — escape de HTML, formato de moneda (RD$),
  formato de fecha, sistema de toast (mismo patrón que ya usaba admin).
- `src/orders/orders-service.js` — todo el ciclo de vida del pedido,
  compartido por los 3 roles operativos. Las consultas usan un solo
  `where()` cada una y ordenan del lado del cliente, para no depender
  de índices compuestos de Firestore que habría que crear a mano en la
  consola (no verificable desde este entorno).
- `src/catalog/stores-service.js` — comercios y su subcolección de
  productos.
- `src/driver/driver-service.js` — perfil y disponibilidad del
  repartidor.

## Offline-first
`firebase.js` no tenía configurada la persistencia de Firestore —
`getFirestore(app)` a secas. Se cambió a `initializeFirestore` con
`persistentLocalCache` + `persistentMultipleTabManager`, mismo patrón
para que los 4 paneles lean de caché local sin
conexión y sincronicen solos al reconectar.

## `firestore.rules`
Las reglas originales solo dejaban escribir `stores` y sus productos al
Admin — el comercio no podía crear ni editar su propio negocio, lo cual
habría bloqueado el panel de comercio por completo. Se corrigió para
que:
- el dueño pueda crear y editar su propio comercio y productos, pero
  nunca su propio campo `status` de aprobación (eso es solo del Admin);
- lo mismo aplica a `drivers/{uid}`;
- `orders` pasó de "cualquier usuario logueado puede leer/escribir
  cualquier pedido" a permisos atados a quién es: el cliente dueño, el
  comercio dueño, el repartidor asignado (o el que lo está tomando), o
  el Admin.

Esto sigue siendo de nivel MVP, no un endurecimiento final de
producción — está comentado así directamente en el archivo de reglas,
seguido del mismo criterio que ya declaraban `README-MVP.md` y
`QUICKIE-MVP.md`.

## Qué falta (deliberadamente fuera de este alcance)
- Tarifa de envío fija (`RD$100`) en vez de calculada por distancia.
- Sin mapas/GPS ni pagos reales — ya estaba fuera de alcance según los
  documentos originales del proyecto.
- El promedio de calificación de un comercio/repartidor se calcula en
  el navegador a partir de sus propios pedidos (no hay un campo
  `ratingAvg` agregado por un backend) — es correcto pero recalcula en
  cada carga; para un catálogo con miles de pedidos por comercio
  convendría una Cloud Function que lo mantenga actualizado.
- La detección de bloqueo por parte del Admin es "al siguiente login /
  próxima recarga", no instantánea dentro de una pestaña ya abierta
  (el perfil se lee una vez con `getDoc`, no en tiempo real con
  `onSnapshot`) — sí queda bloqueado igual a nivel de reglas de
  Firestore para cualquier escritura, aunque la sesión del navegador
  siga "viva" hasta la próxima recarga.

## Sesión 2 — Blindaje del Admin, fotos reales de producto y despliegue

**Bloqueo de cuentas, ahora de verdad.** Antes, poner `status:
'blocked'` en el panel de Usuarios no impedía nada: el usuario seguía
usando la app con la sesión que ya tenía abierta, y hasta podía volver
a iniciar sesión sin problema. Ahora:
- `auth-service.js` revisa el perfil en cada cambio de sesión; si está
  bloqueado, cierra la sesión al instante (`signOut`) y nunca deja
  llegar a ningún panel.
- `firestore.rules` agrega `accountActive()` y la exige en las
  escrituras sensibles (crear pedido, crear/editar comercio, crear/
  editar repartidor, editar perfil de cliente) — así una pestaña que
  ya estaba abierta antes del bloqueo no puede seguir escribiendo
  directo contra Firestore aunque el `signOut` del cliente tarde en
  aplicarse.
- `login.html` muestra el mensaje "Tu cuenta fue bloqueada por un
  administrador" tanto si el bloqueo pasa en el propio intento de
  login como si pasa mientras la app ya estaba abierta en otra
  pestaña.

**El Admin ahora controla los pedidos, no solo los mira.** En "Todos
los pedidos" puede forzar cualquier estado (para resolver a mano una
incidencia) y quitarle el repartidor a un pedido (lo regresa al pool
de "Disponibles" para que otro lo tome). Nuevo en `orders-service.js`:
`adminSetOrderStatus`, `adminUnassignDriver`, `adminResolveIssue`.

**Incidencias con seguimiento real.** Antes era una lista de solo
lectura. Ahora cada incidencia se puede marcar "Resuelta" / "Pendiente"
(`resolvedByAdmin`), con pestañas para filtrar.

**Buscadores agregados** en Comercios, Repartidores y Todos los
pedidos del panel Admin (mismo patrón que ya tenía Usuarios).

**Cliente — Favoritos, búsqueda, cancelación y calificación.**
- Nueva sección "❤️ Favoritos": corazón en cada comercio de Inicio,
  guardado en `customers/{uid}.favorites` (array).
- Buscador de comercios por nombre/categoría en Inicio.
- El cliente puede cancelar su propio pedido mientras el comercio
  todavía no lo ha confirmado (`status: 'created'`).
- Al recibir el pedido, aparece un widget de calificación (1–5
  estrellas + comentario opcional) que se guarda en el propio
  documento del pedido (`rating: { stars, comment }`) — el comercio y
  el repartidor ya podían leer sus propios pedidos, así que no hizo
  falta ninguna colección ni regla nueva para mostrarlo.

**Fotos reales de producto — la mejora que pediste explícitamente.**
Antes solo había un campo de texto para un emoji. Ahora el comercio
puede tomar una foto con la cámara del celular o subir un archivo
(`<input type="file" accept="image/*" capture="environment">`), y se
comprime en el navegador (`src/shared/img-utils.js`: redimensiona a
~900px y comprime a JPEG) antes de guardarse como `photo` (data URL)
directo en el documento del producto — **no usa Firebase Storage**,
porque desde el 3 de febrero de 2026 Storage exige el plan de pago
Blaze incluso para uso mínimo, y este proyecto vive en el plan
gratuito Spark. El emoji queda como respaldo si no se sube foto.
También se agregó edición de producto (antes solo se podía eliminar y
volver a crear).

**Calificación promedio visible** para comercio y repartidor,
calculada de sus propios pedidos calificados.

**Listo para desplegar en Vercel y Netlify.** Nuevos `vercel.json`,
`netlify.toml`, `.gitignore` y `DEPLOY.md` con la guía paso a paso —
incluye la aclaración de que `server.js`/Express es solo para pruebas
locales opcionales y el sitio real se despliega 100% estático, sin
build command.

## Sesión 3 — Registro de comercio desde el Admin y promoción antes del registro

**El problema.** El Admin solo podía aprobar comercios que el propio
dueño ya había creado desde su panel (`src/merchant/dashboard.js`).
No había forma de dar de alta un negocio si esa persona todavía no
tenía cuenta en Ledpod, o si su cuenta existía pero seguía con el
rol `cliente` — y por eso tampoco había forma de promocionarlo en
Inicio con anticipación. Además, `firestore.rules` ni siquiera dejaba
crear un comercio como Admin: la regla de `create` solo contemplaba
`ownerId == request.auth.uid`, sin el `isAdmin()` de por medio.

**Ahora, en el panel Admin → Comercios:**
- **➕ Registrar comercio nuevo**: formulario para crear un comercio
  directamente (nombre, categoría, teléfono, dirección, descripción).
  - Si escribes el correo del dueño y esa cuenta ya existe, el
    comercio se vincula (`ownerId`) y su rol se sube a `comercio`
    automáticamente (`changeUserRole`), aunque antes fuera `cliente`.
  - Si el correo no tiene cuenta todavía (o se deja vacío), el
    comercio nace **sin dueño** (`ownerId: null`, `ownerEmail`
    guardado como referencia) pero con **estado "Activo" y abierto**
    por defecto — así aparece de una vez en Inicio como promoción,
    sin esperar a que esa persona se registre.
- **Vincular cuenta**: cada comercio sin dueño en la lista muestra un
  campo de correo + botón para vincularlo en cuanto esa persona sí se
  registre (mismo efecto: `ownerId` + rol subido a `comercio`).
- **🛍️ Productos**: cada comercio de la lista tiene un botón que abre
  un mini-gestor de productos (agregar/editar/eliminar — nombre,
  precio, emoji, descripción), para que el Admin pueda publicar el
  catálogo de un comercio que todavía no tiene dueño gestionándolo.

**Por qué los productos publicados no aparecían en Inicio.** No era
un bug de los productos en sí: un comercio solo aparece en Inicio
(`watchOpenStores` en `stores-service.js`) cuando **ambas** condiciones
se cumplen — `status: 'active'` (aprobado por Admin) y `open: true`
(el propio comercio decidió abrirlo). Un comercio recién creado por su
dueño nace `pending`/`false`, así que sus productos, aunque estén
publicados, quedan invisibles hasta que el Admin lo aprueba. El nuevo
flujo de registro desde el Admin evita justamente ese problema: nace
`active`/`open` de una vez (a menos que elijas "Pendiente de
aprobación" en el formulario).

**Nuevo en `src/catalog/stores-service.js`:** `adminCreateStore`,
`linkStoreOwner`. **Nuevo en `src/admin/user-manager.js`:**
`findUserByEmail`. **`firestore.rules`:** la regla `create` de
`stores` ahora también acepta `isAdmin()`, sin importar `ownerId` ni
`status`.
