// src/shared/img-utils.js
//
// Compresión de imágenes en el navegador para guardarlas como base64
// directamente en el documento de Firestore (sin depender de Firebase
// Storage, que desde el 3 de febrero de 2026 exige el plan de pago
// Blaze incluso para uso mínimo — este proyecto vive en el plan
// gratuito Spark). Un documento de Firestore soporta hasta 1 MiB, así
// que redimensionamos y comprimimos antes de guardar para quedar bien
// por debajo de ese límite.
//
// Sirve tanto para "seleccionar archivo" como para "tomar foto" —
// ambos casos llegan aquí como el mismo objeto File, gracias al
// atributo `capture` en el <input type="file"> del panel de comercio.

const MAX_DIMENSION = 900;   // px, en el lado más largo
const JPEG_QUALITY = 0.72;   // suficiente para miniaturas de producto
const MAX_BYTES = 700 * 1024; // margen de seguridad bajo 1 MiB

export function isImageFile(file) {
  return !!file && file.type && file.type.startsWith('image/');
}

// Redimensiona manteniendo proporción y comprime a JPEG. Devuelve un
// data URL (string) listo para guardar en Firestore como campo `photo`.
export async function compressImageToDataUrl(file, {
  maxDimension = MAX_DIMENSION,
  quality = JPEG_QUALITY
} = {}) {
  if (!isImageFile(file)) throw new Error('El archivo seleccionado no es una imagen.');

  const bitmap = await loadBitmap(file);
  const { width, height } = fitDimensions(bitmap.width, bitmap.height, maxDimension);

  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  ctx.drawImage(bitmap, 0, 0, width, height);

  let dataUrl = canvas.toDataURL('image/jpeg', quality);

  // Si aun así queda pesado (fotos muy detalladas), bajamos calidad
  // un par de escalones más antes de rendirnos.
  let intentos = 0;
  let q = quality;
  while (dataUrl.length > MAX_BYTES * 1.37 && intentos < 3) { // *1.37 ≈ overhead de base64
    q -= 0.15;
    dataUrl = canvas.toDataURL('image/jpeg', Math.max(q, 0.3));
    intentos += 1;
  }

  if (dataUrl.length > MAX_BYTES * 1.37) {
    throw new Error('La imagen sigue siendo muy pesada incluso comprimida. Prueba con otra foto.');
  }

  return dataUrl;
}

function fitDimensions(width, height, maxDimension) {
  if (width <= maxDimension && height <= maxDimension) return { width, height };
  const ratio = width > height ? maxDimension / width : maxDimension / height;
  return { width: Math.round(width * ratio), height: Math.round(height * ratio) };
}

function loadBitmap(file) {
  if (window.createImageBitmap) {
    return createImageBitmap(file);
  }
  // Respaldo para navegadores sin createImageBitmap.
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('No se pudo leer la imagen.'));
    img.src = URL.createObjectURL(file);
  });
}
