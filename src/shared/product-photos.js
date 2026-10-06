import { compressImageToDataUrl } from './img-utils.js';

export const MAX_PRODUCT_PHOTOS = 5;
const MAX_TOTAL_PHOTO_LENGTH = 970 * 1024;

export function getProductPhotos(product) {
  const primaryPhoto = typeof product?.photo === 'string' ? product.photo : '';
  const additionalPhotos = Array.isArray(product?.photos)
    ? product.photos.filter(photo => typeof photo === 'string' && photo)
    : [];
  const photos = primaryPhoto ? [primaryPhoto, ...additionalPhotos] : additionalPhotos;
  return [...new Set(photos)];
}

export function productPhotoFields(photos) {
  if (photos.length > MAX_PRODUCT_PHOTOS) {
    throw new Error(`Puedes guardar hasta ${MAX_PRODUCT_PHOTOS} fotos por producto.`);
  }
  if (photos.reduce((total, photo) => total + photo.length, 0) > MAX_TOTAL_PHOTO_LENGTH) {
    throw new Error('Las fotos superan el tamaño permitido. Prueba con menos fotos o imágenes más pequeñas.');
  }
  return {
    photo: photos[0] || null,
    photos: photos.slice(1)
  };
}

export async function addSelectedProductPhotos(files, currentPhotos) {
  const selectedFiles = Array.from(files || []);
  if (!selectedFiles.length) return currentPhotos;
  if (currentPhotos.length + selectedFiles.length > MAX_PRODUCT_PHOTOS) {
    throw new Error(`Puedes guardar hasta ${MAX_PRODUCT_PHOTOS} fotos por producto.`);
  }

  const newPhotos = [];
  for (const file of selectedFiles) {
    newPhotos.push(await compressImageToDataUrl(file, { maxDimension: 760, quality: 0.68 }));
  }

  const photos = [...currentPhotos, ...newPhotos];
  if (photos.reduce((total, photo) => total + photo.length, 0) > MAX_TOTAL_PHOTO_LENGTH) {
    throw new Error('Las fotos superan el tamaño permitido. Prueba con menos fotos o imágenes más pequeñas.');
  }
  return photos;
}

export function renderProductPhotoGallery(container, photos, onRemove) {
  if (!container) return;
  container.replaceChildren();

  if (!photos.length) {
    const placeholder = document.createElement('div');
    placeholder.className = 'photo-gallery-empty';
    placeholder.innerHTML = '<span>📦</span><strong>Aún no hay fotos</strong><small>Selecciona varias imágenes para verlas aquí.</small>';
    container.append(placeholder);
    return;
  }

  const main = document.createElement('div');
  main.className = 'photo-gallery-main';
  const mainImage = document.createElement('img');
  mainImage.src = photos[0];
  mainImage.alt = 'Vista previa de la foto 1';
  main.append(mainImage);

  const badge = document.createElement('span');
  badge.className = 'photo-gallery-count';
  badge.textContent = `${photos.length} ${photos.length === 1 ? 'foto' : 'fotos'}`;
  main.append(badge);
  container.append(main);

  const thumbnails = document.createElement('div');
  thumbnails.className = 'photo-gallery-thumbnails';
  photos.forEach((photo, index) => {
    const item = document.createElement('div');
    item.className = 'photo-gallery-item';
    const selectButton = document.createElement('button');
    selectButton.type = 'button';
    selectButton.className = `photo-gallery-thumb${index === 0 ? ' is-active' : ''}`;
    selectButton.setAttribute('aria-label', `Previsualizar foto ${index + 1}`);
    const image = document.createElement('img');
    image.src = photo;
    image.alt = `Foto ${index + 1} del producto`;
    selectButton.append(image);
    selectButton.addEventListener('click', () => {
      mainImage.src = photo;
      mainImage.alt = `Vista previa de la foto ${index + 1}`;
      thumbnails.querySelectorAll('.photo-gallery-thumb').forEach((button, buttonIndex) => {
        button.classList.toggle('is-active', buttonIndex === index);
      });
    });

    const removeButton = document.createElement('button');
    removeButton.type = 'button';
    removeButton.className = 'photo-gallery-remove';
    removeButton.textContent = '×';
    removeButton.setAttribute('aria-label', `Quitar foto ${index + 1}`);
    removeButton.addEventListener('click', () => onRemove(index));

    item.append(selectButton, removeButton);
    thumbnails.append(item);
  });
  container.append(thumbnails);
}
