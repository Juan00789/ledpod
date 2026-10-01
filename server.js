import express from 'express';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const app = express();
app.use(express.json());
app.use(express.static(__dirname));

const products = [
  {id:1,name:'Cheeseburger',store:'Burger House',price:450,eta:'18–25 min'},
  {id:2,name:'Pizza pepperoni',store:'Pizza Punto',price:650,eta:'22–30 min'},
  {id:3,name:'Combo refrescos',store:'Quick Drinks',price:300,eta:'10–15 min'},
  {id:4,name:'Pollo crispy',store:'Pollo Express',price:525,eta:'20–28 min'}
];
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
app.listen(port, ()=>console.log(`Quickie demo: http://localhost:${port}`));
