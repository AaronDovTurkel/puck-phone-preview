import { makePuck } from './viewer-models.js?v=standalone';

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
      viewer.classList.add('viewer-static');
      status.textContent = 'Static Puck preview. Interactive 3D is unavailable in this browser.';
    }
  }

  function createViewer(three, context) {
    const model = makePuck(three);
    const renderer = new three.WebGLRenderer({ canvas, context, alpha: true, antialias: true });
    renderer.setClearColor(0xffffff, 0);
    renderer.toneMapping = three.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.12;

    const scene = new three.Scene();
    const camera = new three.PerspectiveCamera(29, 1, 0.1, 70);
    const shadow = makeContactShadow(three);
    scene.add(model.group, shadow);
    shadow.scale.set(model.width / 2.96, 0.84, 1);
    scene.environment = makeStudioLight(three, renderer);
    scene.environmentIntensity = 1.12;

    const ambient = new three.HemisphereLight(0xfff5ed, 0x817870, 1.28);
    const key = new three.DirectionalLight(0xfff5eb, 2.1);
    key.position.set(-4, 7, 8);
    const fill = new three.DirectionalLight(0xe8edf6, 0.72);
    fill.position.set(5, 2, 3);
    scene.add(ambient, key, fill);

    const marker = document.createElement('span');
    marker.className = 'viewer-rocker-marker';
    marker.textContent = 'Volume rocker';
    marker.setAttribute('aria-hidden', 'true');
    marker.hidden = true;
    stage.append(marker);
    const markerPosition = new three.Vector3();
    const corner = new three.Vector3();

    const face = { yaw: -0.23, pitch: 0.18, roll: 0 };
    const angles = { face, rocker: model.rockerView, connector: model.connectorView };
    const anchors = { rocker: model.rockerAnchor, connector: model.connectorAnchor };
    const viewLabels = {
      face: 'Puck camera face.',
      rocker: 'Volume rocker highlighted on Puck’s upper edge.',
      connector: 'Gold docking pins highlighted on Puck’s back.',
    };
    const target = { ...face };
    const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');

    let activeView = 'face';
    let frame = 0;
    let pointer = null;
    let contextLost = false;

    function updateControls() {
      for (const button of presets) {
        button.setAttribute('aria-pressed', String(button.dataset.view === activeView));
      }
    }

    function moveTo(view, snap = false) {
      const angle = angles[view];
      if (!angle) return;
      const currentYaw = model.group.rotation.y;
      const delta = three.MathUtils.euclideanModulo(angle.yaw - currentYaw + Math.PI, 2 * Math.PI) - Math.PI;
      Object.assign(target, angle, { yaw: currentYaw + delta });
      if (snap) model.group.rotation.set(target.pitch, target.yaw, target.roll, 'YXZ');
      activeView = view;
      marker.hidden = true;
      marker.textContent = view === 'connector' ? 'Docking pins' : 'Volume rocker';
      marker.dataset.detail = view;
      updateControls();
      status.textContent = viewLabels[view];
      requestFrame();
    }

    function frameModel(rotation) {
      const tanHalfFov = Math.tan(camera.fov * Math.PI / 360);
      const horizontal = tanHalfFov * camera.aspect / 1.10;
      const vertical = tanHalfFov / (anchors[activeView] ? 1.42 : 1.24);
      const halfWidth = model.width / 2;
      const halfHeight = model.height / 2;
      const halfDepth = model.depth / 2;
      const eyeTilt = 0.105;
      const sin = Math.sin(eyeTilt);
      const cos = Math.cos(eyeTilt);
      let distance = halfDepth + Math.max(halfWidth / horizontal, halfHeight / vertical);
      let lowestEdge = 0;

      // Fit rotated bounds without zooming in on edge-on views.
      for (const x of [-halfWidth, halfWidth]) {
        for (const y of [-halfHeight, halfHeight]) {
          for (const z of [-halfDepth, halfDepth]) {
            corner.set(x, y, z).applyEuler(rotation);
            lowestEdge = Math.min(lowestEdge, corner.y);
            const screenY = corner.y * cos - corner.z * sin;
            const screenZ = corner.y * sin + corner.z * cos;
            distance = Math.max(distance, screenZ + Math.max(
              Math.abs(corner.x) / horizontal,
              Math.abs(screenY) / vertical,
            ));
          }
        }
      }

      camera.position.set(0, distance * sin, distance * cos);
      camera.lookAt(0, 0, 0);
      shadow.position.set(0.16, lowestEdge - 0.075, -0.10);
    }

    function positionMarker(rotation) {
      const anchor = anchors[activeView];
      marker.hidden = !anchor || Math.max(
        Math.abs(rotation.y - target.yaw),
        Math.abs(rotation.x - target.pitch),
      ) > 0.21;
      if (marker.hidden) return;

      anchor.getWorldPosition(markerPosition).project(camera);
      const width = stage.clientWidth;
      const height = stage.clientHeight;
      const x = (markerPosition.x + 1) * width / 2;
      const y = (1 - markerPosition.y) * height / 2;
      const labelWidth = marker.offsetWidth;
      const labelHeight = marker.offsetHeight;
      const below = activeView === 'connector' || y < labelHeight + 20;
      const left = three.MathUtils.clamp(x - labelWidth / 2, 8, width - labelWidth - 8);
      const preferredY = below ? Math.max(y + 22, height * 0.80) : y - labelHeight - 19;
      const top = three.MathUtils.clamp(preferredY, 8, height - labelHeight - 8);
      const leader = below ? top - y : y - top - labelHeight;
      marker.classList.toggle('is-below', below);
      marker.style.setProperty('--anchor-offset', `${x - left}px`);
      marker.style.setProperty('--leader', `${Math.max(0, leader)}px`);
      marker.style.left = `${left}px`;
      marker.style.top = `${top}px`;
    }

    function render() {
      frame = 0;
      if (contextLost) return;

      const rotation = model.group.rotation;
      const atTarget = Math.max(
        Math.abs(target.yaw - rotation.y),
        Math.abs(target.pitch - rotation.x),
        Math.abs(target.roll - rotation.z),
      ) < 0.001;
      const blend = atTarget || reducedMotion.matches || pointer ? 1 : 0.22;

      rotation.x += (target.pitch - rotation.x) * blend;
      rotation.y += (target.yaw - rotation.y) * blend;
      rotation.z += (target.roll - rotation.z) * blend;

      frameModel(rotation);
      renderer.render(scene, camera);
      positionMarker(rotation);
      if (!atTarget && blend < 1) requestFrame();
    }

    function requestFrame() {
      if (!frame) frame = requestAnimationFrame(render);
    }

    function resize() {
      const { clientWidth: width, clientHeight: height } = stage;
      if (!width || !height) return;

      renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
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

    function announceCustomView() {
      status.textContent = 'Puck custom view.';
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
      if (!touch) target.pitch = three.MathUtils.clamp(target.pitch + dy * 0.011, -1.25, 1.25);
      requestFrame();
    });

    function endDrag(event) {
      if (!pointer || pointer.id !== event.pointerId) return;
      if (pointer.moved) announceCustomView();
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
        moveTo('face');
        return;
      }

      const rotation = rotations[event.key];
      if (!rotation) return;
      event.preventDefault();
      beginCustomView();
      target.yaw += rotation[0];
      target.pitch = three.MathUtils.clamp(target.pitch + rotation[1], -1.25, 1.25);
      announceCustomView();
      requestFrame();
    });

    presets.forEach((button) => button.addEventListener('click', () => moveTo(button.dataset.view)));
    reset?.addEventListener('click', () => moveTo('face'));

    function setInteractive(interactive) {
      stage.classList.toggle('is-ready', interactive);
      viewer.classList.toggle('viewer-static', !interactive);
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
      scene.environment.dispose();
      scene.environment = makeStudioLight(three, renderer);
      setInteractive(true);
      moveTo('face', true);
      resize();
    });

    setInteractive(true);
    moveTo('face', true);
    new ResizeObserver(resize).observe(stage);
    resize();
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

function makeStudioLight(three, renderer) {
  const room = new three.Scene();
  room.background = new three.Color(0x888079);
  const panelGeometry = new three.PlaneGeometry(1, 1);

  function panel(width, height, x, y, z, color, intensity, roll = 0) {
    const material = new three.MeshBasicMaterial({
      color: new three.Color(color).multiplyScalar(intensity),
      toneMapped: false,
    });
    const lightPanel = new three.Mesh(panelGeometry, material);
    lightPanel.position.set(x, y, z);
    lightPanel.scale.set(width, height, 1);
    lightPanel.lookAt(0, 0, 0);
    lightPanel.rotateZ(roll);
    room.add(lightPanel);
  }

  panel(5.0, 8, -4, 4, 4, 0xfff7e7, 3.8);
  panel(3.5, 7, 5, 2, 3, 0xe4e7f1, 2.6);
  panel(5.5, 5, -2, 4, -5, 0xebe8e1, 2.3);
  panel(3.2, 2.0, -3.9, -2.3, 5, 0xe4e7f9, 1.9, -0.35);

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
