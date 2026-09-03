# Quickie MVP — backend demo

Esta rama agrega una primera capa real de backend sobre la demo frontend.

## Ahora incluye
- Node.js + Express
- `GET /api/health`
- `GET /api/products`
- `POST /api/orders`
- `GET /api/orders/:id`
- Memoria temporal para pedidos
- Identificadores tipo `QK-2842`
- Estado inicial del pedido y estructura de repartidor

## Todavía no es producción
No incluye pagos reales, mapas/GPS, autenticación, base de datos persistente, notificaciones ni asignación real de repartidores.

## Ejecutar
```bash
npm install
npm start
```
Luego abre `http://localhost:3000`.

## Próximas capas
1. SQLite/PostgreSQL
2. usuarios y autenticación
3. panel comercio
4. app/panel repartidor
5. estados de pedido en tiempo real
6. mapas y geolocalización
7. pagos
8. motor de asignación de repartidores
