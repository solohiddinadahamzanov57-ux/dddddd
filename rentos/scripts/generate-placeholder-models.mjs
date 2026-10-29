// Generates simple, original low-poly placeholder vehicle models (boxes +
// cylinders) as .glb files. These are NOT real car models or brands -- just
// enough geometry to prove out the 3D-card pipeline (status, fuel level,
// recoloring by the "body" material) until real licensed assets are swapped
// in. See LICENSES.md.
import { Document, NodeIO } from "@gltf-transform/core";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const outDir = path.resolve(__dirname, "../public/models");

/** Appends a box (6 faces, 24 verts for flat per-face normals) to the given buffers. */
function addBox(buf, cx, cy, cz, w, h, d) {
  const x0 = cx - w / 2,
    x1 = cx + w / 2;
  const y0 = cy - h / 2,
    y1 = cy + h / 2;
  const z0 = cz - d / 2,
    z1 = cz + d / 2;

  const faces = [
    {
      n: [0, 0, 1],
      v: [
        [x0, y0, z1],
        [x1, y0, z1],
        [x1, y1, z1],
        [x0, y1, z1],
      ],
    }, // +Z
    {
      n: [0, 0, -1],
      v: [
        [x1, y0, z0],
        [x0, y0, z0],
        [x0, y1, z0],
        [x1, y1, z0],
      ],
    }, // -Z
    {
      n: [1, 0, 0],
      v: [
        [x1, y0, z1],
        [x1, y0, z0],
        [x1, y1, z0],
        [x1, y1, z1],
      ],
    }, // +X
    {
      n: [-1, 0, 0],
      v: [
        [x0, y0, z0],
        [x0, y0, z1],
        [x0, y1, z1],
        [x0, y1, z0],
      ],
    }, // -X
    {
      n: [0, 1, 0],
      v: [
        [x0, y1, z1],
        [x1, y1, z1],
        [x1, y1, z0],
        [x0, y1, z0],
      ],
    }, // +Y
    {
      n: [0, -1, 0],
      v: [
        [x0, y0, z0],
        [x1, y0, z0],
        [x1, y0, z1],
        [x0, y0, z1],
      ],
    }, // -Y
  ];

  for (const face of faces) {
    const base = buf.positions.length / 3;
    for (const v of face.v) {
      buf.positions.push(...v);
      buf.normals.push(...face.n);
    }
    buf.indices.push(base, base + 1, base + 2, base, base + 2, base + 3);
  }
}

/** A cylinder whose flat caps face along X (so it reads as a wheel viewed from the side). */
function addWheel(buf, cx, cy, cz, radius, width, segments = 14) {
  const x0 = cx - width / 2,
    x1 = cx + width / 2;
  const ring = [];
  for (let i = 0; i < segments; i++) {
    const a = (i / segments) * Math.PI * 2;
    ring.push([Math.cos(a) * radius, Math.sin(a) * radius]);
  }

  // Side wall.
  for (let i = 0; i < segments; i++) {
    const [y0, z0] = ring[i];
    const [y1, z1] = ring[(i + 1) % segments];
    const nx = 0,
      ny = (y0 + y1) / 2,
      nz = (z0 + z1) / 2;
    const base = buf.positions.length / 3;
    buf.positions.push(
      x0,
      cy + y0,
      cz + z0,
      x1,
      cy + y0,
      cz + z0,
      x1,
      cy + y1,
      cz + z1,
      x0,
      cy + y1,
      cz + z1,
    );
    for (let k = 0; k < 4; k++) buf.normals.push(nx, ny, nz);
    buf.indices.push(base, base + 1, base + 2, base, base + 2, base + 3);
  }

  // End caps (simple fan).
  for (const [x, nx] of [
    [x0, -1],
    [x1, 1],
  ]) {
    const center = buf.positions.length / 3;
    buf.positions.push(x, cy, cz);
    buf.normals.push(nx, 0, 0);
    const start = buf.positions.length / 3;
    for (const [y, z] of ring) {
      buf.positions.push(x, cy + y, cz + z);
      buf.normals.push(nx, 0, 0);
    }
    for (let i = 0; i < segments; i++) {
      const a = start + i,
        b = start + ((i + 1) % segments);
      if (nx > 0) buf.indices.push(center, a, b);
      else buf.indices.push(center, b, a);
    }
  }
}

function newBuf() {
  return { positions: [], normals: [], indices: [] };
}

function buildPrimitive(doc, buf, material) {
  const positionAccessor = doc
    .createAccessor()
    .setType("VEC3")
    .setArray(new Float32Array(buf.positions));
  const normalAccessor = doc
    .createAccessor()
    .setType("VEC3")
    .setArray(new Float32Array(buf.normals));
  const indexAccessor = doc
    .createAccessor()
    .setType("SCALAR")
    .setArray(new Uint16Array(buf.indices));

  return doc
    .createPrimitive()
    .setAttribute("POSITION", positionAccessor)
    .setAttribute("NORMAL", normalAccessor)
    .setIndices(indexAccessor)
    .setMaterial(material);
}

function writeModel(filename, build) {
  const doc = new Document();
  const buffer = doc.createBuffer();

  // Named "body" so the app can recolor it per-vehicle at runtime
  // (model-viewer: scene.getMaterialByName("body")...).
  const body = doc
    .createMaterial("body")
    .setBaseColorFactor([0.75, 0.76, 0.78, 1])
    .setMetallicFactor(0.6)
    .setRoughnessFactor(0.4);
  const wheel = doc
    .createMaterial("wheel")
    .setBaseColorFactor([0.08, 0.08, 0.09, 1])
    .setMetallicFactor(0.1)
    .setRoughnessFactor(0.8);
  const glass = doc
    .createMaterial("glass")
    .setBaseColorFactor([0.15, 0.2, 0.25, 0.6])
    .setAlphaMode("BLEND")
    .setMetallicFactor(0.2)
    .setRoughnessFactor(0.1);

  const bodyBuf = newBuf();
  const wheelBuf = newBuf();
  const glassBuf = newBuf();
  build({ bodyBuf, wheelBuf, glassBuf, addBox, addWheel });

  const mesh = doc.createMesh();
  for (const [buf, mat] of [
    [bodyBuf, body],
    [wheelBuf, wheel],
    [glassBuf, glass],
  ]) {
    if (buf.positions.length > 0) {
      mesh.addPrimitive(buildPrimitive(doc, buf, mat));
    }
  }

  const node = doc.createNode(filename.replace(".glb", "")).setMesh(mesh);
  doc.createScene().addChild(node);

  for (const accessor of doc.getRoot().listAccessors()) accessor.setBuffer(buffer);

  const io = new NodeIO();
  return io.write(path.join(outDir, filename), doc);
}

const models = {
  "sedan.glb": ({ bodyBuf, wheelBuf, addBox, addWheel }) => {
    addBox(bodyBuf, 0, 0.35, 0, 1.78, 0.55, 4.4);
    addBox(bodyBuf, 0, 0.92, -0.15, 1.5, 0.58, 2.2);
    for (const x of [-0.95, 0.95])
      for (const z of [-1.55, 1.55]) addWheel(wheelBuf, x, 0.32, z, 0.32, 0.22);
  },
  "hatchback.glb": ({ bodyBuf, wheelBuf, addBox, addWheel }) => {
    addBox(bodyBuf, 0, 0.35, 0, 1.76, 0.55, 3.9);
    addBox(bodyBuf, 0, 0.92, -0.35, 1.5, 0.58, 2.8);
    for (const x of [-0.94, 0.94])
      for (const z of [-1.35, 1.35]) addWheel(wheelBuf, x, 0.32, z, 0.32, 0.22);
  },
  "suv.glb": ({ bodyBuf, wheelBuf, addBox, addWheel }) => {
    addBox(bodyBuf, 0, 0.45, 0, 1.86, 0.75, 4.5);
    addBox(bodyBuf, 0, 1.17, -0.1, 1.6, 0.85, 3.0);
    for (const x of [-0.98, 0.98])
      for (const z of [-1.6, 1.6]) addWheel(wheelBuf, x, 0.37, z, 0.37, 0.24);
  },
  "van.glb": ({ bodyBuf, wheelBuf, addBox, addWheel }) => {
    addBox(bodyBuf, 0, 1.0, 0, 1.9, 1.9, 4.5);
    for (const x of [-1.0, 1.0])
      for (const z of [-1.5, 1.5]) addWheel(wheelBuf, x, 0.37, z, 0.37, 0.24);
  },
  "pickup.glb": ({ bodyBuf, wheelBuf, addBox, addWheel }) => {
    addBox(bodyBuf, 0, 0.4, 0, 1.85, 0.6, 5.1);
    addBox(bodyBuf, 0, 1.0, 1.25, 1.65, 0.65, 1.9);
    for (const x of [-0.98, 0.98])
      for (const z of [-1.9, 0.9]) addWheel(wheelBuf, x, 0.35, z, 0.35, 0.24);
  },
  "motorcycle.glb": ({ bodyBuf, wheelBuf, addBox, addWheel }) => {
    addBox(bodyBuf, 0, 0.62, 0.1, 0.42, 0.34, 1.5);
    addBox(bodyBuf, 0, 0.82, -0.35, 0.3, 0.14, 0.55);
    addWheel(wheelBuf, 0, 0.33, 0.78, 0.33, 0.14);
    addWheel(wheelBuf, 0, 0.33, -0.78, 0.33, 0.14);
  },
};

for (const [filename, build] of Object.entries(models)) {
  await writeModel(filename, build);
  console.log("wrote", filename);
}
