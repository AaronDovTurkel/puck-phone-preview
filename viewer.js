const viewer = document.querySelector('[data-product-viewer]');

if (viewer) {
  const stage = viewer.querySelector('.viewer-stage');
  const canvas = stage.querySelector('canvas');
  const status = viewer.querySelector('.viewer-status');
  const presets = [...viewer.querySelectorAll('[data-view]')];
  const reset = viewer.querySelector('[data-view-reset]');
  const controls = [...presets, reset].filter(Boolean);

  canvas.tabIndex = -1;
  canvas.setAttribute('aria-hidden', 'true');
  controls.forEach((control) => { control.disabled = true; });

  async function loadViewer() {
    try {
      const context = canvas.getContext('webgl2', { alpha: true, antialias: true });
      if (!context) throw new Error('WebGL 2 unavailable');

      // Three.js r187, bundled from the official package for offline use.
      const three = await import('./assets/vendor/puck-three.min.js');
      createViewer(three, context);
    } catch {
      status.textContent = 'Static preview. Interactive 3D is unavailable in this browser.';
    }
  }

  function createViewer(three, context) {
    const renderer = new three.WebGLRenderer({ canvas, context, alpha: true, antialias: true });
    renderer.setClearColor(0xffffff, 0);
    renderer.toneMapping = three.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.14;

    const scene = new three.Scene();
    const camera = new three.PerspectiveCamera(29, 1, 0.1, 50);
    camera.position.set(0, 0.42, 15.6);
    camera.lookAt(0, -0.10, 0);

    const phone = makePhone(three);
    scene.add(phone, makeContactShadow(three));
    scene.environment = makeStudioLight(three, renderer);
    scene.environmentIntensity = 0.9;

    const ambient = new three.HemisphereLight(0xfff5e6, 0x6b685f, 1.55);
    const key = new three.DirectionalLight(0xfff4e5, 2.25);
    key.position.set(-4, 7, 8);
    const fill = new three.DirectionalLight(0xe6ebf3, 0.8);
    fill.position.set(5, 1, 3);
    scene.add(ambient, key, fill);

    const marker = document.createElement('span');
    marker.className = 'viewer-rocker-marker';
    marker.textContent = 'Volume rocker';
    marker.setAttribute('aria-hidden', 'true');
    marker.hidden = true;
    stage.append(marker);
    const markerPosition = new three.Vector3();

    const angles = {
      rear: { yaw: 0.40, pitch: 0.07, roll: -0.10, label: 'Rear view' },
      side: { yaw: 1.18, pitch: 0.06, roll: -0.04, label: 'Side view. Volume rocker highlighted on the handset rail.' },
      front: { yaw: Math.PI - 0.31, pitch: 0.06, roll: 0.07, label: 'Front view' },
    };
    const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
    const target = { ...angles.rear };
    phone.rotation.set(target.pitch, target.yaw, target.roll, 'YXZ');

    let activeView = 'rear';
    let frame = 0;
    let pointer = null;
    let contextLost = false;

    function updateControls() {
      for (const button of presets) {
        button.setAttribute('aria-pressed', String(button.dataset.view === activeView));
      }
    }

    function moveTo(view) {
      const angle = angles[view];
      if (!angle) return;

      const currentYaw = phone.rotation.y;
      const delta = three.MathUtils.euclideanModulo(angle.yaw - currentYaw + Math.PI, 2 * Math.PI) - Math.PI;
      Object.assign(target, angle, { yaw: currentYaw + delta });
      activeView = view;
      updateControls();
      status.textContent = angle.label;
      requestFrame();
    }

    function render() {
      frame = 0;
      if (contextLost) return;

      const rotation = phone.rotation;
      const atTarget = Math.max(
        Math.abs(target.yaw - rotation.y),
        Math.abs(target.pitch - rotation.x),
        Math.abs(target.roll - rotation.z),
      ) < 0.001;
      const blend = atTarget || reducedMotion.matches || pointer ? 1 : 0.22;

      rotation.x += (target.pitch - rotation.x) * blend;
      rotation.y += (target.yaw - rotation.y) * blend;
      rotation.z += (target.roll - rotation.z) * blend;

      renderer.render(scene, camera);
      marker.hidden = activeView !== 'side' || Math.abs(rotation.y - target.yaw) > 0.30;
      if (!marker.hidden) {
        markerPosition.set(-1.523, 0.83, 0.01);
        phone.localToWorld(markerPosition).project(camera);
        marker.style.left = `${(markerPosition.x + 1) * 50}%`;
        marker.style.top = `${(1 - markerPosition.y) * 50}%`;
      }
      if (!atTarget && blend < 1) requestFrame();
    }

    function requestFrame() {
      if (!frame) frame = requestAnimationFrame(render);
    }

    function resize() {
      const { clientWidth: width, clientHeight: height } = stage;
      if (!width || !height) return;

      renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.65));
      renderer.setSize(width, height, false);
      camera.aspect = width / height;
      camera.updateProjectionMatrix();
      requestFrame();
    }

    function beginCustomView() {
      if (!activeView) return;
      activeView = '';
      updateControls();
    }

    canvas.addEventListener('pointerdown', (event) => {
      if (!event.isPrimary || event.button !== 0 || pointer) return;

      pointer = { id: event.pointerId, x: event.clientX, y: event.clientY, moved: false };
      canvas.setPointerCapture(event.pointerId);
      canvas.classList.add('is-dragging');
      if (event.pointerType !== 'touch') canvas.focus({ preventScroll: true });
    });

    canvas.addEventListener('pointermove', (event) => {
      if (!pointer || event.pointerId !== pointer.id) return;

      const dx = event.clientX - pointer.x;
      const dy = event.clientY - pointer.y;
      const touch = event.pointerType === 'touch';
      if (!pointer.moved && Math.abs(dx) + (touch ? 0 : Math.abs(dy)) < 3) return;

      pointer.x = event.clientX;
      pointer.y = event.clientY;
      pointer.moved = true;
      beginCustomView();
      target.yaw += dx * 0.012;
      if (!touch) target.pitch = three.MathUtils.clamp(target.pitch + dy * 0.011, -0.72, 0.72);
      requestFrame();
    });

    function endDrag(event) {
      if (!pointer || pointer.id !== event.pointerId) return;
      if (pointer.moved) status.textContent = 'Custom view';
      pointer = null;
      canvas.classList.remove('is-dragging');
    }

    canvas.addEventListener('pointerup', endDrag);
    canvas.addEventListener('pointercancel', endDrag);
    canvas.addEventListener('lostpointercapture', endDrag);

    canvas.addEventListener('keydown', (event) => {
      const rotations = {
        ArrowLeft: [-0.19, 0],
        ArrowRight: [0.19, 0],
        ArrowUp: [0, -0.13],
        ArrowDown: [0, 0.13],
      };
      if (event.key === 'Home') {
        event.preventDefault();
        moveTo('rear');
        return;
      }

      const rotation = rotations[event.key];
      if (!rotation) return;
      event.preventDefault();
      beginCustomView();
      target.yaw += rotation[0];
      target.pitch = three.MathUtils.clamp(target.pitch + rotation[1], -0.72, 0.72);
      status.textContent = 'Custom view';
      requestFrame();
    });

    presets.forEach((button) => button.addEventListener('click', () => moveTo(button.dataset.view)));
    reset?.addEventListener('click', () => moveTo('rear'));

    function setInteractive(interactive) {
      stage.classList.toggle('is-ready', interactive);
      controls.forEach((control) => { control.disabled = !interactive; });
      canvas.tabIndex = interactive ? 0 : -1;
      if (interactive) canvas.removeAttribute('aria-hidden');
      else canvas.setAttribute('aria-hidden', 'true');
      if (!interactive) marker.hidden = true;
    }

    canvas.addEventListener('webglcontextlost', (event) => {
      event.preventDefault();
      contextLost = true;
      setInteractive(false);
      status.textContent = 'Static preview while the 3D view reconnects.';
    });
    canvas.addEventListener('webglcontextrestored', () => {
      contextLost = false;
      scene.environment = makeStudioLight(three, renderer);
      setInteractive(true);
      status.textContent = 'Interactive view restored.';
      resize();
    });

    new ResizeObserver(resize).observe(stage);
    resize();
    updateControls();
    setInteractive(true);
    status.textContent = 'Rear view';
  }

  if ('IntersectionObserver' in window) {
    const observer = new IntersectionObserver(([entry]) => {
      if (!entry.isIntersecting) return;
      observer.disconnect();
      loadViewer();
    }, { rootMargin: '300px' });
    observer.observe(stage);
  } else {
    loadViewer();
  }
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

function makePhone(three) {
  const phone = new three.Group();
  const standard = (color, roughness, metalness = 0) =>
    new three.MeshStandardMaterial({ color, roughness, metalness });

  const graphite = standard(0x333437, 0.49, 0.77);
  const graphiteBack = standard(0x2f3030, 0.79, 0.26);
  const thinKey = standard(0x666663, 0.39, 0.77);
  const chalk = standard(0xeee2cd, 0.61, 0.06);
  const seam = standard(0x191819, 0.6, 0.35);
  const smoke = new three.MeshPhysicalMaterial({
    color: 0x151416, roughness: 0.19, metalness: 0.48, clearcoat: 0.6, clearcoatRoughness: 0.23,
  });
  const lensRim = standard(0x353337, 0.32, 0.81);
  const lensWall = standard(0x1c1c24, 0.26, 0.46);
  const lensGlass = new three.MeshPhysicalMaterial({
    color: 0x262739, roughness: 0.14, metalness: 0.35, clearcoat: 1, clearcoatRoughness: 0.09,
  });
  const flash = standard(0xffeac2, 0.32, 0.14);
  const orange = standard(0xd14e05, 0.52, 0.16);
  const orangeRidge = standard(0xf35c06, 0.56, 0.08);
  const pinLight = new three.MeshBasicMaterial({ color: 0xffac29, toneMapped: false });
  const holes = new three.MeshBasicMaterial({ color: 0x1f1b18 });

  function mesh(geometry, material, x, y, z) {
    const piece = new three.Mesh(geometry, material);
    piece.position.set(x, y, z);
    phone.add(piece);
    return piece;
  }

  function plate(width, height, thickness, radius, bevel, material, x = 0, y = 0, z = 0) {
    const depth = thickness - bevel * 2;
    const outline = roundedShape(three, width - bevel * 2, height - bevel * 2, radius - bevel);
    const geometry = new three.ExtrudeGeometry(outline, {
      depth, steps: 1, curveSegments: 8, bevelEnabled: true, bevelThickness: bevel,
      bevelSize: bevel, bevelSegments: 3,
    });
    geometry.translate(0, 0, -depth / 2);
    return mesh(geometry, material, x, y, z);
  }

  function disk(radius, depth, material, x, y, z, segments = 32) {
    const geometry = new three.CylinderGeometry(radius, radius, depth, segments);
    geometry.rotateX(Math.PI / 2);
    return mesh(geometry, material, x, y, z);
  }

  plate(2.96, 6.18, 0.35, 0.31, 0.068, graphite);
  plate(2.87, 6.09, 0.058, 0.28, 0.020, graphiteBack, 0, 0, 0.153);
  plate(2.87, 6.09, 0.064, 0.28, 0.022, seam, 0, 0, -0.159);

  const screen = makeScreen(three, 2.67, 5.86);
  screen.position.z = -0.195;
  screen.rotation.y = Math.PI;
  phone.add(screen);
  plate(0.36, 0.024, 0.009, 0.011, 0.003, seam, 0, 2.98, -0.186);

  // The camera face looks toward +Z. Its left rail carries the volume rocker.
  const rockerSlot = plate(0.130, 0.928, 0.023, 0.063, 0.008, seam, -1.471, 0.83, 0.01);
  rockerSlot.rotation.y = -Math.PI / 2;
  const rocker = plate(0.100, 0.850, 0.041, 0.047, 0.014, thinKey, -1.492, 0.83, 0.01);
  rocker.rotation.y = -Math.PI / 2;

  const coreY = 1.98;
  plate(2.84, 1.39, 0.29, 0.25, 0.080, graphite, 0, coreY, 0.309);
  plate(2.72, 1.27, 0.055, 0.217, 0.019, chalk, 0, coreY, 0.452);
  plate(1.49, 1.13, 0.029, 0.165, 0.009, smoke, -0.568, coreY, 0.485);

  for (const x of [-1.006, -0.576, -0.146]) {
    const y = coreY - 0.095;
    disk(0.177, 0.035, lensRim, x, y, 0.511);
    disk(0.150, 0.018, lensWall, x, y, 0.536);
    const lens = new three.SphereGeometry(0.132, 32, 14, 0, Math.PI * 2, 0, Math.PI / 2);
    lens.rotateX(Math.PI / 2);
    lens.scale(1, 1, 0.31);
    mesh(lens, lensGlass, x, y, 0.544);
  }

  disk(0.073, 0.022, lensWall, -0.127, coreY + 0.350, 0.506);
  disk(0.063, 0.019, flash, -0.127, coreY + 0.350, 0.519);
  disk(0.032, 0.010, pinLight, 1.050, coreY + 0.415, 0.482, 20);

  const micHole = new three.CylinderGeometry(0.016, 0.016, 0.003, 12);
  micHole.rotateX(Math.PI / 2);
  for (let row = 0; row < 3; row++) {
    for (let column = 0; column < 6; column++) {
      mesh(micHole, holes, 0.301 + column * 0.071, coreY - 0.147 + row * 0.071, 0.482);
    }
  }

  const buttonX = 1.027;
  const buttonY = coreY - 0.093;
  disk(0.253, 0.026, seam, buttonX, buttonY, 0.491);
  disk(0.229, 0.049, orange, buttonX, buttonY, 0.516);
  const slope = Math.PI / 4;
  for (let index = -6; index <= 6; index++) {
    const offset = index * 0.027;
    const length = 2 * Math.sqrt(0.211 ** 2 - offset ** 2);
    const ridge = mesh(
      new three.BoxGeometry(length, 0.009, 0.005),
      orangeRidge, buttonX - Math.sin(slope) * offset, buttonY + Math.cos(slope) * offset, 0.542,
    );
    ridge.rotation.z = slope;
  }

  return phone;
}

function makeScreen(three, width, height) {
  const art = document.createElement('canvas');
  art.width = 512;
  art.height = 1024;
  const context = art.getContext('2d');
  const background = context.createLinearGradient(50, 0, 470, 1024);
  background.addColorStop(0, '#10151b');
  background.addColorStop(0.54, '#232227');
  background.addColorStop(1, '#0b0c11');
  context.fillStyle = background;
  context.fillRect(0, 0, art.width, art.height);

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
  const geometry = new three.ShapeGeometry(roundedShape(three, width, height, 0.22), 12);
  const positions = geometry.getAttribute('position');
  const uv = geometry.getAttribute('uv');
  for (let index = 0; index < positions.count; index++) {
    uv.setXY(index, positions.getX(index) / width + 0.5, positions.getY(index) / height + 0.5);
  }
  return new three.Mesh(geometry, new three.MeshBasicMaterial({ map: texture, toneMapped: false }));
}

function makeStudioLight(three, renderer) {
  const room = new three.Scene();
  room.background = new three.Color(0x888079);
  const panelGeometry = new three.PlaneGeometry(1, 1);

  function panel(width, height, x, y, z, color, intensity) {
    const material = new three.MeshBasicMaterial({
      color: new three.Color(color).multiplyScalar(intensity),
      toneMapped: false,
    });
    const lightPanel = new three.Mesh(panelGeometry, material);
    lightPanel.position.set(x, y, z);
    lightPanel.scale.set(width, height, 1);
    lightPanel.lookAt(0, 0, 0);
    room.add(lightPanel);
  }

  panel(5.0, 8, -4, 4, 4, 0xfff7e7, 3.8);
  panel(3.5, 7, 5, 2, 3, 0xe4e7f1, 2.6);
  panel(5.5, 5, -2, 4, -5, 0xebe8e1, 2.3);

  const generator = new three.PMREMGenerator(renderer);
  const target = generator.fromScene(room, 0.045);
  generator.dispose();
  panelGeometry.dispose();
  room.children.forEach((child) => child.material.dispose());
  return target.texture;
}

function makeContactShadow(three) {
  const art = document.createElement('canvas');
  art.width = art.height = 128;
  const context = art.getContext('2d');
  const fade = context.createRadialGradient(64, 64, 4, 64, 64, 62);
  fade.addColorStop(0, 'rgba(39, 28, 21, 0.43)');
  fade.addColorStop(0.45, 'rgba(39, 28, 21, 0.25)');
  fade.addColorStop(1, 'rgba(39, 28, 21, 0)');
  context.fillStyle = fade;
  context.fillRect(0, 0, 128, 128);
  const texture = new three.CanvasTexture(art);
  const shadow = new three.Mesh(
    new three.PlaneGeometry(4.4, 2.2),
    new three.MeshBasicMaterial({ map: texture, transparent: true, depthWrite: false, toneMapped: false }),
  );
  shadow.position.set(0.14, -3.30, 0);
  shadow.rotation.x = -Math.PI / 2;
  return shadow;
}
