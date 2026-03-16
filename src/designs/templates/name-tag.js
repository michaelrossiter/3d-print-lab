import jscad from '@jscad/modeling'
import { textGeometry } from 'text-geometry'

const { cylinder, roundedCuboid } = jscad.primitives
const { subtract, union } = jscad.booleans
const { translate } = jscad.transforms
const { colorize } = jscad.colors
const { measureBoundingBox } = jscad.measurements

export function main() {
  // Change the name here!
  const NAME = 'MIKE'

  // Main tag body — rounded rectangle
  const tag = roundedCuboid({
    size: [60, 25, 4],
    roundRadius: 1.5,
    segments: 16
  })

  // Keyring hole
  const hole = translate([25, 0, 0],
    cylinder({ radius: 3, height: 6, segments: 24 })
  )

  // Border ridge
  const outerRim = roundedCuboid({
    size: [58, 23, 5],
    roundRadius: 1.5,
    segments: 16
  })
  const innerCut = roundedCuboid({
    size: [54, 19, 6],
    roundRadius: 1.5,
    segments: 16
  })
  const border = translate([0, 0, 0.5],
    subtract(outerRim, innerCut)
  )

  // Raised text on the tag face
  const nameText = translate([0, 0, 4],
    textGeometry(NAME, { size: 10, height: 1.5 })
  )

  const base = subtract(tag, hole)
  const nameTag = union(base, border, nameText)

  // Sit flat on build plate
  const bounds = measureBoundingBox(nameTag)
  return colorize([0.31, 0.76, 0.97],
    translate([0, 0, -bounds[0][2]], nameTag)
  )
}

export const meta = {
  name: 'Name Tag',
  description: 'A keychain name tag with raised text — edit the NAME variable!'
}
