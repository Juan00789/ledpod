# Ledpod

Sitio de iluminación, revestimientos y pisos SPC en Puerto Plata. La portada pública funciona como catálogo de inspiración y dirige las cotizaciones a WhatsApp; no requiere carrito ni checkout.

## Catálogo público
- Perfiles y tiras LED, lámparas decorativas y Smart Lighting.
- Paneles PVC marmolizados y pisos SPC.
- Inspiración visual, ubicación, mapa, contacto y calificación 5.0 indicada por el negocio.

Abre `index.html` para revisar la portada. Sus imágenes se cargan desde Unsplash y el mapa desde Google Maps.

## Paneles y Firebase
Se conservan las pantallas internas existentes, Firebase Authentication, Firestore, reglas, roles, caché offline y herramientas de administración. La configuración Firebase permanece vinculada al proyecto existente; no cambies sus identificadores al desplegar.

Los paneles internos incluyen gestión de cuentas, catálogo, pedidos y repartidores heredada de la aplicación anterior. El sitio público nuevo no expone el flujo de pedidos y vende por cotización directa.

## Despliegue
Es un sitio estático y puede publicarse desde la raíz en Vercel o Netlify. Para dominios nuevos usados por los paneles internos, agrega el dominio a Firebase Authentication → Authorized domains. Consulta `DEPLOY.md`.

No hay una integración de Cloudinary en el repositorio. Las fotos gestionadas desde los paneles se comprimen en el navegador y se guardan en Firestore; la nueva portada usa imágenes remotas de inspiración.
# ledpod
