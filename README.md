# Rossiter 3D Print Lab

A browser-based 3D print designer built for the **Bambu Lab A1 Mini** (180 x 180 x 180 mm build volume). Write JSCAD code in the editor, see a live Three.js preview, and download STL files ready for your slicer.

Includes an **MCP server** so you can design 3D prints by chatting with Claude — just describe what you want and it writes the code, validates printability, and updates the browser preview in real time.

## Features

- **Code editor** — CodeMirror 6 with JavaScript syntax highlighting and dark theme
- **Live 3D preview** — Three.js with orbit controls, grid, and build volume outline
- **STL export** — Download binary STL files for Bambu Studio / OrcaSlicer
- **5 starter templates** — Rubber Duck, Name Tag, Castle Tower, Rocket Ship, Cookie Cutter
- **MCP server for vibe coding** — Design prints by chatting with Claude (Desktop, claude.ai, or Claude Code)
- **Printability validation** — Checks build volume, build plate contact, thin walls, and stability
- **Auto build plate placement** — Models are automatically positioned flat on the build plate
- **Hot reload** — Edit code and the preview updates instantly via Vite HMR

## Quick Start

```bash
git clone https://github.com/mrossiter/3d-print-lab.git
cd 3d-print-lab
npm install
npm run dev
```

Opens at [http://localhost:3000](http://localhost:3000). Edit the code on the left, see the preview on the right.

## MCP Server Setup (Vibe Coding with Claude)

The MCP server lets you design prints by talking to Claude. It works with Claude Desktop, claude.ai, and Claude Code.

### 1. Start the dev server

```bash
npm run dev
```

### 2. Connect to Claude

**Claude Desktop** — Add to your Claude Desktop config (`~/Library/Application Support/Claude/claude_desktop_config.json` on macOS):

```json
{
  "mcpServers": {
    "3d-print-lab": {
      "command": "node",
      "args": ["/full/path/to/3d-print-lab/mcp-server.js"]
    }
  }
}
```

**Claude Code** — Add via CLI:

```bash
claude mcp add 3d-print-lab node /full/path/to/3d-print-lab/mcp-server.js
```

### 3. Start designing

Tell Claude what you want to print — "design a phone stand", "make a dinosaur", "create a cookie cutter shaped like a star". Claude writes the JSCAD code, validates it for printability, and the browser preview updates automatically.

### MCP Tools

| Tool | Description |
|------|-------------|
| `create_design` | Write JSCAD code and update the browser preview |
| `get_current_design` | Read the current design code and measurements |
| `list_templates` | List available starter templates |
| `load_template` | Load a template into the editor |
| `export_stl` | Export the current design as an STL file to ~/Downloads |

## Tech Stack

- **[JSCAD](https://github.com/jscad/OpenJSCAD.org)** (`@jscad/modeling`) — Programmatic 3D modeling in JavaScript
- **[Three.js](https://threejs.org/)** — 3D preview rendering
- **[CodeMirror 6](https://codemirror.net/)** — Code editor
- **[Vite](https://vitejs.dev/)** — Dev server with hot module replacement
- **[MCP SDK](https://modelcontextprotocol.io/)** — Model Context Protocol server for Claude integration

## Design File Format

Designs are plain JavaScript files that export a `main()` function returning JSCAD geometry:

```javascript
import jscad from '@jscad/modeling'

const { cuboid, sphere } = jscad.primitives
const { union } = jscad.booleans
const { translate } = jscad.transforms
const { measureBoundingBox } = jscad.measurements

export function main() {
  const base = cuboid({ size: [40, 40, 5] })
  const ball = translate([0, 0, 15], sphere({ radius: 10 }))
  const model = union(base, ball)

  // Place on build plate
  const bounds = measureBoundingBox(model)
  return translate([0, 0, -bounds[0][2]], model)
}

export const meta = {
  name: 'My Design',
  description: 'A ball on a platform'
}
```

All dimensions are in millimeters. JSCAD uses Z-up coordinates. Models must sit on the build plate (Z = 0).

## Printer

Built for the **Bambu Lab A1 Mini with AMS Lite**:
- Build volume: 180 x 180 x 180 mm
- The preview shows the build area as a grid with boundary lines

Works with any FDM printer — just adjust the build volume checks if yours is different (see `mcp-server.js`).

## License

MIT
