
import jscad from '@jscad/modeling'
import { textGeometry } from 'text-geometry'

const { union } = jscad.booleans
const { translate } = jscad.transforms
const { measureBoundingBox } = jscad.measurements

export function main() {
  const text40 = textGeometry('40', { size: 20, height: 5, align: 'center' })
  const textPOP = translate([0, -25, 0],
    textGeometry('POP', { size: 15, height: 5, align: 'center' })
  )

  const result = union(text40, textPOP)
  const bounds = measureBoundingBox(result)
  return translate([0, 0, -bounds[0][2]], result)
}

export const meta = {
  name: 'Text Debug',
  description: 'Isolated text geometry test - winding fix'
}
