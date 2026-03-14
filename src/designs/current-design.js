import jscad from '@jscad/modeling'

const { subtract, union } = jscad.booleans
const { colorize } = jscad.colors
const { cuboid, cylinder, sphere } = jscad.primitives
const { translate } = jscad.transforms
const { measureBoundingBox } = jscad.measurements

export function main() {
  // A friendly little house to welcome you to the Print Lab!

  // Base
  const base = colorize([0.85, 0.65, 0.4],
    cuboid({ size: [30, 30, 20] })
  )

  // Roof (pyramid-ish using a flattened sphere)
  const roof = colorize([0.8, 0.2, 0.2],
    translate([0, 0, 14],
      cylinder({ startRadius: 22, endRadius: 0, height: 14, segments: 4 })
    )
  )

  // Door
  const door = colorize([0.4, 0.25, 0.1],
    translate([0, -15.1, -3],
      cuboid({ size: [8, 1, 12] })
    )
  )

  // Windows
  const window1 = colorize([0.6, 0.85, 1],
    translate([-8, -15.1, 3],
      cuboid({ size: [5, 1, 5] })
    )
  )
  const window2 = colorize([0.6, 0.85, 1],
    translate([8, -15.1, 3],
      cuboid({ size: [5, 1, 5] })
    )
  )

  // Chimney
  const chimney = colorize([0.6, 0.3, 0.2],
    translate([10, 0, 18],
      cuboid({ size: [5, 5, 10] })
    )
  )

  const house = union(base, roof, door, window1, window2, chimney)

  // Sit flat on build plate
  const bounds = measureBoundingBox(house)
  return translate([0, 0, -bounds[0][2]], house)
}

export const meta = {
  name: 'Welcome House',
  description: 'A friendly little house — edit this code or load a template to start designing!'
}
