import jscad from '@jscad/modeling'

const { cylinder, cuboid } = jscad.primitives
const { union, subtract } = jscad.booleans
const { translate, rotate } = jscad.transforms
const { colorize } = jscad.colors
const { measureBoundingBox } = jscad.measurements

export function main() {
  // Main tower body
  const tower = cylinder({ radius: 20, height: 60, segments: 32 })

  // Battlements around the top
  const battlements = []
  const numBattlements = 8
  for (let i = 0; i < numBattlements; i++) {
    const angle = (i / numBattlements) * Math.PI * 2
    const x = Math.cos(angle) * 18
    const y = Math.sin(angle) * 18
    battlements.push(
      translate([x, y, 33],
        cuboid({ size: [8, 8, 8] })
      )
    )
  }

  // Door
  const door = translate([0, -20, -15],
    union(
      cuboid({ size: [10, 10, 16] }),
      translate([0, 0, 8],
        cylinder({ radius: 5, height: 10, segments: 16 })
      )
    )
  )

  // Windows — arrow slits
  const windows = []
  for (let i = 0; i < 4; i++) {
    const angle = (i / 4) * Math.PI * 2 + Math.PI / 4
    const x = Math.cos(angle) * 20
    const y = Math.sin(angle) * 20
    windows.push(
      translate([x, y, 10],
        rotate([0, 0, angle],
          cuboid({ size: [3, 25, 12] })
        )
      )
    )
  }

  // Cone roof
  const roof = translate([0, 0, 38],
    cylinder({ radius: 24, height: 20, segments: 32,
      startRadius: 24, endRadius: 0 })
  )

  // Base platform
  const base = translate([0, 0, -32],
    cylinder({ radius: 25, height: 4, segments: 32 })
  )

  const towerWithFeatures = subtract(
    union(tower, ...battlements, base),
    door, ...windows
  )

  // Sit flat on build plate
  const bounds = measureBoundingBox(towerWithFeatures)
  const liftZ = -bounds[0][2]

  return [
    colorize([0.6, 0.55, 0.5], translate([0, 0, liftZ], towerWithFeatures)),
    colorize([0.4, 0.25, 0.15], translate([0, 0, liftZ], roof))
  ]
}

export const meta = {
  name: 'Castle Tower',
  description: 'A medieval castle tower with battlements, arrow slits, and a cone roof!'
}
