import { createPreview } from './preview.js'
import { createEditor } from './editor.js'
import { loadDesign, runCode, setModelUpdateCallback, setStatusCallback, exportCurrentDesign } from './design-loader.js'
import * as modeling from '@jscad/modeling'
import { createTextGeometry } from './text-geometry.js'
import './style.css'

// Expose JSCAD globally for in-editor code evaluation
window.jscad = modeling

async function init() {
  // Load font and set up textGeometry global
  try {
    const fontResp = await fetch('/fonts/Inter-Bold.ttf')
    const fontBuffer = await fontResp.arrayBuffer()
    window.textGeometry = createTextGeometry(fontBuffer, modeling)
  } catch (e) {
    console.warn('Failed to load text font:', e)
  }

  // Three.js preview
  const canvas = document.getElementById('preview-canvas')
  const preview = createPreview(canvas)

  // CodeMirror editor
  const editorContainer = document.getElementById('editor-panel')
  const editor = createEditor(editorContainer)

  // Status bar
  const statusBar = document.getElementById('status-bar')
  setStatusCallback((msg, isError) => {
    statusBar.textContent = msg
    statusBar.classList.toggle('error', isError)
  })

  // Model update callback
  setModelUpdateCallback((threeObject, meta) => {
    preview.setModel(threeObject)
  })

  // Load design source into editor
  async function refreshEditor() {
    try {
      const resp = await fetch('/raw/src/designs/current-design.js')
      const code = await resp.text()
      editor.setCode(code)
    } catch (e) {
      // Editor fetch failed, not critical
    }
  }

  // Initial load
  await refreshEditor()
  await loadDesign()

  // Run Code button — evaluates editor content
  document.getElementById('btn-run').addEventListener('click', async () => {
    const code = editor.getCode()
    await runCode(code)
  })

  // Download STL button
  document.getElementById('btn-download').addEventListener('click', () => {
    exportCurrentDesign('my-design.stl')
  })

  // Template picker
  document.getElementById('template-picker').addEventListener('change', async (e) => {
    if (!e.target.value) return
    try {
      const resp = await fetch(`/raw/src/designs/templates/${e.target.value}.js`)
      const code = await resp.text()
      editor.setCode(code)
      await runCode(code)
      e.target.value = '' // Reset dropdown
    } catch (err) {
      statusBar.textContent = `Failed to load template: ${err.message}`
      statusBar.classList.add('error')
    }
  })

  // HMR: also refresh editor when design file changes
  if (import.meta.hot) {
    import.meta.hot.on('design-update', async () => {
      await refreshEditor()
    })
  }
}

init()
