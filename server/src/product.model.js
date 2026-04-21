import mongoose from 'mongoose'

const productSchema = new mongoose.Schema(
  {
    id: { type: String, required: true, unique: true, trim: true },
    nombre: { type: String, required: true, trim: true },
    descripcion: { type: String, trim: true, default: 'Sin descripcion disponible.' },
    imagen: { type: String, trim: true, default: '/img/producto-base.svg' },
    precio: { type: Number, required: true, min: 0 },
    descuento: { type: Number, required: true, min: 0, max: 0.95 }
  },
  {
    timestamps: true,
    versionKey: false
  }
)

export const Product = mongoose.model('Product', productSchema)
