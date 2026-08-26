export const SEASONINGS = Object.freeze([
  { code: "spicy", label: "辣粉" },
  { code: "plum", label: "梅粉" },
  { code: "pepper", label: "胡椒" },
]);

// Development catalog only. Headquarters must confirm formal counter prices before release.
export const QUICK_CHECKOUT_DEMO_PRODUCTS = Object.freeze([
  { code: "chicken_wing", name: "雞翅", price: 20, category: "炸雞" },
  { code: "chicken_leg", name: "雞腿", price: 35, category: "炸雞" },
  { code: "thigh_steak", name: "腿排", price: 40, category: "炸雞" },
  { code: "chicken_cutlet", name: "雞排", price: 65, category: "炸雞" },
  { code: "popcorn_chicken_small", name: "雞米花小份", price: 60, category: "份量商品", fixedWeightGrams: 150 },
  { code: "popcorn_chicken_large", name: "雞米花大份", price: 100, category: "份量商品", fixedWeightGrams: 260 },
  { code: "sweet_potato_small", name: "地瓜小份", price: 30, category: "份量商品", fixedWeightGrams: 170 },
  { code: "sweet_potato_large", name: "地瓜大份", price: 50, category: "份量商品", fixedWeightGrams: 270 },
  { code: "triangle_bone", name: "三角骨", price: 50, category: "份量商品", fixedWeightGrams: 250 },
  { code: "squid_ball", name: "花枝丸", price: 30, category: "點心" },
  { code: "rice_blood", name: "米血", price: 15, category: "點心" },
  { code: "hot_dog", name: "熱狗", price: 30, category: "點心" },
  { code: "chicken_neck", name: "雞脖子", price: null, category: "點心", isPriceConfirmed: false },
  { code: "chicken_skin", name: "雞皮", price: 20, category: "點心" },
  { code: "oden_slice", name: "黑輪片", price: 30, category: "點心" },
  { code: "chicken_nuggets", name: "麥克雞塊", price: 30, category: "點心" },
]);

export function normalizeProduct(product = {}) {
  const price = Math.max(0, Math.round(Number(product.price) || 0));
  return {
    code: String(product.code || "").trim(),
    name: String(product.name || "").trim(),
    category: String(product.category || "其他").trim() || "其他",
    price,
    isPriceConfirmed: product.isPriceConfirmed !== false,
    fixedWeightGrams: product.fixedWeightGrams
      ? Math.max(0, Math.round(Number(product.fixedWeightGrams)))
      : null,
    isActive: product.isActive !== false,
  };
}

export function activeCatalog(products = []) {
  return products.map(normalizeProduct).filter((product) => product.code && product.name && product.isActive);
}

export function seasoningLabel(codes = []) {
  const labels = new Map(SEASONINGS.map((item) => [item.code, item.label]));
  const selected = [...new Set(codes)].map((code) => labels.get(code)).filter(Boolean);
  return selected.length ? selected.join("、") : "不加調味";
}
