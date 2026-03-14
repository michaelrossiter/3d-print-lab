import jscad from '@jscad/modeling'

const { cylinder, cuboid } = jscad.primitives
const { union, subtract } = jscad.booleans
const { translate, rotate } = jscad.transforms
const { colorize } = jscad.colors
const { measureBoundingBox } = jscad.measurements

export function main() {
  // Rocket body
  const body = cylinder({ radius: 12, height: 50, segments: 32 })

  // Nose cone
  const nose = translate([0, 0, 35],
    cylinder({
      height: 20,
      startRadius: 12,
      endRadius: 0,
      segments: 32
    })
  )

  // Fins — 3 fins evenly spaced
  const fins = []
  for (let i = 0; i < 3; i++) {
    const angle = (i / 3) * Math.PI * 2
    fins.push(
      translate([0, 0, -20],
        rotate([0, 0, angle],
          translate([12, 0, 0],
            rotate([0, -0.2, 0],
              cuboid({ size: [12, 3, 20] })
            )
          )
        )
      )
    )
  }

  // Engine nozzle
  const nozzle = translate([0, 0, -28],
    cylinder({
      height: 8,
      startRadius: 8,
      endRadius: 10,
      segments: 32
    })
  )

  // Window porthole
  const windowHole = translate([0, -12, 10],
    rotate([Math.PI / 2, 0, 0],
      cylinder({ radius: 4, height: 10, segments: 24 })
    )
  )

  const rocket = subtract(
    union(body, nose, ...fins, nozzle),
    windowHole
  )

  // Window glass (slightly recessed)
  const windowGlass = translate([0, -11, 10],
    rotate([Math.PI / 2, 0, 0],
      cylinder({ radius: 3.5, height: 1, segments: 24 })
    )
  )

  // Sit flat on build plate
  const bounds = measureBoundingBox(rocket)
  const liftZ = -bounds[0][2]

  return [
    colorize([0.9, 0.3, 0.2], translate([0, 0, liftZ], rocket)),
    colorize([0.5, 0.8, 1], translate([0, 0, liftZ], windowGlass))
  ]
}

export const meta = {
  name: 'Rocket Ship',
  description: 'A retro rocket ship with fins and a porthole window! 3... 2... 1... Blast off!'
}
