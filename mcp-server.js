import { Server } from '@modelcontextprotocol/sdk/server/index.js'
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js'
import {
  ListToolsRequestSchema,
  CallToolRequestSchema,
  ListResourcesRequestSchema,
  ReadResourceRequestSchema,
  ListPromptsRequestSchema,
  GetPromptRequestSchema
} from '@modelcontextprotocol/sdk/types.js'
import { createRequire } from 'module'
import fs from 'fs'
import path from 'path'
import os from 'os'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const require = createRequire(import.meta.url)

// Paths
const DESIGNS_DIR = path.join(__dirname, 'src', 'designs')
const TEMPLATES_DIR = path.join(DESIGNS_DIR, 'templates')
const CURRENT_DESIGN = path.join(DESIGNS_DIR, 'current-design.js')
const DOWNLOADS_DIR = path.join(os.homedir(), 'Downloads')

// JSCAD loaded once for validation & STL export
const jscad = require('@jscad/modeling')
const stlSerializer = require('@jscad/stl-serializer')
const { geom3 } = jscad.geometries

// --- Helpers ---

function validateAndMeasure(code) {
  // Write to a temp file so we can require() it with proper module resolution
  const tmpFile = path.join(__dirname, '.tmp-design-validate.cjs')
  try {
    // Convert ESM imports to CJS requires for validation
    const cjsCode = code
      .replace(/import\s+jscad\s+from\s+['"]@jscad\/modeling['"]\s*;?\n?/g,
        'const jscad = require("@jscad/modeling");\n')
      .replace(/export\s+function\s+main/g, 'module.exports.main = function main')
      .replace(/export\s+const\s+main\s*=/g, 'module.exports.main =')
      .replace(/export\s+const\s+meta/g, 'module.exports.meta')

    fs.writeFileSync(tmpFile, cjsCode)

    // Clear require cache for this file
    delete require.cache[tmpFile]
    const mod = require(tmpFile)

    if (typeof mod.main !== 'function') {
      throw new Error('Design must export a main() function')
    }

    const geometry = mod.main()
    const geoms = Array.isArray(geometry) ? geometry : [geometry]

    // Validate each is a geom3
    for (const g of geoms) {
      const polys = geom3.toPolygons(g)
      if (!polys || polys.length === 0) {
        throw new Error('Design returned empty geometry')
      }
    }

    // Measure bounding box across ALL geometry parts
    const allBounds = geoms.map(g => jscad.measurements.measureBoundingBox(g))
    const combinedMin = [
      Math.min(...allBounds.map(b => b[0][0])),
      Math.min(...allBounds.map(b => b[0][1])),
      Math.min(...allBounds.map(b => b[0][2]))
    ]
    const combinedMax = [
      Math.max(...allBounds.map(b => b[1][0])),
      Math.max(...allBounds.map(b => b[1][1])),
      Math.max(...allBounds.map(b => b[1][2]))
    ]
    const size = [
      combinedMax[0] - combinedMin[0],
      combinedMax[1] - combinedMin[1],
      combinedMax[2] - combinedMin[2]
    ]

    // Printability checks
    const warnings = []
    if (size[0] > 180 || size[1] > 180 || size[2] > 180) {
      warnings.push('Design exceeds the A1 Mini build volume (180 x 180 x 180 mm). Scale it down before printing.')
    }
    const minZ = combinedMin[2]
    if (minZ < -0.1) {
      warnings.push(`Model extends ${Math.abs(minZ).toFixed(1)}mm below the build plate. Add translate([0, 0, ${Math.abs(minZ).toFixed(1)}], ...) to move it up.`)
    } else if (minZ > 1.0) {
      warnings.push(`Model is floating ${minZ.toFixed(1)}mm above the build plate. It should sit flat at Z=0.`)
    }
    if (size[0] < 1.5 || size[1] < 1.5 || size[2] < 1.5) {
      const thinAxis = size[0] < 1.5 ? 'X' : size[1] < 1.5 ? 'Y' : 'Z'
      warnings.push(`Very thin on ${thinAxis} axis (${Math.min(size[0], size[1], size[2]).toFixed(1)}mm). Walls under 1.5mm may fail to print.`)
    }
    const baseMin = Math.min(size[0], size[1])
    if (size[2] > 3 * baseMin && baseMin > 0) {
      warnings.push(`Tall and narrow — height (${size[2].toFixed(0)}mm) is ${(size[2] / baseMin).toFixed(1)}x the base (${baseMin.toFixed(0)}mm). May be unstable during printing.`)
    }

    return {
      valid: true,
      size,
      warnings,
      sizeStr: `${size[0].toFixed(1)} x ${size[1].toFixed(1)} x ${size[2].toFixed(1)} mm`,
      geometry,
      meta: mod.meta || {}
    }
  } finally {
    try { fs.unlinkSync(tmpFile) } catch {}
    delete require.cache[tmpFile]
  }
}

function generateSTL(geometry) {
  const geoms = Array.isArray(geometry) ? geometry : [geometry]
  const rawData = stlSerializer.serialize({ binary: true }, ...geoms)
  return Buffer.concat(rawData.map(d => Buffer.from(d)))
}

// --- Server Setup ---

const server = new Server(
  { name: '3d-print-lab', version: '1.0.0' },
  { capabilities: { tools: {}, resources: {}, prompts: {} } }
)

// --- Tools ---

server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: [
    {
      name: 'create_design',
      description: 'Create a 3D printable design by writing JSCAD code. The code is validated, then written to the active design file. The browser preview updates automatically via hot-reload. All dimensions are in millimeters. The Bambu A1 Mini build volume is 180 x 180 x 180 mm.',
      inputSchema: {
        type: 'object',
        properties: {
          code: {
            type: 'string',
            description: 'Complete JSCAD module code using ESM syntax. MUST use: import jscad from \'@jscad/modeling\' (NOT require). Must export a main() function returning geometry. See the jscad://api-reference resource for the API.'
          },
          name: { type: 'string', description: 'Design name (shown in browser status bar)' },
          description: { type: 'string', description: 'Short description of the design' }
        },
        required: ['code']
      }
    },
    {
      name: 'get_current_design',
      description: 'Read the current 3D design source code and get its dimensions.',
      inputSchema: { type: 'object', properties: {} }
    },
    {
      name: 'list_templates',
      description: 'List available starter template designs (rubber duck, rocket ship, etc.).',
      inputSchema: { type: 'object', properties: {} }
    },
    {
      name: 'load_template',
      description: 'Load a starter template into the active design. The browser preview updates automatically.',
      inputSchema: {
        type: 'object',
        properties: {
          name: {
            type: 'string',
            description: 'Template name: rubber-duck, name-tag, castle-tower, rocket-ship, or cookie-cutter'
          }
        },
        required: ['name']
      }
    },
    {
      name: 'export_stl',
      description: 'Export the current design as an STL file to ~/Downloads. The STL can be opened in Bambu Studio or OrcaSlicer for printing.',
      inputSchema: {
        type: 'object',
        properties: {
          filename: {
            type: 'string',
            description: 'Output filename (default: my-design.stl)'
          }
        }
      }
    }
  ]
}))

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params

  if (name === 'create_design') {
    let code = args.code

    // Convert CJS require() to ESM imports for browser compatibility
    // Claude sometimes writes require() style — the browser needs import style
    if (code.includes('require(') && !code.includes('import ')) {
      // Convert: const { cuboid } = require('@jscad/modeling').primitives
      // To:      import jscad from '@jscad/modeling'\n const { cuboid } = jscad.primitives
      const requireLines = []
      const otherLines = []
      const jscadSubmodules = new Set()

      for (const line of code.split('\n')) {
        const reqMatch = line.match(/(?:const|let|var)\s*\{([^}]+)\}\s*=\s*require\(['"]@jscad\/modeling['"]\)\.(\w+)\s*;?/)
        if (reqMatch) {
          jscadSubmodules.add(reqMatch[2])
          otherLines.push(`const {${reqMatch[1]}} = jscad.${reqMatch[2]}`)
          continue
        }
        // const jscad = require('@jscad/modeling')
        const fullReqMatch = line.match(/(?:const|let|var)\s+(\w+)\s*=\s*require\(['"]@jscad\/modeling['"]\)\s*;?/)
        if (fullReqMatch) {
          continue // Will add import at top
        }
        // const { degToRad } = require('@jscad/modeling').utils
        const utilReqMatch = line.match(/(?:const|let|var)\s*\{([^}]+)\}\s*=\s*require\(['"]@jscad\/modeling['"]\)\.(\w+)\s*;?/)
        if (utilReqMatch) {
          otherLines.push(`const {${utilReqMatch[1]}} = jscad.${utilReqMatch[2]}`)
          continue
        }
        otherLines.push(line)
      }

      // Replace module.exports/const main with export
      let converted = otherLines.join('\n')
      converted = converted.replace(/module\.exports\.main\s*=\s*function\s+main/g, 'export function main')
      converted = converted.replace(/module\.exports\.main\s*=\s*/g, 'export const main = ')
      converted = converted.replace(/module\.exports\.meta\s*=/g, 'export const meta =')
      // Handle: const main = () => { ... }  (no export)
      if (!converted.includes('export') && converted.includes('const main')) {
        converted = converted.replace(/const main\s*=/, 'export const main =')
      }
      if (!converted.includes('export const meta') && converted.includes('const meta')) {
        converted = converted.replace(/const meta\s*=/, 'export const meta =')
      }

      code = `import jscad from '@jscad/modeling'\n\n${converted}`
    }

    // Auto-place model on build plate (Z=0) if code doesn't already handle it
    if (!code.includes('measureBoundingBox')) {
      // Rename existing main to _designMain and wrap with auto-Z-placement
      code = code
        .replace(/export\s+function\s+main\s*\(/g, 'function _designMain(')
        .replace(/export\s+const\s+main\s*=\s*/g, 'const _designMain = ')

      code += `

// Auto-placement: sit flat on build plate
const { measureBoundingBox } = jscad.measurements
const { translate } = jscad.transforms
export function main() {
  const result = _designMain()
  const geoms = Array.isArray(result) ? result : [result]
  const allBounds = geoms.map(g => measureBoundingBox(g))
  const minZ = Math.min(...allBounds.map(b => b[0][2]))
  if (Math.abs(minZ) > 0.01) {
    return Array.isArray(result)
      ? result.map(g => translate([0, 0, -minZ], g))
      : translate([0, 0, -minZ], result)
  }
  return result
}
`
    }

    // Add meta export if name/description provided and not already in code
    if ((args.name || args.description) && !code.includes('export const meta')) {
      const metaName = args.name || 'Custom Design'
      const metaDesc = args.description || ''
      code += `\n\nexport const meta = {\n  name: '${metaName.replace(/'/g, "\\'")}',\n  description: '${metaDesc.replace(/'/g, "\\'")}'\n}\n`
    }

    try {
      const result = validateAndMeasure(code)
      fs.writeFileSync(CURRENT_DESIGN, code)

      let msg = `Design saved and browser preview updated!\nSize: ${result.sizeStr}`
      if (result.meta.name) {
        msg = `"${result.meta.name}" — ${msg}`
      }
      if (result.warnings.length > 0) {
        msg += '\n\nPrint warnings:\n' + result.warnings.map(w => `- ${w}`).join('\n')
      }

      return { content: [{ type: 'text', text: msg }] }
    } catch (err) {
      return {
        content: [{ type: 'text', text: `Design validation failed (file NOT written):\n${err.message}` }],
        isError: true
      }
    }
  }

  if (name === 'get_current_design') {
    try {
      const code = fs.readFileSync(CURRENT_DESIGN, 'utf-8')
      const result = validateAndMeasure(code)
      const designName = result.meta.name || 'Unnamed design'
      let msg = `Current design: ${designName}\nSize: ${result.sizeStr}`
      if (result.warnings.length > 0) {
        msg += '\n\nPrint warnings:\n' + result.warnings.map(w => `- ${w}`).join('\n')
      }
      msg += `\n\n---\n\n${code}`
      return {
        content: [{ type: 'text', text: msg }]
      }
    } catch (err) {
      return {
        content: [{ type: 'text', text: `Error reading current design: ${err.message}` }],
        isError: true
      }
    }
  }

  if (name === 'list_templates') {
    try {
      const files = fs.readdirSync(TEMPLATES_DIR).filter(f => f.endsWith('.js'))
      const templates = files.map(f => {
        const templateName = f.replace('.js', '')
        const code = fs.readFileSync(path.join(TEMPLATES_DIR, f), 'utf-8')
        const metaMatch = code.match(/name:\s*['"]([^'"]+)['"]/)
        const descMatch = code.match(/description:\s*['"]([^'"]+)['"]/)
        return {
          name: templateName,
          displayName: metaMatch ? metaMatch[1] : templateName,
          description: descMatch ? descMatch[1] : ''
        }
      })

      const list = templates.map(t => `- **${t.displayName}** (\`${t.name}\`): ${t.description}`).join('\n')
      return {
        content: [{ type: 'text', text: `Available templates:\n\n${list}\n\nUse load_template with the name (e.g. "rocket-ship") to load one.` }]
      }
    } catch (err) {
      return {
        content: [{ type: 'text', text: `Error listing templates: ${err.message}` }],
        isError: true
      }
    }
  }

  if (name === 'load_template') {
    const templateFile = path.join(TEMPLATES_DIR, `${args.name}.js`)
    try {
      if (!fs.existsSync(templateFile)) {
        const available = fs.readdirSync(TEMPLATES_DIR).filter(f => f.endsWith('.js')).map(f => f.replace('.js', ''))
        return {
          content: [{ type: 'text', text: `Template "${args.name}" not found. Available: ${available.join(', ')}` }],
          isError: true
        }
      }
      const code = fs.readFileSync(templateFile, 'utf-8')
      fs.writeFileSync(CURRENT_DESIGN, code)
      const result = validateAndMeasure(code)
      return {
        content: [{ type: 'text', text: `Template "${result.meta.name || args.name}" loaded! Size: ${result.sizeStr}\nBrowser preview updated.` }]
      }
    } catch (err) {
      return {
        content: [{ type: 'text', text: `Error loading template: ${err.message}` }],
        isError: true
      }
    }
  }

  if (name === 'export_stl') {
    try {
      const code = fs.readFileSync(CURRENT_DESIGN, 'utf-8')
      const result = validateAndMeasure(code)
      const stlBuffer = generateSTL(result.geometry)
      const filename = args?.filename || 'my-design.stl'
      const outPath = path.join(DOWNLOADS_DIR, filename)
      fs.writeFileSync(outPath, stlBuffer)
      return {
        content: [{
          type: 'text',
          text: `STL exported to: ${outPath}\nFile size: ${(stlBuffer.length / 1024).toFixed(1)} KB\nDesign size: ${result.sizeStr}\n\nOpen this file in Bambu Studio or OrcaSlicer to slice and print.`
        }]
      }
    } catch (err) {
      return {
        content: [{ type: 'text', text: `Error exporting STL: ${err.message}` }],
        isError: true
      }
    }
  }

  return {
    content: [{ type: 'text', text: `Unknown tool: ${name}` }],
    isError: true
  }
})

// --- Resources ---

const JSCAD_API_REFERENCE = `# JSCAD API Reference for 3D Print Lab

## Design File Contract
Every design must follow this pattern:
\`\`\`javascript
import jscad from '@jscad/modeling'
const { cuboid, cylinder, sphere } = jscad.primitives
const { subtract, union } = jscad.booleans
const { translate, rotate } = jscad.transforms
const { colorize } = jscad.colors

export function main() {
  // Return JSCAD geometry (or array of geometries)
  return cuboid({ size: [20, 20, 30] })
}

export const meta = { name: 'My Design', description: 'A cool thing' }
\`\`\`

## Printer Constraints
- Bambu Labs A1 Mini build volume: **180 x 180 x 180 mm**
- All dimensions in millimeters
- Design should sit on the XY plane (Z=0 is the build plate)

## Primitives (jscad.primitives)
- \`cuboid({ size: [x, y, z] })\` — box centered at origin
- \`sphere({ radius, segments: 32 })\` — sphere
- \`cylinder({ radius, height, segments: 32 })\` — cylinder
- \`cylinder({ startRadius, endRadius, height })\` — cone/tapered cylinder
- \`roundedCuboid({ size: [x,y,z], roundRadius, segments })\` — NOTE: roundRadius must be < half the smallest dimension
- \`roundedCylinder({ radius, height, roundRadius })\`
- \`torus({ innerRadius, outerRadius })\`
- \`ellipsoid({ radius: [rx, ry, rz] })\`
- \`polygon({ points: [[x,y], ...] })\` — 2D shape (for extrusion)
- \`star({ vertices, outerRadius, innerRadius })\` — 2D star (for extrusion)

## Boolean Operations (jscad.booleans)
- \`union(a, b, ...)\` — combine shapes
- \`subtract(base, cutter, ...)\` — cut shapes from base
- \`intersect(a, b, ...)\` — keep only overlap

## Transforms (jscad.transforms)
- \`translate([x, y, z], geometry)\` — move
- \`rotate([rx, ry, rz], geometry)\` — rotate (RADIANS, not degrees)
- \`scale([sx, sy, sz], geometry)\` — scale
- \`center({ axes: [true, true, false] }, geometry)\` — center on specified axes

## Colors (jscad.colors)
- \`colorize([r, g, b], geometry)\` — RGB values 0.0 to 1.0

## Extrusions (jscad.extrusions)
- \`extrudeLinear({ height }, polygon2d)\` — extrude 2D shape to 3D
- \`extrudeRotate({ segments, angle }, polygon2d)\` — lathe/revolve

## Measurements (jscad.measurements)
- \`measureBoundingBox(geometry)\` — returns [[minX,minY,minZ], [maxX,maxY,maxZ]]

## Printability Rules (IMPORTANT)
- **ALWAYS place the model on the build plate**: bottom of model at Z=0. Use \`measureBoundingBox\` to find the min Z, then \`translate([0, 0, -minZ], geometry)\` to sit it flat.
- **Center on XY**: use \`center({ axes: [true, true, false] }, geometry)\` to center horizontally without moving Z.
- **Minimum wall thickness**: 1.5mm. Thinner walls may fail to print.
- **Avoid extreme overhangs**: angles > 45° from vertical need support. Design with flat bottoms and gradual slopes.
- **Tall & narrow prints are unstable**: keep height < 3x the narrower base dimension.
- **Flat bottom**: ensure the model has a flat surface touching Z=0 for good bed adhesion.

## Positioning Pattern
\`\`\`javascript
// Build your geometry, then sit it on the build plate:
const model = union(body, head, tail)
const bounds = jscad.measurements.measureBoundingBox(model)
const onPlate = translate([0, 0, -bounds[0][2]], model)
return center({ axes: [true, true, false] }, onPlate)
\`\`\`

## Tips
- Use \`segments: 32\` for smooth curves, \`segments: 6\` for hexagons
- Return an array of geometries for multi-color prints: \`return [colorize([1,0,0], part1), colorize([0,0,1], part2)]\`
- Use loops for repeated features (battlements, spokes, etc.)
- Keep boolean operations simple — complex nested booleans can be slow
- After exporting STL, open in Bambu Studio/OrcaSlicer to check for overhang warnings and add supports if needed
`

server.setRequestHandler(ListResourcesRequestSchema, async () => ({
  resources: [{
    uri: 'jscad://api-reference',
    name: 'JSCAD API Reference',
    description: 'Complete API reference for writing 3D designs with JSCAD, including printer constraints and design patterns',
    mimeType: 'text/markdown'
  }]
}))

server.setRequestHandler(ReadResourceRequestSchema, async (request) => {
  if (request.params.uri === 'jscad://api-reference') {
    return {
      contents: [{ uri: 'jscad://api-reference', text: JSCAD_API_REFERENCE, mimeType: 'text/markdown' }]
    }
  }
  throw new Error(`Unknown resource: ${request.params.uri}`)
})

// --- Prompts ---

server.setRequestHandler(ListPromptsRequestSchema, async () => ({
  prompts: [{
    name: 'design_3d_print',
    description: 'Start a 3D print design session. Provides the JSCAD API reference and printer constraints.',
    arguments: [{
      name: 'idea',
      description: 'What do you want to design? (e.g. "a dinosaur", "a phone stand")',
      required: false
    }]
  }]
}))

server.setRequestHandler(GetPromptRequestSchema, async (request) => {
  if (request.params.name === 'design_3d_print') {
    const idea = request.params.arguments?.idea || ''
    return {
      messages: [{
        role: 'user',
        content: {
          type: 'text',
          text: `I want to design a 3D printable object${idea ? `: ${idea}` : ''}.\n\nPlease use the create_design tool to write JSCAD code. Read the jscad://api-reference resource first to understand the API.\n\nCritical rules:\n- Bambu Labs A1 Mini: 180 x 180 x 180 mm build volume\n- All dimensions in mm\n- MUST sit on build plate: use measureBoundingBox() to find min Z, then translate([0, 0, -minZ], model) so the bottom is at Z=0\n- Center on XY with center({ axes: [true, true, false] }, model)\n- Minimum wall thickness: 1.5mm\n- Avoid overhangs > 45° — design with flat bottoms and gradual slopes\n- Keep height < 3x the narrower base dimension for stability`
        }
      }]
    }
  }
  throw new Error(`Unknown prompt: ${request.params.name}`)
})

// --- Start ---

async function main() {
  const transport = new StdioServerTransport()
  await server.connect(transport)
  console.error('[3D Print Lab MCP] Server started on stdio')
}

main().catch(console.error)
