import stlSerializer from '@jscad/stl-serializer'

export function downloadSTL(jscadGeometry, filename = 'my-design.stl') {
  const geoms = Array.isArray(jscadGeometry) ? jscadGeometry : [jscadGeometry]
  const rawData = stlSerializer.serialize({ binary: true }, ...geoms)
  const blob = new Blob(rawData, { type: 'application/octet-stream' })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = filename
  link.click()
  URL.revokeObjectURL(url)
}
