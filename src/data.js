// Edita aquí tus productos. `img` es opcional (ej. "./src/assets/products/tira-led.jpg").
export const CATEGORIES = [
  { id: "iluminacion", icon: "💡", name: "Iluminación LED", sub: "Luces interiores y exteriores, lámparas" },
  { id: "decoracion", icon: "✨", name: "Decoración", sub: "Pisos SPC, PVC mármol, WPC y paneles" },
  { id: "electricos", icon: "🔌", name: "Eléctricos", sub: "Cables, enchufes, accesorios" },
  { id: "seguridad", icon: "📹", name: "Seguridad", sub: "Cámaras, alarmas, accesorios" },
  { id: "servicios-tecnicos", icon: "🛠️", name: "Servicios Técnicos", sub: "Instalación y asesoría especializada" }
];
export function categoryIdFromValue(value) {
  const normalized = String(value || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim().toLowerCase();
  const category = CATEGORIES.find((item) =>
    [item.id, item.name].some((label) =>
      label.normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim().toLowerCase() === normalized
    )
  );
  if (category) return category.id;
  if (/lampar|ilumin|bombill|led/.test(normalized)) return "iluminacion";
  if (/decor|guirnal|ambiente/.test(normalized)) return "decoracion";
  if (/electric|cable|enchufe/.test(normalized)) return "electricos";
  if (/segur|camara|alarma/.test(normalized)) return "seguridad";
  if (/tecnic|servicio|instal/.test(normalized)) return "servicios-tecnicos";
  return "";
}
export const PRODUCTS = [
  { id: "tira-5050", img: "./src/assets/products/tira-led-5050.jpg", cat: "iluminacion", name: "Tira LED 5050 12V", sub: "Blanco cálido | 5 metros", price: 1250, icon: "💡" },
  { id: "panel-18w", img: "./src/assets/products/panel-led-18w.jpg", cat: "iluminacion", name: "Panel LED 18W", sub: "Luz blanca | Empotrable", price: 850, icon: "⚪" },
  { id: "reflector-50w", img: "./src/assets/products/reflector-led-50w.jpg", cat: "iluminacion", name: "Reflector LED 50W", sub: "Exterior | IP66", price: 2400, icon: "🔦" },
  { id: "camara-hd", img: "./src/assets/products/camara-seguridad.jpg", cat: "seguridad", name: "Cámara de Seguridad", sub: "HD | Visión nocturna", price: 3500, icon: "📹" }
];
export const WHATSAPP = "18498865556";
export const SLIDES = [
  ["Luces y luminarias", "Iluminación LED eficiente y lámparas decorativas para interiores y exteriores."],
  ["Renueva tus espacios", "Pisos SPC, paneles acanalados, PVC mármol y WPC para exteriores."],
  ["Asesoría y entrega", "Consulta tus proyectos y coordina delivery o recogida en tienda."]
];
