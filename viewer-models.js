const BODY = { width: 2.76, height: 1.34, depth: 0.29, radius: 0.24 };
const WINDOW = { width: 1.46, height: 1.08, radius: 0.16, x: -0.553 };
const PIN_ROW_Y = -0.215;
const LENS_Y = -0.083;
const LENS_X = [-0.982, -0.559, -0.136];

export function makePuck(three) {
  const group = new three.Group();
  const materials = makeMaterials(three);
  const pocket = roundedShape(three, 0.527, 0.100, 0.044, 0, PIN_ROW_Y);
  plate(three, group, materials.graphite, BODY.width, BODY.height, BODY.depth,
    BODY.radius, 0.040, [0, 0, 0], [pocket]);

  makeFace(three, group, materials);
  const rockerAnchor = makeRocker(three, group, materials);
  const connectorAnchor = makeConnector(three, group, materials);

  return {
    group,
    rockerAnchor,
    connectorAnchor,
    width: BODY.width,
    height: BODY.height + 0.025,
    depth: 0.34,
    rockerView: { yaw: -0.23, pitch: 0.78, roll: 0.015 },
    connectorView: { yaw: Math.PI + 0.24, pitch: -0.24, roll: -0.035 },
  };
}

function makeMaterials(three) {
  const metal = (color, roughness, metalness = 0) =>
    new three.MeshStandardMaterial({ color, roughness, metalness });

  return {
    graphite: metal(0x37383b, 0.48, 0.66),
    shadow: metal(0x171618, 0.79),
    rocker: metal(0x545457, 0.44, 0.72),
    chalk: metal(0xeedfc9, 0.58, 0.06),
    smoke: new three.MeshPhysicalMaterial({
      color: 0x0c0d11, roughness: 0.18, metalness: 0.24, clearcoat: 0.74, clearcoatRoughness: 0.17,
    }),
    outerRing: metal(0x2b2b31, 0.36, 0.74),
    innerRing: metal(0x11121b, 0.29, 0.53),
    lensGlass: new three.MeshPhysicalMaterial({
      color: 0xffffff, vertexColors: true, roughness: 0.14, metalness: 0.28,
      clearcoat: 1, clearcoatRoughness: 0.09, ior: 1.53,
    }),
    flash: metal(0xd3c4a8, 0.34, 0.38),
    flashCenter: metal(0xf3db9c, 0.39),
    keyWell: metal(0xb78c6a, 0.50, 0.06),
    orange: metal(0xcc4604, 0.48, 0.12),
    orangeRidge: metal(0xec650c, 0.46, 0.06),
    indicatorBezel: metal(0x8a4d1a, 0.44, 0.35),
    indicator: new three.MeshBasicMaterial({ color: 0xffac27, toneMapped: false }),
    indicatorCenter: new three.MeshBasicMaterial({ color: 0xffe3a6, toneMapped: false }),
    gold: metal(0xb87521, 0.39, 0.76),
    pinCap: metal(0xf4c464, 0.27, 0.52),
  };
}

function roundedShape(three, width, height, radius, x = 0, y = 0) {
  const left = x - width / 2;
  const right = x + width / 2;
  const bottom = y - height / 2;
  const top = y + height / 2;
  const shape = new three.Shape();
  shape.moveTo(left + radius, bottom);
  shape.lineTo(right - radius, bottom);
  shape.quadraticCurveTo(right, bottom, right, bottom + radius);
  shape.lineTo(right, top - radius);
  shape.quadraticCurveTo(right, top, right - radius, top);
  shape.lineTo(left + radius, top);
  shape.quadraticCurveTo(left, top, left, top - radius);
  shape.lineTo(left, bottom + radius);
  shape.quadraticCurveTo(left, bottom, left + radius, bottom);
  return shape;
}

function circle(three, radius, x = 0, y = 0) {
  const shape = new three.Shape();
  shape.absarc(x, y, radius, 0, Math.PI * 2, false);
  return shape;
}

function pinhole(three, x, y) {
  const shape = new three.Shape();
  const radius = 0.017;
  shape.moveTo(x + radius, y);
  for (let index = 1; index < 14; index++) {
    const angle = index / 14 * Math.PI * 2;
    shape.lineTo(x + radius * Math.cos(angle), y + radius * Math.sin(angle));
  }
  shape.closePath();
  return shape;
}

function mesh(three, parent, geometry, material, position) {
  const piece = new three.Mesh(geometry, material);
  piece.position.set(...position);
  parent.add(piece);
  return piece;
}

function extrude(three, parent, material, shape, thickness, bevel, position) {
  const depth = thickness - bevel * 2;
  const geometry = new three.ExtrudeGeometry(shape, {
    depth, steps: 1, curveSegments: 14, bevelEnabled: true, bevelThickness: bevel,
    bevelSize: bevel, bevelSegments: 4,
  });
  geometry.translate(0, 0, -depth / 2);
  smoothBevel(three, geometry, thickness / 2);
  return mesh(three, parent, geometry, material, position);
}

function smoothBevel(three, geometry, capZ) {
  // ExtrudeGeometry duplicates triangle vertices. Share wall normals by location
  // so the anodized edges reflect continuously while the face stays planar.
  const positions = geometry.getAttribute('position');
  const normals = geometry.getAttribute('normal');
  const edges = new Map();
  const vertexNormals = [];
  const faceNormal = new three.Vector3();
  for (let index = 0; index < positions.count; index++) {
    const z = positions.getZ(index);
    if (Math.abs(z) >= capZ - 0.00001) {
      normals.setXYZ(index, 0, 0, Math.sign(z));
      continue;
    }
    const key = `${positions.getX(index)},${positions.getY(index)},${z}`;
    if (!edges.has(key)) edges.set(key, new three.Vector3());
    const normal = edges.get(key);
    vertexNormals[index] = normal;
    faceNormal.fromBufferAttribute(normals, index);
    normal.add(faceNormal);
  }
  for (const normal of edges.values()) normal.normalize();
  vertexNormals.forEach(({ x, y, z }, index) => normals.setXYZ(index, x, y, z));
}

function plate(three, parent, material, width, height, thickness, radius, bevel, position, cutouts = []) {
  const shape = roundedShape(three, width - bevel * 2, height - bevel * 2, radius - bevel);
  shape.holes.push(...cutouts);
  return extrude(three, parent, material, shape, thickness, bevel, position);
}

function disk(three, parent, material, radius, depth, position, segments = 40) {
  const geometry = new three.CylinderGeometry(radius, radius, depth, segments);
  geometry.rotateX(Math.PI / 2);
  return mesh(three, parent, geometry, material, position);
}

function ring(three, parent, material, outer, inner, thickness, bevel, position) {
  const shape = circle(three, outer - bevel);
  shape.holes.push(circle(three, inner));
  return extrude(three, parent, material, shape, thickness, bevel, position);
}

function makeFace(three, group, m) {
  const faceCutouts = [
    roundedShape(three, WINDOW.width + 0.003, WINDOW.height + 0.003, WINDOW.radius, WINDOW.x),
    circle(three, 0.228, 0.984, LENS_Y),
    circle(three, 0.029, 1.015, 0.397),
  ];
  const mic = new three.Group();
  group.add(mic);
  for (let row = 0; row < 3; row++) {
    for (let column = 0; column < 7; column++) {
      const x = 0.260 + column * 0.061;
      const y = -0.153 + row * 0.059;
      faceCutouts.push(pinhole(three, x, y));
      disk(three, mic, m.shadow, 0.016, 0.004, [x, y, 0.145], 14);
    }
  }
  plate(three, group, m.chalk, 2.665, 1.235, 0.050, 0.21, 0.005, [0, 0, 0.134], faceCutouts);

  const lensCutouts = LENS_X.map(x => circle(three, 0.174, x - WINDOW.x, LENS_Y));
  lensCutouts.push(circle(three, 0.068, -0.124 - WINDOW.x, 0.329));
  plate(three, group, m.smoke, WINDOW.width, WINDOW.height, 0.029,
    WINDOW.radius, 0.003, [WINDOW.x, 0, 0.145], lensCutouts);

  const lenses = new three.Group();
  group.add(lenses);
  const glass = makeGlass(three);
  for (const x of LENS_X) {
    ring(three, lenses, m.outerRing, 0.177, 0.156, 0.024, 0.006, [x, LENS_Y, 0.162]);
    ring(three, lenses, m.innerRing, 0.157, 0.128, 0.020, 0.007, [x, LENS_Y, 0.158]);
    mesh(three, lenses, glass, m.lensGlass, [x, LENS_Y, 0.142]);
  }

  const flash = [-0.124, 0.329];
  disk(three, group, m.outerRing, 0.069, 0.012, [...flash, 0.150]);
  disk(three, group, m.flash, 0.060, 0.013, [...flash, 0.156]);
  ring(three, group, m.flashCenter, 0.046, 0.026, 0.006, 0.001, [...flash, 0.163]);
  disk(three, group, m.flashCenter, 0.018, 0.004, [...flash, 0.163]);

  disk(three, group, m.indicatorBezel, 0.027, 0.010, [1.015, 0.397, 0.152], 24);
  disk(three, group, m.indicator, 0.018, 0.009, [1.015, 0.397, 0.157], 24);
  disk(three, group, m.indicatorCenter, 0.008, 0.002, [1.015, 0.397, 0.162], 20);
  makeRecordKey(three, group, m);
}

function makeGlass(three) {
  const glass = new three.SphereGeometry(0.133, 48, 24, 0, Math.PI * 2, 0, Math.PI / 2);
  glass.rotateX(Math.PI / 2);
  glass.scale(1, 1, 0.23);

  // The tint follows the curved lens, so its highlights still move with the model.
  const positions = glass.getAttribute('position');
  const colors = positions.clone();
  const pupil = new three.Color(0x0a0d17);
  const coating = new three.Color(0x242840);
  const blue = new three.Color(0x524974);
  const tint = new three.Color();
  for (let index = 0; index < positions.count; index++) {
    const x = positions.getX(index) / 0.133;
    const y = positions.getY(index) / 0.133;
    const radius = Math.hypot(x, y);
    const center = Math.exp(-((radius / 0.27) ** 2));
    const ringDistance = (radius - 0.70) / 0.26;
    const ringTint = Math.exp(-(ringDistance ** 2));
    const crescent = Math.max(0, (y - x) / Math.max(0.001, radius * Math.SQRT2));
    const sheen = crescent ** 2 * (ringTint * 0.8 + center * 0.2);
    positions.setZ(index, positions.getZ(index) + 0.004 * center);
    tint.copy(pupil).lerp(coating, ringTint).lerp(blue, sheen);
    colors.setXYZ(index, tint.r, tint.g, tint.b);
  }
  glass.setAttribute('color', colors);
  glass.computeVertexNormals();
  return glass;
}

function makeRecordKey(three, group, m) {
  const x = 0.984;
  const y = LENS_Y;
  disk(three, group, m.shadow, 0.226, 0.012, [x, y, 0.147]);
  ring(three, group, m.keyWell, 0.230, 0.213, 0.012, 0.003, [x, y, 0.153]);
  extrude(three, group, m.orange, circle(three, 0.208), 0.019, 0.003, [x, y, 0.148]);
  const angle = Math.PI / 4;
  for (let index = -7; index <= 7; index++) {
    const offset = index * 0.024;
    const length = 2 * Math.sqrt(0.199 ** 2 - offset ** 2);
    const ridge = plate(three, group, m.orangeRidge, length, 0.008, 0.008, 0.004, 0.002,
      [x - Math.sin(angle) * offset, y + Math.cos(angle) * offset, 0.159]);
    ridge.rotation.z = angle;
  }
}

function makeRocker(three, group, m) {
  const slot = plate(three, group, m.shadow, 0.638, 0.103, 0.014, 0.051, 0.004, [0.76, 0.664, 0.001]);
  slot.rotation.x = -Math.PI / 2;
  const key = plate(three, group, m.rocker, 0.589, 0.072, 0.017, 0.036, 0.005, [0.76, 0.680, 0.001]);
  key.rotation.x = -Math.PI / 2;
  disk(three, key, m.outerRing, 0.012, 0.003, [0, 0, 0.009], 16);
  disk(three, key, m.shadow, 0.007, 0.002, [0, 0, 0.0105], 16);
  const anchor = new three.Group();
  anchor.position.set(0.05, 0, 0.012);
  key.add(anchor);
  return anchor;
}

function makeConnector(three, group, m) {
  plate(three, group, m.shadow, 0.522, 0.098, 0.014, 0.045, 0.002, [0, PIN_ROW_Y, -0.116]);
  const contacts = new three.Group();
  group.add(contacts);
  for (let index = 0; index < 8; index++) {
    const x = (index - 3.5) * 0.057;
    disk(three, contacts, m.gold, 0.019, 0.013, [x, PIN_ROW_Y, -0.126], 24);
    const tip = new three.SphereGeometry(0.015, 24, 12, 0, Math.PI * 2, 0, Math.PI / 2);
    tip.rotateX(-Math.PI / 2);
    tip.scale(1, 1, 0.37);
    mesh(three, contacts, tip, m.pinCap, [x, PIN_ROW_Y, -0.134]);
  }

  // Land the callout on the pocket edge so the row stays unobstructed.
  const anchor = new three.Group();
  anchor.position.set(0, PIN_ROW_Y - 0.046, -BODY.depth / 2);
  contacts.add(anchor);
  return anchor;
}
