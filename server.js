import express from 'express';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { PRODUCTS } from './src/data.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const app = express();
app.use(express.json());
app.use(express.static(__dirname));

const products = PRODUCTS.map(product => ({
  id: product.id,
  name: product.name,
  store: 'LEDPOD',
  price: product.price,
  eta: 'Consultar disponibilidad'
}));
const orders = [];
let nextOrder = 2842;

app.get('/api/health', (_req,res)=>res.json({ok:true,service:'ledpod'}));
app.get('/api/products', (_req,res)=>res.json(products));
app.get('/api/orders/:id', (req,res)=>{
  const order = orders.find(o=>String(o.id)===String(req.params.id));
  if(!order) return res.status(404).json({error:'Pedido no encontrado'});
  res.json(order);
});
app.post('/api/orders', (req,res)=>{
  const items = Array.isArray(req.body.items) ? req.body.items : [];
  if(!items.length) return res.status(400).json({error:'El pedido necesita productos'});
  const total = items.reduce((sum,item)=>sum + Number(item.price||0)*Number(item.quantity||1),0);
  const order = {id:`QK-${nextOrder++}`,status:'received',items,total,createdAt:new Date().toISOString(),delivery:{assigned:false,driver:null}};
  orders.push(order);
  res.status(201).json(order);
});

const port = process.env.PORT || 3000;
app.listen(port, ()=>console.log(`LEDPOD: http://localhost:${port}`));
