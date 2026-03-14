import jscad from '@jscad/modeling'

const { star } = jscad.primitives
const { extrudeLinear } = jscad.extrusions
const { subtract } = jscad.booleans
const { scale } = jscad.transforms
const { colorize } = jscad.colors

export function main() {
  // Star-shaped cookie cutter!
  // Change vertices for different stars (5 = classic, 6 = Star of David, etc.)
  const vertices = 5
  const outerRadius = 35
  const innerRadius = 15
  const height = 15
  const wallThickness = 1.2

  // Use JSCAD's built-in star primitive
  const starOuter = star({ vertices, outerRadius, innerRadius })
  const starInner = scale([
    (outerRadius - wallThickness) / outerRadius,
    (outerRadius - wallThickness) / outerRadius,
    1
  ], star({ vertices, outerRadius, innerRadius }))

  const outerWall = extrudeLinear({ height }, starOuter)
  const innerCut = extrudeLinear({ height: height + 2 }, starInner)

  const cutter = subtract(outerWall, innerCut)

  return colorize([0.94, 0.37, 0.56], cutter)
}

export const meta = {
  name: 'Cookie Cutter',
  description: 'A star-shaped cookie cutter! Change vertices for different shapes.'
}
