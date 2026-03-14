import jscad from '@jscad/modeling'

const { sphere, cylinder, ellipsoid } = jscad.primitives
const { union, subtract } = jscad.booleans
const { translate, scale, rotate } = jscad.transforms
const { colorize } = jscad.colors
const { measureBoundingBox } = jscad.measurements

export function main() {
  // Body — a big squished sphere
  const body = scale([1, 0.85, 0.9],
    sphere({ radius: 20, segments: 32 })
  )

  // Head — smaller sphere on top
  const head = translate([0, 0, 22],
    sphere({ radius: 13, segments: 32 })
  )

  // Beak — orange cone-ish shape
  const beak = translate([0, -14, 23],
    scale([1, 1.8, 0.6],
      sphere({ radius: 5, segments: 16 })
    )
  )

  // Eyes — small spheres
  const eyeL = translate([-5, -10, 28],
    sphere({ radius: 2, segments: 16 })
  )
  const eyeR = translate([5, -10, 28],
    sphere({ radius: 2, segments: 16 })
  )

  // Tail — little bump on the back
  const tail = translate([0, 14, 10],
    scale([0.6, 1.2, 1],
      sphere({ radius: 6, segments: 16 })
    )
  )

  // Flat bottom so it sits on the build plate
  const cutter = translate([0, 0, -25],
    jscad.primitives.cuboid({ size: [60, 60, 20] })
  )

  const duck = subtract(
    union(body, head, beak, tail),
    cutter
  )

  const eyes = union(eyeL, eyeR)

  // Sit flat on build plate
  const bounds = measureBoundingBox(duck)
  const liftZ = -bounds[0][2]

  return [
    colorize([1, 0.85, 0], translate([0, 0, liftZ], duck)),
    colorize([0.1, 0.1, 0.1], translate([0, 0, liftZ], eyes))
  ]
}

export const meta = {
  name: 'Rubber Duck',
  description: 'A cute rubber duck! Quack quack!'
}
