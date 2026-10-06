import {
  collection,
  doc,
  onSnapshot,
  serverTimestamp,
  writeBatch,
  getDocs
} from 'https://www.gstatic.com/firebasejs/12.1.0/firebase-firestore.js';
import { db } from '../../firebase.js';

const inventoryRef = collection(db, 'catalogInventory');
const publishedRef = collection(db, 'catalogProducts');
const catalogStateRef = doc(db, 'catalogSettings', 'state');

export function watchCatalogProducts(callback, onError = console.error) {
  return onSnapshot(publishedRef, snapshot => {
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

function productData({ name, category, description, price, photo, visibility }) {
  return {
    name: name.trim(),
    category,
    description: description.trim(),
    price: Number(price),
    photo: photo || null,
    visibility: visibility === 'public' ? 'public' : 'private',
    updatedAt: serverTimestamp()
  };
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
  const batch = writeBatch(db);
  const productRef = doc(inventoryRef);
  const data = { ...productData(fields), createdAt: serverTimestamp() };
  batch.set(productRef, data);
  syncPublishedProduct(batch, productRef.id, data);
  batch.set(catalogStateRef, { initialized: true, updatedAt: serverTimestamp() });
  await batch.commit();
  return productRef;
}

export async function updateCatalogProduct(productId, fields) {
  const batch = writeBatch(db);
  const data = productData(fields);
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
        name: product.name,
        category: product.cat,
        description: product.sub,
        price: product.price,
        photo: product.img,
        visibility: 'public'
      }),
      createdAt: serverTimestamp()
    };
    batch.set(productRef, data);
    syncPublishedProduct(batch, productRef.id, data);
  });
  batch.set(catalogStateRef, { initialized: true, updatedAt: serverTimestamp() });
  await batch.commit();
}
