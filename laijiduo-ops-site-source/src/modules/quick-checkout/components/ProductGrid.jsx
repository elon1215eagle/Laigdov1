export function ProductGrid({ onAdd, products }) {
  const categories = [...new Set(products.map((product) => product.category))];
  return (
    <div className="qc-product-groups">
      {categories.map((category) => (
        <section className="qc-product-group" key={category}>
          <h2>{category}</h2>
          <div className="qc-product-grid">
            {products.filter((product) => product.category === category).map((product) => (
              <button className="qc-product-button" disabled={!product.isPriceConfirmed} key={product.code} onClick={() => onAdd(product.code)} type="button">
                <strong>{product.name}</strong>
                {product.fixedWeightGrams && <span>{product.fixedWeightGrams} 克</span>}
                <em>{product.isPriceConfirmed ? `NT$${product.price}` : "待設定價格"}</em>
              </button>
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}
