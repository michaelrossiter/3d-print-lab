import jscad from '@jscad/modeling'

const { cuboid, cylinder, roundedCuboid } = jscad.primitives
const { subtract, union } = jscad.booleans
const { translate } = jscad.transforms
const { colorize } = jscad.colors
const { measureBoundingBox } = jscad.measurements

export function main() {
  // ✏️ Change the name! Each letter is a raised bump.
  // (JSCAD doesn't have built-in text, so we make a cool patterned tag instead)

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

  // Decorative raised dots spelling pattern (like braille-style name)
  // Makes a fun bumpy pattern — customize the positions!
  const dots = []
  const pattern = [
    [-20, 0], [-16, 4], [-16, -4], [-12, 0],  // Diamond 1
    [-4, 4], [-4, -4], [0, 4], [0, -4],         // Square
    [8, 0], [12, 4], [12, -4], [16, 0],          // Diamond 2
  ]

  for (const [x, y] of pattern) {
    dots.push(
      translate([x, y, 2.5],
        cylinder({ radius: 1.5, height: 1.5, segments: 16 })
      )
    )
  }

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

  const base = subtract(tag, hole)
  const nameTag = union(base, border, ...dots)

  // Sit flat on build plate
  const bounds = measureBoundingBox(nameTag)
  return colorize([0.31, 0.76, 0.97],
    translate([0, 0, -bounds[0][2]], nameTag)
  )
}

export const meta = {
  name: 'Name Tag',
  description: 'A keychain name tag with a decorative dot pattern!'
}
