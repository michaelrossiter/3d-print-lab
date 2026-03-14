import { defineConfig } from 'vite'
import fs from 'fs'
import path from 'path'

function designWatchPlugin() {
  return {
    name: 'design-watch',
    handleHotUpdate({ file, server }) {
      if (file.includes('/src/designs/')) {
        server.hot.send({ type: 'custom', event: 'design-update', data: {} })
      }
    }
  }
}

// Serve raw (untransformed) source files at /raw/src/...
function rawSourcePlugin() {
  return {
    name: 'raw-source',
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        if (req.url?.startsWith('/raw/')) {
          const filePath = path.join(process.cwd(), req.url.slice(4))
          try {
            const content = fs.readFileSync(filePath, 'utf-8')
            res.setHeader('Content-Type', 'text/plain')
            res.end(content)
          } catch {
            res.statusCode = 404
            res.end('Not found')
          }
          return
        }
        next()
      })
    }
  }
}

export default defineConfig({
  plugins: [designWatchPlugin(), rawSourcePlugin()],
  server: {
    port: 3000,
    open: true
  },
  optimizeDeps: {
    include: ['@jscad/modeling', '@jscad/stl-serializer', 'three']
  }
})
