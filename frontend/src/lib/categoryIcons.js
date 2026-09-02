// Icono/emoji por categoría según palabras clave. Fallback → 📦
const RULES = [
  [/(bebid|refresc|gaseos|jugo|coca|pepsi|agua)/i, "🥤"],
  [/(cerve|licor|vino|ron|aguardiente|whisk)/i, "🍺"],
  [/(caf[eé]|colad|tinto)/i, "☕"],
  [/(pan|hogaza|arepa|tostad)/i, "🥖"],
  [/(lact|leche|yogur|queso|mantequilla|kumis)/i, "🥛"],
  [/(huevo)/i, "🥚"],
  [/(grano|arroz|frijol|lenteja|garbanzo|maíz|maiz)/i, "🌾"],
  [/(aceit|oliva|girasol)/i, "🫗"],
  [/(endulz|azúcar|azucar|panela|miel)/i, "🍯"],
  [/(golosi|dulc|chocolat|caramel|chicle|bombón|bombon)/i, "🍬"],
  [/(snack|papa|pasabocas|frituras|maní|mani)/i, "🥨"],
  [/(fruta|banano|manzana|pera|mango|uva|piña|pina)/i, "🍎"],
  [/(verdur|hortaliz|tomate|cebolla|zanahoria|papa)/i, "🥕"],
  [/(carne|pollo|cerdo|res|embutid|jamón|jamon|chorizo)/i, "🍗"],
  [/(pescad|atún|atun|mariscos|sardin)/i, "🐟"],
  [/(aseo|jabón|jabon|detergent|blanquead|limpiador|escoba)/i, "🧼"],
  [/(higien|papel|pañal|panal|toalla|shampoo|champu|desodor|cepill|pasta dental)/i, "🧴"],
  [/(bebé|bebe|niño|nino|infantil)/i, "🍼"],
  [/(mascot|perro|gato|concentrad)/i, "🐾"],
  [/(condim|salsa|sal|especia|vinag|mostaza)/i, "🧂"],
  [/(salud|medicin|farmacia)/i, "💊"],
  [/(cigarril|tabaco|fósforo|fosforo|encendedor)/i, "🚬"],
  [/(cuadern|papeler|lápiz|lapiz|escolar)/i, "✏️"],
  [/(hogar|utensilio|cocina)/i, "🍳"],
  [/(desayun|cereal|granola|avena)/i, "🥣"],
  [/(harin|pasta|espaguet|fideo)/i, "🍝"],
  [/(general)/i, "🛒"],
];

export function categoryIcon(name = "") {
  for (const [rx, emoji] of RULES) if (rx.test(name)) return emoji;
  return "📦";
}
