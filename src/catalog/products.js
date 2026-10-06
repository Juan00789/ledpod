import { PRODUCTS } from '../data.js';

export const demoProducts = PRODUCTS.map(product => ({
  id: product.id,
  emoji: product.icon,
  name: product.name,
  store: 'LEDPOD',
  price: product.price,
  eta: 'Consultar disponibilidad'
}));
