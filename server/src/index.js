import cors from 'cors'
import express from 'express'
import mongoose from 'mongoose'
import { Product } from './product.model.js'
import { seedIfEmpty } from './seed.js'

const app = express()
const PORT = process.env.PORT || 5000
const MONGO_URI = process.env.MONGO_URI || 'mongodb://localhost:27017/pos_db'
const CORS_ORIGIN = process.env.CORS_ORIGIN || '*'

app.use(cors({ origin: CORS_ORIGIN === '*' ? true : CORS_ORIGIN }))
app.use(express.json())

app.get('/api/health', (_req, res) => {
  res.json({ ok: true, service: 'pos-backend' })
})

app.get('/api/products', async (_req, res, next) => {
  try {
    const products = await Product.find().sort({ id: 1 })
    res.json(products)
  } catch (error) {
    next(error)
  }
})

app.get('/api/products/:id', async (req, res, next) => {
  try {
    const product = await Product.findOne({ id: req.params.id.toUpperCase() })
    if (!product) {
      return res.status(404).json({ message: 'Producto no encontrado' })
    }

    return res.json(product)
  } catch (error) {
    return next(error)
  }
})

app.post('/api/products', async (req, res, next) => {
  try {
    const payload = sanitizePayload(req.body)
    const exists = await Product.findOne({ id: payload.id })

    if (exists) {
      return res.status(409).json({ message: 'El ID ya existe' })
    }

    const created = await Product.create(payload)
    return res.status(201).json(created)
  } catch (error) {
    return next(error)
  }
})

app.put('/api/products/:id', async (req, res, next) => {
  try {
    const payload = sanitizePayload(req.body)
    const targetId = req.params.id.toUpperCase()

    if (payload.id !== targetId) {
      return res.status(400).json({ message: 'El ID del body debe coincidir con la ruta' })
    }

    const updated = await Product.findOneAndUpdate({ id: targetId }, payload, {
      new: true,
      runValidators: true
    })

    if (!updated) {
      return res.status(404).json({ message: 'Producto no encontrado' })
    }

    return res.json(updated)
  } catch (error) {
    return next(error)
  }
})

app.delete('/api/products/:id', async (req, res, next) => {
  try {
    const removed = await Product.findOneAndDelete({ id: req.params.id.toUpperCase() })

    if (!removed) {
      return res.status(404).json({ message: 'Producto no encontrado' })
    }

    return res.status(204).send()
  } catch (error) {
    return next(error)
  }
})

app.get('/api/pricing/:id', async (req, res, next) => {
  try {
    const product = await Product.findOne({ id: req.params.id.toUpperCase() })

    if (!product) {
      return res.status(404).json({ message: 'Producto no encontrado' })
    }

    const precioFinal = product.precio * (1 - product.descuento)
    const ahorro = product.precio - precioFinal

    return res.json({
      id: product.id,
      nombre: product.nombre,
      precioOriginal: product.precio,
      descuento: product.descuento,
      precioFinal,
      ahorro
    })
  } catch (error) {
    return next(error)
  }
})

app.use((error, _req, res, _next) => {
  if (error?.name === 'ValidationError') {
    return res.status(400).json({
      message: 'Datos invalidos',
      details: Object.values(error.errors).map((item) => item.message)
    })
  }

  if (error?.status) {
    return res.status(error.status).json({ message: error.message })
  }

  console.error(error)
  return res.status(500).json({ message: 'Error interno del servidor' })
})

function sanitizePayload(body) {
  const id = String(body.id || '').trim().toUpperCase()
  const nombre = String(body.nombre || '').trim()
  const descripcion = String(body.descripcion || '').trim()
  const imagen = String(body.imagen || '').trim()
  const precio = Number(body.precio)
  const descuento = Number(body.descuento)

  if (!/^P\d{2,}$/.test(id)) {
    const error = new Error('ID invalido. Debe seguir el formato PNN')
    error.status = 400
    throw error
  }

  if (!Number.isFinite(precio) || precio < 0) {
    const error = new Error('Precio invalido')
    error.status = 400
    throw error
  }

  if (!Number.isFinite(descuento) || descuento < 0 || descuento > 0.95) {
    const error = new Error('Descuento invalido')
    error.status = 400
    throw error
  }

  return {
    id,
    nombre,
    descripcion: descripcion || 'Sin descripcion disponible.',
    imagen: imagen || '/img/producto-base.svg',
    precio,
    descuento
  }
}

async function start() {
  await mongoose.connect(MONGO_URI)
  console.log('[db] Mongo conectado')

  await seedIfEmpty()

  app.listen(PORT, () => {
    console.log(`[api] POS backend en puerto ${PORT}`)
  })
}

start().catch((error) => {
  console.error('[startup] Error al iniciar backend', error)
  process.exit(1)
})
