import { jscadToThree } from './converter.js'
import { downloadSTL } from './exporter.js'
import { measurements } from '@jscad/modeling'

let currentGeometry = null
let onModelUpdate = null
let onStatusUpdate = null

export function setModelUpdateCallback(callback) {
  onModelUpdate = callback
}

export function setStatusCallback(callback) {
  onStatusUpdate = callback
}

function setStatus(msg, isError = false) {
  if (onStatusUpdate) onStatusUpdate(msg, isError)
}

export async function loadDesign() {
  try {
    const mod = await import(/* @vite-ignore */ `./designs/current-design.js?t=${Date.now()}`)

    if (typeof mod.main !== 'function') {
      throw new Error('Design file must export a main() function')
    }

    currentGeometry = mod.main()
    const threeObject = jscadToThree(currentGeometry)

    // Measure bounding box for size display and validation
    const bounds = measurements.measureBoundingBox(
      Array.isArray(currentGeometry) ? currentGeometry[0] : currentGeometry
    )
    const size = [
      Math.abs(bounds[1][0] - bounds[0][0]),
      Math.abs(bounds[1][1] - bounds[0][1]),
      Math.abs(bounds[1][2] - bounds[0][2])
    ]

    const sizeStr = `${size[0].toFixed(1)} × ${size[1].toFixed(1)} × ${size[2].toFixed(1)} mm`

    if (size[0] > 180 || size[1] > 180 || size[2] > 180) {
      setStatus(`⚠ Too big for A1 Mini! Size: ${sizeStr}`, true)
    } else {
      const name = mod.meta?.name || 'Design'
      setStatus(`${name} — ${sizeStr}`)
    }

    if (onModelUpdate) {
      onModelUpdate(threeObject, mod.meta || {})
    }

    return { success: true }
  } catch (err) {
    console.error('Design error:', err)
    setStatus(`Error: ${err.message}`, true)
    return { success: false, error: err.message }
  }
}

export async function runCode(code) {
  try {
    // Replace JSCAD imports with window.jscad references for in-editor eval
    // Handles both raw imports and Vite-transformed imports
    const processed = code
      .replace(/import\s+\w+\s+from\s+["'][^"']*jscad[_/]modeling[^"']*["']\s*;?\n?/g, 'const jscad = window.jscad;\n')
      .replace(/import\s*\{[^}]+\}\s*from\s+['"][^'"]*jscad[^'"]*['"]\s*;?\n?/g, '')
      .replace(/import\s*\{\s*textGeometry\s*\}\s*from\s+['"][^'"]*text-geometry[^'"]*['"]\s*;?\n?/g,
        'const textGeometry = window.textGeometry;\n')

    const blob = new Blob([processed], { type: 'text/javascript' })
    const url = URL.createObjectURL(blob)
    try {
      const mod = await import(/* @vite-ignore */ url)
      if (typeof mod.main !== 'function') {
        throw new Error('Code must export a main() function')
      }
      currentGeometry = mod.main()
      const threeObject = jscadToThree(currentGeometry)

      const bounds = measurements.measureBoundingBox(
        Array.isArray(currentGeometry) ? currentGeometry[0] : currentGeometry
      )
      const size = [
        Math.abs(bounds[1][0] - bounds[0][0]),
        Math.abs(bounds[1][1] - bounds[0][1]),
        Math.abs(bounds[1][2] - bounds[0][2])
      ]
      const sizeStr = `${size[0].toFixed(1)} × ${size[1].toFixed(1)} × ${size[2].toFixed(1)} mm`

      if (size[0] > 180 || size[1] > 180 || size[2] > 180) {
        setStatus(`⚠ Too big for A1 Mini! Size: ${sizeStr}`, true)
      } else {
        setStatus(`Updated — ${sizeStr}`)
      }

      if (onModelUpdate) {
        onModelUpdate(threeObject, mod.meta || {})
      }
      return { success: true }
    } finally {
      URL.revokeObjectURL(url)
    }
  } catch (err) {
    console.error('Run error:', err)
    setStatus(`Error: ${err.message}`, true)
    return { success: false, error: err.message }
  }
}

export function exportCurrentDesign(filename) {
  if (!currentGeometry) {
    setStatus('No design loaded yet!', true)
    return
  }
  downloadSTL(currentGeometry, filename)
  setStatus('STL downloaded! Open it in Bambu Studio.')
}

// Vite HMR: auto-reload when design files change
if (import.meta.hot) {
  import.meta.hot.on('design-update', () => {
    console.log('[3D Print Lab] Design file changed, reloading...')
    loadDesign()
  })
}
