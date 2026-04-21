import { useEffect, useMemo, useRef, useState } from 'react'
import { Html5QrcodeScanner } from 'html5-qrcode'
import { QRCodeSVG } from 'qrcode.react'
import { INVENTARIO } from './data'
import './App.css'

const EMPTY_FORM = {
  id: '',
  nombre: '',
  descripcion: '',
  precio: '',
  descuento: '',
  imagen: ''
}

// === DETERMINAR LA IP DEL BACKEND AUTOMÁTICAMENTE ===
// Si lo abres en localhost, usa localhost. Si lo abres con la IP de la Raspberry, usa esa IP.
const API_URL = `http://${window.location.hostname}:5000/api/products`;

function normalizeDiscount(value) {
  if (typeof value === 'boolean') return value

  const raw = String(value ?? '').trim().toLowerCase()
  if (raw === 'true') return true
  if (raw === 'false' || raw === '') return false

  const parsed = Number(raw)
  if (Number.isFinite(parsed)) {
    if (parsed <= 0) return false
    if (parsed > 1) return parsed / 100
    return parsed
  }

  return false
}

function hasDiscount(producto) {
  if (typeof producto.descuento === 'boolean') return producto.descuento
  return Number(producto.descuento) > 0
}

function precioFinalProducto(producto) {
  return hasDiscount(producto) ? Number(producto.precio) * 0.55 : Number(producto.precio)
}

function formatMoney(value) {
  return Number(value).toFixed(2)
}

function App() {
  const [activeTab, setActiveTab] = useState('pos')
  const [inventario, setInventario] = useState(INVENTARIO)
  const [carrito, setCarrito] = useState([])
  const [mensaje, setMensaje] = useState('Escanea un QR para iniciar la venta.')
  const [codigoManual, setCodigoManual] = useState('')

  const [productoEnEspera, setProductoEnEspera] = useState(null)
  const [tiempoRestante, setTiempoRestante] = useState(3)

  const [formData, setFormData] = useState(EMPTY_FORM)
  const [editingId, setEditingId] = useState(null)

  const [selectedQrIds, setSelectedQrIds] = useState([])
  const [isPrintMode, setIsPrintMode] = useState(false)

  const scannerRef = useRef(null)
  const inventarioRef = useRef(INVENTARIO)
  const productoEnEsperaRef = useRef(null)
  const lastScanRef = useRef({ code: '', at: 0 })

  const total = useMemo(
    () => carrito.reduce((acc, item) => acc + Number(item.precioFinal), 0),
    [carrito]
  )

  // === CARGAR DATOS DESDE MONGODB AL INICIAR ===
  useEffect(() => {
    fetch(API_URL)
      .then(res => res.json())
      .then(data => {
        if (Array.isArray(data) && data.length > 0) {
          setInventario(data);
        }
      })
      .catch(err => console.error("Error al cargar la BD de Mongo:", err));
  }, []);
  
  useEffect(() => {
    inventarioRef.current = inventario
  }, [inventario])

  useEffect(() => {
    productoEnEsperaRef.current = productoEnEspera
  }, [productoEnEspera])

  useEffect(() => {
    setSelectedQrIds((prev) => prev.filter((id) => inventario.some((item) => item.id === id)))
  }, [inventario])

  useEffect(() => {
    const onAfterPrint = () => setIsPrintMode(false)
    window.addEventListener('afterprint', onAfterPrint)
    return () => window.removeEventListener('afterprint', onAfterPrint)
  }, [])

  const addProductoToCarrito = (producto) => {
    const precioFinal = precioFinalProducto(producto)
    const ahorro = Number(producto.precio) - precioFinal

    setCarrito((prev) => [
      ...prev,
      {
        ...producto,
        precioFinal,
        ahorro,
        hora: new Date().toLocaleTimeString()
      }
    ])
  }

  const confirmarProducto = () => {
    if (!productoEnEsperaRef.current) return
    const producto = productoEnEsperaRef.current
    addProductoToCarrito(producto)
    setProductoEnEspera(null)
    setTiempoRestante(3)
    setMensaje(`${producto.nombre} agregado al carrito.`)
  }

  const cancelarProductoEnEspera = () => {
    if (!productoEnEsperaRef.current) return
    const producto = productoEnEsperaRef.current
    setProductoEnEspera(null)
    setTiempoRestante(3)
    setMensaje(`Escaneo cancelado para ${producto.nombre}.`)
  }

  const handleDetectedCode = (rawCode) => {
    if (productoEnEsperaRef.current) return

    const code = String(rawCode || '').trim().toUpperCase()
    if (!code) return

    const now = Date.now()
    if (lastScanRef.current.code === code && now - lastScanRef.current.at < 2500) {
      return
    }

    const producto = inventarioRef.current.find((item) => item.id === code)

    if (!producto) {
      setMensaje(`Código no registrado: ${code}`)
      return
    }

    lastScanRef.current = { code, at: now }
    setProductoEnEspera(producto)
    setTiempoRestante(3)
    setMensaje(`${producto.nombre} detectado. Confirmación en 3 s.`)
  }

  useEffect(() => {
    if (activeTab !== 'pos') return;

    const scanner = new Html5QrcodeScanner('reader', {
      fps: 10,
      aspectRatio: 1,
      qrbox: { width: 250, height: 250 }
    });

    scannerRef.current = scanner;

    scanner.render(
      (decodedText) => handleDetectedCode(decodedText),
      () => {} 
    );

    return () => {
      if (scannerRef.current) {
        scannerRef.current.clear().catch(error => {
          console.error("Error limpiando el scanner:", error);
        });
        scannerRef.current = null;
      }
    };
  }, [activeTab]);

  useEffect(() => {
    let timer = null
    if (productoEnEspera && tiempoRestante > 0) {
      timer = setTimeout(() => { setTiempoRestante((prev) => prev - 1) }, 1000)
    }
    if (productoEnEspera && tiempoRestante === 0) { confirmarProducto() }
    return () => { if (timer) clearTimeout(timer) }
  }, [productoEnEspera, tiempoRestante])

  useEffect(() => {
    const onKeyDown = (event) => {
      if (!productoEnEsperaRef.current) return
      if (event.key === 'Enter') { event.preventDefault(); confirmarProducto() }
      if (event.key === 'Escape') { event.preventDefault(); cancelarProductoEnEspera() }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [])

  useEffect(() => {
    if (activeTab !== 'pos' && productoEnEspera) {
      setProductoEnEspera(null)
      setTiempoRestante(3)
    }
  }, [activeTab, productoEnEspera])

  const agregarPorCodigoManual = () => {
    handleDetectedCode(codigoManual)
    setCodigoManual('')
  }

  const resetVenta = () => {
    setCarrito([])
    setProductoEnEspera(null)
    setTiempoRestante(3)
    setMensaje('Venta reiniciada. Escanea un QR para iniciar la venta.')
  }

  const resetForm = () => {
    setFormData(EMPTY_FORM)
    setEditingId(null)
  }

  const handleChangeForm = (event) => {
    const { name, value } = event.target
    setFormData((prev) => ({ ...prev, [name]: value }))
  }

  const handleImageFileChange = (event) => {
    const file = event.target.files?.[0]
    if (!file) return

    const reader = new FileReader()
    reader.onload = () => {
      const result = typeof reader.result === 'string' ? reader.result : ''
      setFormData((prev) => ({ ...prev, imagen: result }))
    }
    reader.readAsDataURL(file)
  }

  // === GUARDAR EN MONGODB (POST / PUT) ===
  const handleSubmitProduct = async (event) => {
    event.preventDefault()

    const id = formData.id.trim().toUpperCase()
    const nombre = formData.nombre.trim()
    const descripcion = formData.descripcion.trim()
    const precio = Number(formData.precio)
    const descuento = normalizeDiscount(formData.descuento)
    const imagen = formData.imagen || '/img/producto-base.svg'

    if (!id || !nombre || !Number.isFinite(precio)) {
      setMensaje('Completa los campos obligatorios.')
      return
    }

    const nextProduct = { id, nombre, descripcion, precio, descuento, imagen }

    try {
      const url = editingId ? `${API_URL}/${editingId}` : API_URL;
      const method = editingId ? 'PUT' : 'POST';

      const response = await fetch(url, {
        method: method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(nextProduct)
      });

      if (!response.ok) {
        const errorData = await response.json();
        setMensaje(`Error del servidor: ${errorData.message}`);
        return;
      }

      const savedProduct = await response.json();

      if (editingId) {
        setInventario((prev) => prev.map((item) => (item.id === editingId ? savedProduct : item)))
        setMensaje(`Producto ${id} actualizado en Mongo.`)
      } else {
        setInventario((prev) => [...prev, savedProduct])
        setMensaje(`Producto ${id} guardado en Mongo.`)
      }

      resetForm()
    } catch (error) {
      console.error("Error de red:", error);
      setMensaje('Error de red. Verifica que los contenedores estén corriendo.');
    }
  }

  const handleEdit = (producto) => {
    setEditingId(producto.id)
    setFormData({
      id: producto.id,
      nombre: producto.nombre,
      descripcion: producto.descripcion || '',
      precio: String(producto.precio),
      descuento: String(producto.descuento ?? ''),
      imagen: producto.imagen || ''
    })
  }

  // === ELIMINAR DE MONGODB (DELETE) ===
  const handleDelete = async (id) => {
    try {
      const response = await fetch(`${API_URL}/${id}`, {
        method: 'DELETE'
      });

      if (!response.ok) {
        setMensaje(`Error al eliminar de Mongo.`);
        return;
      }

      setInventario((prev) => prev.filter((item) => item.id !== id))
      setCarrito((prev) => prev.filter((item) => item.id !== id))
      if (editingId === id) resetForm()

      setMensaje(`Producto ${id} eliminado de Mongo.`)
    } catch (error) {
      console.error("Error de red:", error);
      setMensaje('Error de red al intentar eliminar.');
    }
  }

  const toggleQrSelection = (id) => {
    setSelectedQrIds((prev) =>
      prev.includes(id) ? prev.filter((currentId) => currentId !== id) : [...prev, id]
    )
  }

  const selectAllQrs = () => setSelectedQrIds(inventario.map((item) => item.id))
  const deselectAllQrs = () => setSelectedQrIds([])

  const printSelectedQrs = () => {
    if (selectedQrIds.length === 0) {
      setMensaje('Selecciona al menos un producto para imprimir QRs.')
      return
    }
    setIsPrintMode(true)
    setTimeout(() => { window.print() }, 80)
  }

  return (
    <main className={`app-shell ${isPrintMode ? 'printing-qrs' : ''}`}>
      <header className="app-header">
        <h1>Sistema POS SPA</h1>
        <p>{mensaje}</p>
      </header>

      <nav className="tabs" aria-label="Secciones principales">
        <button
          type="button"
          className={`tab-button ${activeTab === 'pos' ? 'is-active' : ''}`}
          onClick={() => setActiveTab('pos')}
        >
          Vista POS
        </button>
        <button
          type="button"
          className={`tab-button ${activeTab === 'gestion' ? 'is-active' : ''}`}
          onClick={() => setActiveTab('gestion')}
        >
          Vista de Gestion
        </button>
        <button
          type="button"
          className={`tab-button ${activeTab === 'qrs' ? 'is-active' : ''}`}
          onClick={() => setActiveTab('qrs')}
        >
          Impresion de QRs
        </button>
      </nav>

      <section className="tab-content">
        {activeTab === 'pos' && (
          <div className="pos-view">
            <article className="scanner-panel">
              <h2>Terminal de Escaneo</h2>
              <div id="reader" className="qr-reader" />

              <div className="manual-entry">
                <label htmlFor="manual-code">Ingreso manual (Plan B)</label>
                <div className="manual-entry-actions">
                  <input
                    id="manual-code"
                    type="text"
                    value={codigoManual}
                    onChange={(event) => setCodigoManual(event.target.value)}
                    placeholder="Ejemplo: P01"
                  />
                  <button type="button" onClick={agregarPorCodigoManual}>
                    Detectar
                  </button>
                </div>
              </div>
            </article>

            <article className="cart-panel">
              <h2>Carrito de compras</h2>
              <ul className="cart-list">
                {carrito.map((item, index) => (
                  <li key={`${item.id}-${index}`} className="cart-item">
                    <div>
                      <strong>{item.nombre}</strong>
                      <small>{item.hora}</small>
                    </div>
                    <div>
                      <span>$ {formatMoney(item.precioFinal)}</span>
                      {hasDiscount(item) && <small>Desc. 45%</small>}
                    </div>
                  </li>
                ))}
              </ul>

              <div className="cart-total">
                <h3>Total: $ {formatMoney(total)}</h3>
                <button type="button" onClick={resetVenta}>
                  Reiniciar venta
                </button>
              </div>
            </article>
          </div>
        )}

        {activeTab === 'gestion' && (
          <div className="management-view">
            <section className="crud-form-panel">
              <h2>{editingId ? 'Editar producto' : 'Agregar producto'}</h2>
              <form className="crud-form" onSubmit={handleSubmitProduct}>
                <input
                  name="id"
                  value={formData.id}
                  onChange={handleChangeForm}
                  placeholder="ID (P16)"
                  disabled={Boolean(editingId)}
                  required
                />
                <input
                  name="nombre"
                  value={formData.nombre}
                  onChange={handleChangeForm}
                  placeholder="Nombre"
                  required
                />
                <textarea
                  name="descripcion"
                  value={formData.descripcion}
                  onChange={handleChangeForm}
                  placeholder="Descripcion"
                  rows={3}
                />
                <input
                  name="precio"
                  type="number"
                  step="0.01"
                  value={formData.precio}
                  onChange={handleChangeForm}
                  placeholder="Precio"
                  required
                />
                <input
                  name="descuento"
                  value={formData.descuento}
                  onChange={handleChangeForm}
                  placeholder="Descuento (0.45, true, false)"
                />

                <div className="file-input-wrap">
                  <label htmlFor="imagen-file">Imagen del producto</label>
                  <input
                    id="imagen-file"
                    type="file"
                    accept="image/*"
                    onChange={handleImageFileChange}
                  />
                </div>

                {formData.imagen && (
                  <div className="image-preview-wrap">
                    <p>Vista previa de imagen:</p>
                    <img className="image-preview" src={formData.imagen} alt="Vista previa" />
                  </div>
                )}

                <div className="crud-form-actions">
                  <button type="submit">
                    {editingId ? 'Guardar cambios' : 'Agregar producto'}
                  </button>
                  <button type="button" onClick={resetForm}>
                    Limpiar
                  </button>
                </div>
              </form>
            </section>

            <section className="crud-table-panel">
              <h2>Inventario actual</h2>
              <div className="inventory-grid">
                {inventario.map((item) => (
                  <article key={item.id} className="inventory-card">
                    <img src={item.imagen || '/img/producto-base.svg'} alt={item.nombre} />
                    <h3>
                      {item.id} - {item.nombre}
                    </h3>
                    <p>{item.descripcion || 'Sin descripcion disponible.'}</p>
                    <p>Precio: $ {formatMoney(item.precio)}</p>
                    <p>
                      Precio final: $ {formatMoney(precioFinalProducto(item))}
                      {hasDiscount(item) ? ' (45%)' : ' (sin descuento)'}
                    </p>
                    <div className="inventory-card-actions">
                      <button type="button" onClick={() => handleEdit(item)}>
                        Editar
                      </button>
                      <button type="button" onClick={() => handleDelete(item.id)}>
                        Eliminar
                      </button>
                    </div>
                  </article>
                ))}
              </div>
            </section>
          </div>
        )}

        {activeTab === 'qrs' && (
          <div className="qr-print-view">
            <section className="qr-controls no-print">
              <button type="button" onClick={selectAllQrs}>
                Seleccionar Todos
              </button>
              <button type="button" onClick={deselectAllQrs}>
                Deseleccionar Todos
              </button>
              <button type="button" className="primary" onClick={printSelectedQrs}>
                Imprimir Seleccionados
              </button>
            </section>

            <section className="qr-grid">
              {inventario.map((item) => {
                const isSelected = selectedQrIds.includes(item.id)
                return (
                  <article
                    key={item.id}
                    className={`qr-card ${isSelected ? 'is-selected' : ''}`}
                  >
                    <label className="qr-check no-print">
                      <input
                        type="checkbox"
                        checked={isSelected}
                        onChange={() => toggleQrSelection(item.id)}
                      />
                      Seleccionar
                    </label>
                    <h3>{item.nombre}</h3>
                    <p>{item.id}</p>
                    <QRCodeSVG value={item.id} size={150} includeMargin />
                  </article>
                )
              })}
            </section>
          </div>
        )}
      </section>

      {productoEnEspera && (
        <div className="modal-overlay" role="dialog" aria-modal="true">
          <div className="product-preview">
            <img
              src={productoEnEspera.imagen || '/img/producto-base.svg'}
              alt={productoEnEspera.nombre}
            />
            <h3>{productoEnEspera.nombre}</h3>
            <p>{productoEnEspera.descripcion || 'Sin descripcion disponible.'}</p>

            <div className="product-preview-pricing">
              <p>Precio original: $ {formatMoney(productoEnEspera.precio)}</p>
              <p>Precio final: $ {formatMoney(precioFinalProducto(productoEnEspera))}</p>
            </div>

            <p className="modal-countdown">Auto agregar en {tiempoRestante} s</p>

            <div className="modal-actions">
              <button type="button" onClick={confirmarProducto}>
                Confirmar (Enter)
              </button>
              <button type="button" onClick={cancelarProductoEnEspera}>
                Cancelar (Esc)
              </button>
            </div>
          </div>
        </div>
      )}
    </main>
  )
}

export default App