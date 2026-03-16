// Browser shim: re-exports the pre-initialized window.textGeometry global.
// Vite resolves 'text-geometry' imports in design files to this module.
export function textGeometry(text, options) {
  if (!window.textGeometry) {
    throw new Error('textGeometry not initialized — font still loading')
  }
  return window.textGeometry(text, options)
}
