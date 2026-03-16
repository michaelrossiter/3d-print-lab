// text-geometry.js — Convert text strings to solid extruded JSCAD geometry
// Uses opentype.js for font parsing + JSCAD for geometry construction

import opentype from 'opentype.js'

/**
 * Factory: parse a font buffer and return a textGeometry(text, options) function.
 * Works in both browser (window global) and Node.js (MCP server validation).
 *
 * @param {ArrayBuffer} fontArrayBuffer - TTF/OTF font file contents
 * @param {object} jscad - The @jscad/modeling module
 * @returns {function} textGeometry(text, options)
 */
export function createTextGeometry(fontArrayBuffer, jscad) {
  const font = opentype.parse(fontArrayBuffer)

  const { geom2 } = jscad.geometries
  const { extrudeLinear } = jscad.extrusions
  const { subtract, union } = jscad.booleans
  const { translate } = jscad.transforms
  const { measureBoundingBox } = jscad.measurements

  /**
   * Convert text to solid 3D JSCAD geometry.
   *
   * @param {string} text - The text to render
   * @param {object} [options]
   * @param {number} [options.size=10] - Cap height in mm
   * @param {number} [options.height=2] - Extrusion depth in mm
   * @param {string} [options.align='center'] - 'left', 'center', or 'right'
   * @returns {object} JSCAD geom3
   */
  return function textGeometry(text, options = {}) {
    const size = options.size || 10
    const height = options.height || 2
    const align = options.align || 'center'
    const segments = options.segments || 32

    if (!text || text.length === 0) {
      throw new Error('textGeometry: text string is required')
    }

    // Scale: opentype uses font units, we want mm.
    // Measure actual cap height from 'H' glyph for accurate sizing.
    const hGlyph = font.charToGlyph('H')
    const hBox = hGlyph.getBoundingBox()
    const capHeight = hBox.y2 - hBox.y1 // in font units
    const scale = size / capHeight
    const fontSize = font.unitsPerEm // Render at native size, then scale

    // Get the combined path for the entire text string
    const path = font.getPath(text, 0, 0, fontSize)

    // Split path commands into contours
    const contours = splitContours(path.commands)

    if (contours.length === 0) {
      throw new Error('textGeometry: no glyph outlines found for "' + text + '"')
    }

    // Flatten Bezier curves and collect points for each contour
    // Map segments to flattening tolerance: more segments = tighter tolerance = smoother curves
    // segments=16 → tol≈1.0, segments=32 → tol≈0.5, segments=64 → tol≈0.25
    const tolerance = 16 / segments
    const flatContours = contours.map(cmds => flattenContour(cmds, tolerance))

    // Classify contours as outer or hole by signed area
    const classified = flatContours.map(points => ({
      points,
      area: signedArea(points),
    }))

    // Classify contours by containment, not winding (robust across font formats).
    // A contour is a "hole" if it's contained inside another contour; otherwise it's an outer.
    const contourData = classified.filter(c => c.area !== 0)

    // For each contour, count how many other contours contain it
    for (const c of contourData) {
      c.depth = 0
      const testPt = c.points[0]
      for (const other of contourData) {
        if (other === c) continue
        if (pointInPolygon(testPt, other.points)) {
          c.depth++
        }
      }
    }

    // Even depth = outer, odd depth = hole (handles nested shapes correctly)
    const outers = contourData.filter(c => c.depth % 2 === 0)
    const holes = contourData.filter(c => c.depth % 2 === 1)

    // Assign each hole to its smallest containing outer
    for (const hole of holes) {
      const testPt = hole.points[0]
      let bestOuter = null
      let bestArea = Infinity
      for (const outer of outers) {
        if (pointInPolygon(testPt, outer.points) && Math.abs(outer.area) < bestArea) {
          bestArea = Math.abs(outer.area)
          bestOuter = outer
        }
      }
      if (bestOuter) {
        if (!bestOuter.holes) bestOuter.holes = []
        bestOuter.holes.push(hole)
      }
    }

    // Build 3D geometry for each outer contour (minus its holes)
    const solids = []
    for (const outer of outers) {
      // Scale to mm; ensure CCW winding for geom2 (reverse if area is negative/CW)
      let scaledOuter = outer.points.map(p => [p[0] * scale, p[1] * scale])
      if (outer.area < 0) scaledOuter = scaledOuter.slice().reverse()

      if (scaledOuter.length < 3) continue

      let solid
      try {
        const outerGeom2 = geom2.fromPoints(scaledOuter)
        solid = extrudeLinear({ height }, outerGeom2)
      } catch (e) {
        continue // Skip malformed contours
      }

      // Subtract holes
      if (outer.holes) {
        for (const hole of outer.holes) {
          // Scale to mm; ensure CCW for geom2 (reverse if CW)
          let scaledHole = hole.points.map(p => [p[0] * scale, p[1] * scale])
          if (hole.area < 0) scaledHole = scaledHole.slice().reverse()
          if (scaledHole.length < 3) continue
          try {
            const holeGeom2 = geom2.fromPoints(scaledHole)
            const holeGeom3 = extrudeLinear({ height: height + 0.2 }, holeGeom2)
            // Shift hole slightly down so it fully cuts through
            solid = subtract(solid, translate([0, 0, -0.1], holeGeom3))
          } catch (e) {
            continue // Skip malformed holes
          }
        }
      }

      solids.push(solid)
    }

    if (solids.length === 0) {
      throw new Error('textGeometry: could not generate geometry for "' + text + '"')
    }

    let result = solids.length === 1 ? solids[0] : union(...solids)

    // Alignment: measure bounds and translate
    const bounds = measureBoundingBox(result)
    const textWidth = bounds[1][0] - bounds[0][0]
    const textHeight = bounds[1][1] - bounds[0][1]

    let dx = -bounds[0][0] // default: shift so left edge is at x=0
    let dy = -bounds[0][1] // shift so bottom is at y=0

    if (align === 'center') {
      dx = -bounds[0][0] - textWidth / 2
      dy = -bounds[0][1] - textHeight / 2
    } else if (align === 'right') {
      dx = -bounds[1][0]
      dy = -bounds[0][1] - textHeight / 2
    } else {
      // left: x starts at 0, center y
      dy = -bounds[0][1] - textHeight / 2
    }

    return translate([dx, dy, 0], result)
  }
}

// --- Internal helpers ---

/** Split path commands into contours (each M...Z is one contour) */
function splitContours(commands) {
  const contours = []
  let current = []
  for (const cmd of commands) {
    if (cmd.type === 'M') {
      if (current.length > 0) {
        contours.push(current)
      }
      current = [cmd]
    } else {
      current.push(cmd)
    }
  }
  if (current.length > 0) {
    contours.push(current)
  }
  return contours
}

/** Flatten a contour's Bezier curves into line segments, return [[x,y], ...] */
function flattenContour(commands, tolerance) {
  const points = []
  let cx = 0, cy = 0

  for (const cmd of commands) {
    switch (cmd.type) {
      case 'M':
        cx = cmd.x
        cy = -cmd.y // Flip Y: opentype is Y-down, JSCAD is Y-up
        points.push([cx, cy])
        break
      case 'L':
        cx = cmd.x
        cy = -cmd.y
        points.push([cx, cy])
        break
      case 'Q':
        flattenQuadratic(points, cx, cy, cmd.x1, -cmd.y1, cmd.x, -cmd.y, tolerance)
        cx = cmd.x
        cy = -cmd.y
        break
      case 'C':
        flattenCubic(points, cx, cy, cmd.x1, -cmd.y1, cmd.x2, -cmd.y2, cmd.x, -cmd.y, tolerance)
        cx = cmd.x
        cy = -cmd.y
        break
      case 'Z':
        // Close — don't duplicate first point if already there
        break
    }
  }

  // Remove duplicate consecutive points
  return dedup(points)
}

/** Adaptive quadratic Bezier flattening */
function flattenQuadratic(out, x0, y0, x1, y1, x2, y2, tol) {
  const mx = (x0 + 2 * x1 + x2) / 4
  const my = (y0 + 2 * y1 + y2) / 4
  const midX = (x0 + x2) / 2
  const midY = (y0 + y2) / 2
  const dx = mx - midX
  const dy = my - midY
  if (dx * dx + dy * dy < tol * tol) {
    out.push([x2, y2])
  } else {
    const ax01 = (x0 + x1) / 2, ay01 = (y0 + y1) / 2
    const ax12 = (x1 + x2) / 2, ay12 = (y1 + y2) / 2
    const ax = (ax01 + ax12) / 2, ay = (ay01 + ay12) / 2
    flattenQuadratic(out, x0, y0, ax01, ay01, ax, ay, tol)
    flattenQuadratic(out, ax, ay, ax12, ay12, x2, y2, tol)
  }
}

/** Adaptive cubic Bezier flattening */
function flattenCubic(out, x0, y0, x1, y1, x2, y2, x3, y3, tol) {
  const mx = (x0 + 3 * x1 + 3 * x2 + x3) / 8
  const my = (y0 + 3 * y1 + 3 * y2 + y3) / 8
  const midX = (x0 + x3) / 2
  const midY = (y0 + y3) / 2
  const dx = mx - midX
  const dy = my - midY
  if (dx * dx + dy * dy < tol * tol) {
    out.push([x3, y3])
  } else {
    const ax = (x0 + x1) / 2, ay = (y0 + y1) / 2
    const bx = (x1 + x2) / 2, by = (y1 + y2) / 2
    const cx = (x2 + x3) / 2, cy = (y2 + y3) / 2
    const abx = (ax + bx) / 2, aby = (ay + by) / 2
    const bcx = (bx + cx) / 2, bcy = (by + cy) / 2
    const px = (abx + bcx) / 2, py = (aby + bcy) / 2
    flattenCubic(out, x0, y0, ax, ay, abx, aby, px, py, tol)
    flattenCubic(out, px, py, bcx, bcy, cx, cy, x3, y3, tol)
  }
}

/** Signed area of a polygon (positive = CCW in standard math coords) */
function signedArea(points) {
  let area = 0
  const n = points.length
  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n
    area += points[i][0] * points[j][1]
    area -= points[j][0] * points[i][1]
  }
  return area / 2
}

/** Point-in-polygon test (ray casting) */
function pointInPolygon(point, polygon) {
  const [px, py] = point
  let inside = false
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const [xi, yi] = polygon[i]
    const [xj, yj] = polygon[j]
    if ((yi > py) !== (yj > py) && px < (xj - xi) * (py - yi) / (yj - yi) + xi) {
      inside = !inside
    }
  }
  return inside
}

/** Remove consecutive duplicate points */
function dedup(points) {
  if (points.length < 2) return points
  const out = [points[0]]
  for (let i = 1; i < points.length; i++) {
    const prev = out[out.length - 1]
    if (Math.abs(points[i][0] - prev[0]) > 0.01 || Math.abs(points[i][1] - prev[1]) > 0.01) {
      out.push(points[i])
    }
  }
  return out
}
