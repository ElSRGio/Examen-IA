import { useEffect, useRef, useState } from 'react'
import { Html5QrcodeScanner } from 'html5-qrcode'
import { INVENTARIO } from './data'
import './App.css'

function App() {
  const catalogoPorId = useRef(new Map(INVENTARIO.map((item) => [item.id, item])))
  const [inventario, setInventario] = useState(INVENTARIO)
  const [carrito, setCarrito] = useState([])
  const [total, setTotal] = useState(0)
  const [codigoManual, setCodigoManual] = useState('')
  const [productoEnEspera, setProductoEnEspera] = useState(null)
  const [tiempoRestante, setTiempoRestante] = useState(3)
  const [mensaje, setMensaje] = useState('Escanea un codigo QR para iniciar la venta.')
  const inventarioRef = useRef(INVENTARIO)
  const productoEnEsperaRef = useRef(null)
  const scannerRef = useRef(null)
  const lastScanRef = useRef({ code: '', at: 0 })

  useEffect(() => {
    productoEnEsperaRef.current = productoEnEspera
  }, [productoEnEspera])

  const agregarAlCarrito = (producto) => {
    const precioFinal = producto.precio * (1 - producto.descuento)

    setCarrito((prev) => [
      ...prev,
      {
        ...producto,
        precioFinal,
        hora: new Date().toLocaleTimeString()
      }
    ])

    setTotal((prev) => prev + precioFinal)
  }

  useEffect(() => {
    const loadProducts = async () => {
      try {
        const response = await fetch('http://localhost:5000/api/products')

        if (!response.ok) {
          throw new Error('No se pudo leer el inventario remoto')
        }

        const data = await response.json()
        if (Array.isArray(data) && data.length > 0) {
          const enriched = data.map((item) => {
            const local = catalogoPorId.current.get(item.id)
            return {
              ...item,
              descripcion: item.descripcion || local?.descripcion || 'Sin descripcion disponible.',
              imagen: item.imagen || local?.imagen || '/img/producto-base.svg'
            }
          })

          setInventario(enriched)
          inventarioRef.current = enriched
          setMensaje('Inventario cargado desde backend.')
        }
      } catch {
        setInventario(INVENTARIO)
        inventarioRef.current = INVENTARIO
      }
    }

    loadProducts()
  }, [])

  useEffect(() => {
    const scanner = new Html5QrcodeScanner('reader', {
      fps: 10,
      aspectRatio: 1,
      qrbox: { width: 250, height: 250 }
    })
    scannerRef.current = scanner

    scanner.render(
      (decodedText) => {
        if (productoEnEsperaRef.current) {
          return
        }

        const now = Date.now()

        if (
          lastScanRef.current.code === decodedText &&
          now - lastScanRef.current.at < 1800
        ) {
          return
        }

        lastScanRef.current = { code: decodedText, at: now }

        const producto = inventarioRef.current.find((p) => p.id === decodedText)

        if (!producto) {
          setMensaje(`Codigo no registrado: ${decodedText}`)
          return
        }

        setProductoEnEspera(producto)
        setTiempoRestante(3)
        setMensaje(`${producto.nombre} detectado. Confirmacion automatica en 3 s.`)

        try {
          scanner.pause(true)
        } catch {
          scanner.pause()
        }
      },
      () => {
        // Silencia errores continuos de deteccion cuando no hay QR valido.
      }
    )

    return () => {
      scannerRef.current = null
      scanner
        .clear()
        .catch(() => {})
    }
  }, [])

  useEffect(() => {
    let timer = null

    if (productoEnEspera && tiempoRestante > 0) {
      timer = setTimeout(() => setTiempoRestante((prev) => prev - 1), 1000)
    } else if (productoEnEspera && tiempoRestante === 0) {
      confirmarProducto()
    }

    return () => {
      if (timer) {
        clearTimeout(timer)
      }
    }
  }, [productoEnEspera, tiempoRestante])

  useEffect(() => {
    const onKeyDown = (event) => {
      if (event.key === 'Enter' && productoEnEspera) {
        confirmarProducto()
      }
      if (event.key === 'Escape' && productoEnEspera) {
        cancelarConfirmacion()
      }
    }

    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [productoEnEspera])

  const reanudarScanner = () => {
    const scanner = scannerRef.current
    if (!scanner) {
      return
    }

    try {
      scanner.resume()
    } catch {
      // Si no permite resume en este estado, se ignora.
    }
  }

  const confirmarProducto = () => {
    if (!productoEnEspera) {
      return
    }

    agregarAlCarrito(productoEnEspera)
    setMensaje(`${productoEnEspera.nombre} agregado correctamente.`)
    setProductoEnEspera(null)
    setTiempoRestante(3)
    reanudarScanner()
  }

  const cancelarConfirmacion = () => {
    if (!productoEnEspera) {
      return
    }

    setMensaje(`Escaneo de ${productoEnEspera.nombre} cancelado.`)
    setProductoEnEspera(null)
    setTiempoRestante(3)
    reanudarScanner()
  }

  const agregarPorCodigoManual = () => {
    const code = codigoManual.trim().toUpperCase()
    if (!code) {
      return
    }

    const producto = inventario.find((p) => p.id === code)
    if (!producto) {
      setMensaje(`Codigo no registrado: ${code}`)
      return
    }

    agregarAlCarrito(producto)
    setMensaje(`${producto.nombre} agregado por captura manual.`)
    setCodigoManual('')
  }

  const nuevaVenta = () => {
    setCarrito([])
    setTotal(0)
    setProductoEnEspera(null)
    setTiempoRestante(3)
    setMensaje('Venta reiniciada. Escanea un codigo QR para iniciar.')
    reanudarScanner()
  }

  return (
    <main className="container">
      <header className="header">
        <h1>Sistema POS - Examen IA</h1>
        <p>{mensaje}</p>
      </header>

      <section className="dashboard">
        <div className="scanner-panel">
          <h2>Escaner QR</h2>
          <div id="reader"></div>
          <div className="manual-entry">
            <label htmlFor="manual">Plan B (captura manual)</label>
            <div>
              <input
                id="manual"
                type="text"
                placeholder="Ejemplo: P01"
                value={codigoManual}
                onChange={(event) => setCodigoManual(event.target.value)}
              />
              <button type="button" onClick={agregarPorCodigoManual}>
                Agregar
              </button>
            </div>
          </div>
        </div>

        <aside className="ticket">
          <h2>Resumen de Venta</h2>

          <ul>
            {carrito.map((item, index) => (
              <li key={`${item.id}-${index}`}>
                <span>
                  <strong>{item.nombre}</strong>
                  <small>{item.hora}</small>
                </span>
                <span>
                  $ {item.precioFinal.toFixed(2)}
                  {item.descuento > 0 && <em className="promo">(-45%)</em>}
                </span>
              </li>
            ))}
          </ul>

          <hr />
          <h3 className="total">Total: $ {total.toFixed(2)}</h3>
          <button type="button" onClick={nuevaVenta}>
            Nueva Venta
          </button>
        </aside>
      </section>

      {productoEnEspera && (
        <div className="confirm-modal" role="dialog" aria-modal="true" aria-label="Confirmacion de producto">
          <div className="confirm-card">
            <img src={productoEnEspera.imagen} alt={productoEnEspera.nombre} />
            <h3>{productoEnEspera.nombre}</h3>
            <p>{productoEnEspera.descripcion}</p>
            <p className="confirm-price">
              Precio final: $ {(productoEnEspera.precio * (1 - productoEnEspera.descuento)).toFixed(2)}
            </p>
            <p className="countdown">Auto-agregar en {tiempoRestante} s</p>
            <div className="confirm-actions">
              <button type="button" onClick={confirmarProducto}>
                Confirmar (Enter)
              </button>
              <button type="button" className="ghost" onClick={cancelarConfirmacion}>
                Cancelar (Esc)
              </button>
            </div>
          </div>
        </div>
      )}

      <section className="inventario">
        <h2>Inventario Base (15 productos)</h2>
        <div className="chips">
          {inventario.map((producto) => (
            <article key={producto.id} className="chip">
              <span>{producto.id}</span>
              <strong>{producto.nombre}</strong>
              <small>
                $ {producto.precio.toFixed(2)}
                {producto.descuento > 0 ? ' | Desc: 45%' : ' | Sin desc.'}
              </small>
            </article>
          ))}
        </div>
      </section>
    </main>
  )
}

export default App
