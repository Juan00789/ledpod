# Quickie — estructura Firestore

## 1. `users/{uid}`
Documento base para cualquier cuenta.

```text
email
name
phone
role: cliente | comercio | repartidor | admin
status: active | pending | suspended
photoUrl
createdAt
updatedAt
```

El registro público crea siempre `role: cliente`. Los roles privilegiados NO se eligen desde el formulario.

## 2. `customers/{uid}`
```text
userId
addresses[]
defaultAddressId
favoriteStores[]
loyaltyPoints
createdAt
```

## 3. `stores/{storeId}`
```text
ownerId
name
description
phone
logoUrl
coverUrl
status: pending | active | paused | suspended
address
location: { lat, lng }
hours
categories[]
commissionRate
createdAt
updatedAt
```

## 4. `stores/{storeId}/products/{productId}`
```text
name
description
price
imageUrl
categoryId
available
stock
options[]
createdAt
updatedAt
```

## 5. `drivers/{uid}`
```text
userId
status: pending | active | suspended
dispatchStatus: offline | available | busy
phone
vehicle: { type, brand, model, plate }
location: { lat, lng, updatedAt }
rating
completedDeliveries
earnings
createdAt
```

## 6. `orders/{orderId}`
```text
customerId
storeId
driverId
items[]
subtotal
deliveryFee
serviceFee
discount
total
paymentMethod
paymentStatus
status: created | confirmed | preparing | ready | assigned | picked_up | on_the_way | delivered | cancelled | failed
customerAddress
createdAt
updatedAt
```

## 7. `orders/{orderId}/events/{eventId}`
Auditoría del pedido.

```text
status
actorId
actorRole
note
createdAt
```

## 8. `deliveries/{deliveryId}`
```text
orderId
driverId
status
offeredAt
acceptedAt
pickedUpAt
deliveredAt
pickupLocation
dropoffLocation
proofType
proofUrl
createdAt
```

## 9. `adminSettings/config`
Configuración global no sensible.

```text
currency
serviceFee
defaultDeliveryFee
maintenanceMode
minOrderAmount
updatedAt
```

## 10. `categories/{categoryId}`
```text
name
icon
active
sortOrder
```

### Reglas de negocio
- Cliente: puede registrarse públicamente y leer/escribir solo sus datos y pedidos.
- Comercio: debe ser aprobado por Admin antes de operar y solo administra sus comercios/productos/pedidos.
- Repartidor: debe ser aprobado por Admin y solo administra su perfil de repartidor y entregas asignadas.
- Admin: gestiona usuarios, roles, comercios, repartidores, pedidos, incidencias y configuración.
- El frontend nunca debe poder convertir un usuario en `admin`, `comercio` o `repartidor` por sí solo.
- El cambio de rol debe hacerse mediante un proceso administrativo seguro y reglas de Firestore.
