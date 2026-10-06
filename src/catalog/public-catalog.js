import {
  collection,
  doc,
  getDoc,
  onSnapshot,
  query,
  serverTimestamp,
  where,
  writeBatch,
  getDocs
} from 'https://www.gstatic.com/firebasejs/12.1.0/firebase-firestore.js';
import { db } from '../../firebase.js';
import { CATEGORIES } from '../data.js';
import { getProductPhotos, productPhotoFields } from '../shared/product-photos.js';

const inventoryRef = collection(db, 'catalogInventory');
const publishedRef = collection(db, 'catalogProducts');
const catalogStateRef = doc(db, 'catalogSettings', 'state');

export function catalogProductCode(productId) {
  const normalizedId = String(productId).toUpperCase().replace(/[^A-Z0-9]/g, '');
  return `LED-${normalizedId.slice(-8)}`;
}

export function watchCatalogProducts(callback, onError = console.error) {
  const publicInventoryQuery = query(inventoryRef, where('visibility', '==', 'public'));
  return onSnapshot(publicInventoryQuery, snapshot => {
    callback(snapshot.docs.map(product => ({ id: product.id, ...product.data() })));
  }, onError);
}

export function watchCatalogState(callback, onError = console.error) {
  return onSnapshot(catalogStateRef, snapshot => {
    callback(snapshot.exists() && snapshot.data().initialized === true);
  }, onError);
}

export function watchCatalogInventory(callback, onError = console.error) {
  return onSnapshot(inventoryRef, snapshot => {
    callback(snapshot.docs.map(product => ({ id: product.id, ...product.data() })));
  }, onError);
}

export async function syncPublishedCatalog() {
  const [inventorySnapshot, publishedSnapshot, catalogState] = await Promise.all([
    getDocs(inventoryRef),
    getDocs(publishedRef),
    getDoc(catalogStateRef)
  ]);
  const publishedById = new Map(
    publishedSnapshot.docs.map(product => [product.id, product.data()])
  );
  const writes = [];

  inventorySnapshot.docs.forEach(product => {
    const data = product.data();
    const published = publishedById.get(product.id);
    if (data.visibility === 'private') {
      if (published) writes.push(batch => batch.delete(doc(publishedRef, product.id)));
      return;
    }

    const publicData = {
      ...data,
      code: data.code || catalogProductCode(product.id),
      visibility: 'public'
    };
    if (data.visibility !== 'public' || !data.code) {
      writes.push(batch => batch.set(doc(inventoryRef, product.id), {
        code: publicData.code,
        visibility: 'public',
        updatedAt: serverTimestamp()
      }, { merge: true }));
    }
    const needsPublish = !published || [
      'code', 'name', 'category', 'description', 'price', 'photo', 'visibility', 'photos'
    ].some(field => {
      const publishedValue = published[field] ?? (field === 'photos' ? [] : null);
      const inventoryValue = publicData[field] ?? (field === 'photos' ? [] : null);
      return field === 'photos'
        ? JSON.stringify(publishedValue) !== JSON.stringify(inventoryValue)
        : publishedValue !== inventoryValue;
    });
    if (needsPublish) {
      writes.push(batch => batch.set(doc(publishedRef, product.id), publicData));
    }
  });

  if (inventorySnapshot.size && catalogState.data()?.initialized !== true) {
    writes.push(batch => batch.set(catalogStateRef, {
      initialized: true,
      updatedAt: serverTimestamp()
    }));
  }

  for (let offset = 0; offset < writes.length; offset += 450) {
    const batch = writeBatch(db);
    writes.slice(offset, offset + 450).forEach(write => write(batch));
    await batch.commit();
  }
  return writes.length;
}

function productData({ code, name, category, description, price, photo, photos, visibility }, productId) {
  const cleanName = String(name || '').trim();
  const categoryValue = String(category || '').trim().toLowerCase();
  const matchedCategory = CATEGORIES.find(item =>
    item.id.toLowerCase() === categoryValue || item.name.toLowerCase() === categoryValue
  );
  const numericPrice = Number(price);

  if (!cleanName) throw new Error('Escribe el nombre del producto.');
  if (!matchedCategory) throw new Error('Selecciona una categoría válida del catálogo LEDPOD.');
  if (!Number.isFinite(numericPrice) || numericPrice < 0) throw new Error('Escribe un precio válido mayor o igual a cero.');

  const productPhotos = getProductPhotos({ photo, photos });
  return {
    code: String(code || '').trim().toUpperCase() || catalogProductCode(productId),
    name: cleanName,
    category: matchedCategory.id,
    description: String(description || '').trim(),
    price: numericPrice,
    ...productPhotoFields(productPhotos),
    visibility: visibility === 'public' ? 'public' : 'private',
    updatedAt: serverTimestamp()
  };
}

async function ensureUniqueProductCode(code, excludedProductId = '') {
  const inventory = await getDocs(inventoryRef);
  const duplicate = inventory.docs.find(product => {
    if (product.id === excludedProductId) return false;
    const data = product.data();
    const existingCode = String(data.code || catalogProductCode(product.id)).trim();
    return existingCode.toUpperCase() === code.toUpperCase();
  });
  if (duplicate) throw new Error('Ese código ya está asignado a otro producto.');
}

function syncPublishedProduct(batch, productId, product) {
  const publishedProduct = doc(db, 'catalogProducts', productId);
  if (product.visibility === 'public') {
    batch.set(publishedProduct, product);
  } else {
    batch.delete(publishedProduct);
  }
}

export async function addCatalogProduct(fields) {
  const productRef = doc(inventoryRef);
  const data = productData(fields, productRef.id);
  await ensureUniqueProductCode(data.code);
  const batch = writeBatch(db);
  data.createdAt = serverTimestamp();
  batch.set(productRef, data);
  syncPublishedProduct(batch, productRef.id, data);
  batch.set(catalogStateRef, { initialized: true, updatedAt: serverTimestamp() });
  await batch.commit();
  return productRef;
}

export async function updateCatalogProduct(productId, fields) {
  const data = productData(fields, productId);
  await ensureUniqueProductCode(data.code, productId);
  const batch = writeBatch(db);
  batch.update(doc(db, 'catalogInventory', productId), data);
  syncPublishedProduct(batch, productId, data);
  batch.set(catalogStateRef, { initialized: true, updatedAt: serverTimestamp() });
  await batch.commit();
}

export async function deleteCatalogProduct(productId) {
  const batch = writeBatch(db);
  batch.delete(doc(db, 'catalogInventory', productId));
  batch.delete(doc(db, 'catalogProducts', productId));
  batch.set(catalogStateRef, { initialized: true, updatedAt: serverTimestamp() });
  await batch.commit();
}

export async function seedCatalogProducts(products) {
  if (!products.length) return;
  const existing = await getDocs(inventoryRef);
  if (!existing.empty) throw new Error('El inventario ya contiene productos.');

  const batch = writeBatch(db);
  products.forEach(product => {
    const productRef = doc(inventoryRef, product.id);
    const data = {
      ...productData({
        code: product.code,
        name: product.name,
        category: product.cat,
        description: product.sub,
        price: product.price,
        photo: product.img,
        visibility: 'public'
      }, product.id),
      createdAt: serverTimestamp()
    };
    batch.set(productRef, data);
    syncPublishedProduct(batch, productRef.id, data);
  });
  batch.set(catalogStateRef, { initialized: true, updatedAt: serverTimestamp() });
  await batch.commit();
}
