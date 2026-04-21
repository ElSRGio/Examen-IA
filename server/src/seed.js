import { INVENTARIO_BASE } from './inventory.js'
import { Product } from './product.model.js'

export async function seedIfEmpty() {
  const count = await Product.countDocuments()

  if (count > 0) {
    return
  }

  await Product.insertMany(INVENTARIO_BASE)
  console.log(`[seed] Inventario inicial cargado: ${INVENTARIO_BASE.length} productos`)
}
