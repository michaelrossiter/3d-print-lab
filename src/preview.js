import * as THREE from 'three'
import { OrbitControls } from 'three/addons/controls/OrbitControls.js'

export function createPreview(canvas) {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true })
  renderer.setPixelRatio(window.devicePixelRatio)
  renderer.setClearColor(0x1a1a2e)

  const scene = new THREE.Scene()

  // Grid: 180mm build plate, 18 divisions = 10mm squares
  const grid = new THREE.GridHelper(180, 18, 0x444466, 0x333355)
  scene.add(grid)

  // Build volume wireframe (180x180x180mm)
  const boxGeo = new THREE.BoxGeometry(180, 180, 180)
  const boxEdges = new THREE.EdgesGeometry(boxGeo)
  const boxLines = new THREE.LineSegments(
    boxEdges,
    new THREE.LineBasicMaterial({ color: 0x666688, transparent: true, opacity: 0.3 })
  )
  boxLines.position.y = 90
  scene.add(boxLines)

  // Lighting
  scene.add(new THREE.AmbientLight(0xffffff, 0.4))
  const dir1 = new THREE.DirectionalLight(0xffffff, 0.8)
  dir1.position.set(50, 100, 50)
  scene.add(dir1)
  const dir2 = new THREE.DirectionalLight(0xffffff, 0.3)
  dir2.position.set(-50, 50, -50)
  scene.add(dir2)

  // Camera
  const camera = new THREE.PerspectiveCamera(50, 1, 0.1, 2000)
  camera.position.set(150, 120, 150)
  camera.lookAt(0, 40, 0)

  // Controls
  const controls = new OrbitControls(camera, canvas)
  controls.enableDamping = true
  controls.dampingFactor = 0.1
  controls.target.set(0, 40, 0)

  let currentModel = null

  function setModel(threeObject) {
    if (currentModel) {
      scene.remove(currentModel)
      disposeObject(currentModel)
    }
    currentModel = threeObject
    if (currentModel) {
      scene.add(currentModel)
    }
  }

  function resize() {
    const panel = canvas.parentElement
    const w = panel.clientWidth
    const h = panel.clientHeight
    renderer.setSize(w, h)
    camera.aspect = w / h
    camera.updateProjectionMatrix()
  }

  function animate() {
    requestAnimationFrame(animate)
    controls.update()
    renderer.render(scene, camera)
  }

  window.addEventListener('resize', resize)
  resize()
  animate()

  return { scene, camera, controls, setModel, resize }
}

function disposeObject(obj) {
  if (!obj) return
  obj.traverse(child => {
    if (child.geometry) child.geometry.dispose()
    if (child.material) {
      if (Array.isArray(child.material)) {
        child.material.forEach(m => m.dispose())
      } else {
        child.material.dispose()
      }
    }
  })
}
