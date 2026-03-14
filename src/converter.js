import * as THREE from 'three'
import { geometries } from '@jscad/modeling'

const { geom3 } = geometries

export function jscadToThree(jscadGeom) {
  // JSCAD uses Z-up, Three.js uses Y-up — rotate to match
  const wrapper = new THREE.Group()
  if (Array.isArray(jscadGeom)) {
    const group = new THREE.Group()
    jscadGeom.forEach(g => group.add(createMesh(g)))
    wrapper.add(group)
  } else {
    wrapper.add(createMesh(jscadGeom))
  }
  wrapper.rotation.x = -Math.PI / 2
  return wrapper
}

function createMesh(jscadGeom) {
  const polygons = geom3.toPolygons(jscadGeom)
  const vertices = []
  const indices = []
  let vi = 0

  for (const poly of polygons) {
    const verts = poly.vertices
    const first = vi

    for (const v of verts) {
      vertices.push(v[0], v[1], v[2])
      vi++
    }

    // Fan triangulation (JSCAD polygons are convex)
    for (let i = 2; i < verts.length; i++) {
      indices.push(first, first + i - 1, first + i)
    }
  }

  const geometry = new THREE.BufferGeometry()
  geometry.setAttribute('position', new THREE.BufferAttribute(new Float32Array(vertices), 3))
  geometry.setIndex(indices)
  geometry.computeVertexNormals()

  // Use JSCAD color if present, otherwise cheerful light blue
  let color = 0x4FC3F7
  if (jscadGeom.color && jscadGeom.color.length >= 3) {
    color = new THREE.Color(jscadGeom.color[0], jscadGeom.color[1], jscadGeom.color[2])
  }

  const material = new THREE.MeshPhongMaterial({
    color,
    flatShading: true,
    side: THREE.DoubleSide
  })

  return new THREE.Mesh(geometry, material)
}
