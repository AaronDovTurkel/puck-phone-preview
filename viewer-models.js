const CORE = { width: 2.76, height: 1.34, depth: 0.29, radius: 0.24 };
const PHONE = { width: 2.96, height: 6.18, depth: 0.35, radius: 0.31 };
const TABLET = { width: 7.0, height: 4.92, depth: 0.33, radius: 0.30 };
const HALF = { width: 2.96, height: 6.18, depth: 0.27, radius: 0.24 };

export function makeProduct(three, mode) {
  const group = new three.Group();
  const assembly = new three.Group();
  const materials = makeMaterials(three);
  const { core, rockerAnchor } = makeCore(three, materials);
  group.add(assembly);

  let width = CORE.width;
  let height = CORE.height + 0.025;
  let depth = 0.40;
  let rockerView = { yaw: -0.19, pitch: 0.66, roll: 0.025 };

  switch (mode) {
    case 'phone': {
      const shell = makeShell(three, materials, PHONE);
      mountCore(three, materials, shell, core, 0, 1.98, PHONE.depth);
      assembly.add(shell);
      ({ width, height } = PHONE);
      depth = 0.71;
      assembly.position.z = -0.162;
      break;
    }
    case 'mini': {
      const shell = makeShell(three, materials, TABLET);
      mountCore(three, materials, shell, core, 0, 1.52, TABLET.depth);
      assembly.add(shell);
      ({ width, height } = TABLET);
      depth = 0.69;
      assembly.position.z = -0.162;
      break;
    }
    case 'fold':
      makeFold(three, materials, assembly, core);
      width = 6.05;
      height = HALF.height;
      depth = 0.83;
      assembly.position.z = 0.29;
      rockerView = { yaw: -0.82, pitch: 0.14, roll: 0.02 };
      break;
    case 'clip':
      makeClip(three, materials, assembly, core);
      width = CORE.height + 0.025;
      height = 4.36;
      depth = 0.73;
      assembly.position.set(-0.009, 0, -0.075);
      rockerView = { yaw: -0.73, pitch: 0.13, roll: 0.03 };
      break;
    case 'pocket':
    default:
      assembly.add(core);
      assembly.position.set(0, -0.009, -0.054);
  }

  return { group, rockerAnchor, width, height, depth, rockerView };
}

function makeMaterials(three) {
  const standard = (color, roughness, metalness = 0) =>
    new three.MeshStandardMaterial({ color, roughness, metalness });

  return {
    graphite: standard(0x333437, 0.49, 0.77),
    graphiteBack: standard(0x2f3030, 0.79, 0.26),
    seam: standard(0x191819, 0.60, 0.35),
    thinKey: standard(0x62625f, 0.39, 0.77),
    chalk: standard(0xeee2cd, 0.61, 0.06),
    smoke: new three.MeshPhysicalMaterial({
      color: 0x151416, roughness: 0.19, metalness: 0.48, clearcoat: 0.6, clearcoatRoughness: 0.23,
    }),
    lensRim: standard(0x353337, 0.32, 0.81),
    lensWall: standard(0x1c1c24, 0.26, 0.46),
    lensGlass: new three.MeshPhysicalMaterial({
      color: 0x262739, roughness: 0.14, metalness: 0.35, clearcoat: 1, clearcoatRoughness: 0.09,
    }),
    flash: standard(0xffeac2, 0.32, 0.14),
    orange: standard(0xd14e05, 0.52, 0.16),
    orangeRidge: standard(0xf35c06, 0.56, 0.08),
    pinLight: new three.MeshBasicMaterial({ color: 0xffac29, toneMapped: false }),
    holes: new three.MeshBasicMaterial({ color: 0x1f1b18 }),
    strap: standard(0x33312f, 1),
    clip: standard(0x3d3d3b, 0.46, 0.62),
  };
}

function roundedShape(three, width, height, radius) {
  const x = width / 2;
  const y = height / 2;
  const shape = new three.Shape();
  shape.moveTo(-x + radius, -y);
  shape.lineTo(x - radius, -y);
  shape.quadraticCurveTo(x, -y, x, -y + radius);
  shape.lineTo(x, y - radius);
  shape.quadraticCurveTo(x, y, x - radius, y);
  shape.lineTo(-x + radius, y);
  shape.quadraticCurveTo(-x, y, -x, y - radius);
  shape.lineTo(-x, -y + radius);
  shape.quadraticCurveTo(-x, -y, -x + radius, -y);
  return shape;
}

function mesh(three, parent, geometry, material, position) {
  const piece = new three.Mesh(geometry, material);
  piece.position.set(...position);
  parent.add(piece);
  return piece;
}

function plate(three, parent, material, width, height, thickness, radius, bevel, position = [0, 0, 0]) {
  const depth = thickness - bevel * 2;
  const outline = roundedShape(three, width - bevel * 2, height - bevel * 2, radius - bevel);
  const geometry = new three.ExtrudeGeometry(outline, {
    depth, steps: 1, curveSegments: 8, bevelEnabled: true, bevelThickness: bevel,
    bevelSize: bevel, bevelSegments: 3,
  });
  geometry.translate(0, 0, -depth / 2);
  return mesh(three, parent, geometry, material, position);
}

function disk(three, parent, material, radius, depth, position, segments = 32) {
  const geometry = new three.CylinderGeometry(radius, radius, depth, segments);
  geometry.rotateX(Math.PI / 2);
  return mesh(three, parent, geometry, material, position);
}

function makeCore(three, m) {
  const core = new three.Group();
  plate(three, core, m.graphite, CORE.width, CORE.height, CORE.depth, CORE.radius, 0.068);
  plate(three, core, m.chalk, 2.66, 1.23, 0.055, 0.205, 0.018, [0, 0, 0.134]);
  plate(three, core, m.smoke, 1.46, 1.08, 0.029, 0.161, 0.009, [-0.553, 0, 0.165]);

  const lensGeometry = new three.SphereGeometry(0.131, 32, 14, 0, Math.PI * 2, 0, Math.PI / 2);
  lensGeometry.rotateX(Math.PI / 2);
  lensGeometry.scale(1, 1, 0.31);
  for (const x of [-0.984, -0.559, -0.134]) {
    disk(three, core, m.lensRim, 0.172, 0.033, [x, -0.086, 0.186]);
    disk(three, core, m.lensWall, 0.146, 0.017, [x, -0.086, 0.205]);
    mesh(three, core, lensGeometry, m.lensGlass, [x, -0.086, 0.213]);
  }

  disk(three, core, m.lensWall, 0.073, 0.018, [-0.125, 0.333, 0.182]);
  disk(three, core, m.flash, 0.063, 0.018, [-0.125, 0.333, 0.193]);
  disk(three, core, m.pinLight, 0.030, 0.009, [1.01, 0.397, 0.164], 20);

  const micHole = new three.CylinderGeometry(0.015, 0.015, 0.003, 12);
  micHole.rotateX(Math.PI / 2);
  for (let row = 0; row < 3; row++) {
    for (let column = 0; column < 6; column++) {
      mesh(three, core, micHole, m.holes, [0.291 + column * 0.068, -0.141 + row * 0.068, 0.164]);
    }
  }

  const buttonX = 0.99;
  const buttonY = -0.086;
  disk(three, core, m.seam, 0.241, 0.019, [buttonX, buttonY, 0.166]);
  disk(three, core, m.orange, 0.222, 0.039, [buttonX, buttonY, 0.183]);
  const slope = Math.PI / 4;
  for (let index = -6; index <= 6; index++) {
    const offset = index * 0.026;
    const length = 2 * Math.sqrt(0.203 ** 2 - offset ** 2);
    const ridge = mesh(three, core, new three.BoxGeometry(length, 0.008, 0.005), m.orangeRidge, [
      buttonX - Math.sin(slope) * offset, buttonY + Math.cos(slope) * offset, 0.204,
    ]);
    ridge.rotation.z = slope;
  }

  // On the Puck's long edge. The same part travels with the module into every mount.
  const slot = plate(three, core, m.seam, 0.648, 0.103, 0.019, 0.049, 0.008, [0.79, 0.662, 0.006]);
  slot.rotation.x = -Math.PI / 2;
  const rocker = plate(three, core, m.thinKey, 0.591, 0.072, 0.021, 0.034, 0.008, [0.79, 0.678, 0.006]);
  rocker.rotation.x = -Math.PI / 2;
  const rockerAnchor = new three.Group();
  rockerAnchor.position.z = 0.014;
  rocker.add(rockerAnchor);

  return { core, rockerAnchor };
}

function makeShell(three, m, dimensions, screenTile) {
  const { width, height, depth, radius } = dimensions;
  const shell = new three.Group();
  plate(three, shell, m.graphite, width, height, depth, radius, 0.058);
  plate(three, shell, m.graphiteBack, width - 0.084, height - 0.084, 0.052, radius - 0.025, 0.018, [0, 0, depth / 2 - 0.022]);
  plate(three, shell, m.seam, width - 0.074, height - 0.074, 0.058, radius - 0.026, 0.020, [0, 0, -depth / 2 + 0.014]);

  const screen = makeScreen(three, width - 0.235, height - 0.247, radius - 0.065, screenTile);
  screen.position.z = -depth / 2 - 0.017;
  screen.rotation.y = Math.PI;
  shell.add(screen);
  return shell;
}

function mountCore(three, m, shell, core, x, y, shellDepth, rotation = 0) {
  const dock = new three.Group();
  dock.position.set(x, y, shellDepth / 2);
  dock.rotation.z = rotation;
  // A fine perimeter seam frames the nested section of the core.
  plate(three, dock, m.seam, CORE.width + 0.026, CORE.height + 0.026, 0.024, CORE.radius + 0.015, 0.010);
  core.position.z = 0.087;
  dock.add(core);
  shell.add(dock);
}

function makeFold(three, m, parent, core) {
  const halfGap = 0.088;
  const rearLeft = makeShell(three, m, HALF, 1);
  const rearRight = makeShell(three, m, HALF, 0);
  const leftPivot = new three.Group();
  const rightPivot = new three.Group();
  leftPivot.position.x = -halfGap;
  rightPivot.position.x = halfGap;
  leftPivot.rotation.y = -0.19;
  rightPivot.rotation.y = 0.19;
  rearLeft.position.x = -HALF.width / 2;
  rearRight.position.x = HALF.width / 2;
  leftPivot.add(rearLeft);
  rightPivot.add(rearRight);
  parent.add(leftPivot, rightPivot);

  mesh(three, parent, new three.CylinderGeometry(0.095, 0.095, HALF.height - 0.16, 24), m.graphite, [0, 0, 0.004]);
  plate(three, parent, m.seam, 0.066, HALF.height - 0.21, 0.025, 0.027, 0.009, [0, 0, 0.087]);
  mountCore(three, m, rearRight, core, 0.59, 1.35, HALF.depth, -Math.PI / 2);
}

function makeClip(three, m, parent, core) {
  const strapWidth = 1.00;
  const strapHeight = 4.36;
  const strapZ = -0.165;
  plate(three, parent, m.strap, strapWidth, strapHeight, 0.066, 0.065, 0.020, [0, 0, strapZ]);

  const art = document.createElement('canvas');
  art.width = 128;
  art.height = 512;
  const context = art.getContext('2d');
  context.fillStyle = '#34312e';
  context.fillRect(0, 0, art.width, art.height);
  for (let row = 0; row < 64; row++) {
    for (let column = 0; column < 16; column++) {
      const light = (row + column) % 2 === 0;
      context.fillStyle = light ? '#4a4641' : '#2d2b29';
      context.fillRect(column * 8 + 1, row * 8 + 1, light ? 6 : 7, light ? 7 : 5);
    }
  }
  context.strokeStyle = '#5a534b';
  context.setLineDash([2, 3]);
  context.beginPath();
  context.moveTo(6, 0);
  context.lineTo(6, art.height);
  context.moveTo(art.width - 6, 0);
  context.lineTo(art.width - 6, art.height);
  context.stroke();

  const texture = new three.CanvasTexture(art);
  texture.colorSpace = three.SRGBColorSpace;
  const fabric = new three.MeshStandardMaterial({ map: texture, roughness: 1 });
  for (const direction of [-1, 1]) {
    const face = texturedFace(three, fabric, strapWidth - 0.025, strapHeight - 0.025, 0.057);
    face.position.z = strapZ + direction * 0.035;
    if (direction < 0) face.rotation.y = Math.PI;
    parent.add(face);
  }

  plate(three, parent, m.clip, 0.79, 3.04, 0.139, 0.158, 0.041, [0, 0.055, -0.017]);
  plate(three, parent, m.clip, 0.48, 2.66, 0.128, 0.119, 0.040, [0, 0.07, strapZ - 0.060]);
  disk(three, parent, m.thinKey, 0.075, 0.016, [0, 1.435, 0.054], 20);
  core.position.z = 0.183;
  core.rotation.z = -Math.PI / 2;
  parent.add(core);
}

function texturedFace(three, material, width, height, radius) {
  const geometry = new three.ShapeGeometry(roundedShape(three, width, height, radius), 12);
  const positions = geometry.getAttribute('position');
  const uv = geometry.getAttribute('uv');
  for (let index = 0; index < positions.count; index++) {
    uv.setXY(index, positions.getX(index) / width + 0.5, positions.getY(index) / height + 0.5);
  }
  return new three.Mesh(geometry, material);
}

function makeScreen(three, width, height, radius, tile) {
  const art = document.createElement('canvas');
  art.width = Math.round(768 * Math.min(width / height, 1.5));
  art.height = 768;
  const context = art.getContext('2d');
  context.scale(art.width / 512, art.height / 1024);
  if (tile !== undefined) context.transform(2, 0, 0, 1, tile * -512, 0);

  const background = context.createLinearGradient(50, 0, 470, 1024);
  background.addColorStop(0, '#10151b');
  background.addColorStop(0.54, '#232227');
  background.addColorStop(1, '#0b0c11');
  context.fillStyle = background;
  context.fillRect(0, 0, 512, 1024);

  const glow = context.createRadialGradient(420, 700, 12, 420, 700, 405);
  glow.addColorStop(0, '#f58132');
  glow.addColorStop(0.40, '#984323');
  glow.addColorStop(0.71, '#3b261f');
  glow.addColorStop(1, '#171821');
  context.fillStyle = glow;
  context.beginPath();
  context.moveTo(-40, 693);
  context.bezierCurveTo(65, 485, 327, 348, 568, 475);
  context.lineTo(568, 945);
  context.bezierCurveTo(261, 879, 91, 986, -40, 1098);
  context.closePath();
  context.fill();

  const texture = new three.CanvasTexture(art);
  texture.colorSpace = three.SRGBColorSpace;
  const material = new three.MeshBasicMaterial({ map: texture, toneMapped: false });
  return texturedFace(three, material, width, height, radius);
}
