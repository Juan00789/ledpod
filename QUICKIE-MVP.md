# Quickie MVP — punto de trabajo

## Principio central
Cada cuenta es independiente. Firebase Authentication identifica al usuario mediante `uid`; Firestore relaciona sus perfiles, pedidos, comercio, entregas e historial con ese identificador.

## Acceso
- Registro público: crea únicamente `role: cliente`.
- Login: Firebase Authentication.
- Después del login se consulta `users/{uid}` y se abre el panel correspondiente.
- No existe selector de roles en la página pública.

## Paneles
### Cliente
Perfil, direcciones, favoritos, carrito, pedidos, seguimiento, historial y cuenta.

### Comercio
Perfil del comercio, estado abierto/cerrado, menú, productos, pedidos entrantes, preparación, historial y resumen de ventas.

### Repartidor
Perfil, disponibilidad, entregas disponibles, entrega activa, historial, ganancias y estado de conexión.

### Admin Central
Resumen operativo, usuarios, comercios, repartidores, pedidos, incidencias y configuración global.

## Flujo principal
Cliente → carrito → pedido → comercio confirma → comercio prepara → pedido listo → asignación de repartidor → recogido → en camino → entregado.

## Datos principales
`users`, `customers`, `stores`, `products` (subcolección de store), `drivers`, `orders`, `order events`, `deliveries`, `categories`, `adminSettings`.

## Demo vs producción
La demo prioriza navegación, identidad, separación de roles y modelo de datos. Pagos reales, GPS/mapas, notificaciones, reglas finales de Firestore y asignación automática se implementarán después.
