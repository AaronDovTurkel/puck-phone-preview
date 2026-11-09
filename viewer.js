import { makeProduct } from './viewer-models.js?v=dock-connectors';

const modeNames = {
  pocket: 'Screenless',
  phone: 'Handheld',
  mini: 'Mini tablet',
  fold: 'Foldable',
  clip: 'Clip mount',
};
const fallbackDescriptions = {
  pocket: 'Detached Chalk Optics Puck with a smoked triple-camera window and orange record button',
  phone: 'Chalk Optics Puck docked on the back of a graphite handheld phone',
  mini: 'Chalk Optics Puck docked on a landscape mini tablet',
  fold: 'Chalk Optics Puck docked on a foldable phone with an outer cover screen',
  clip: 'Chalk Optics Puck secured to a woven strap with a clip mount',
};

const viewer = document.querySelector('[data-product-viewer]');

if (viewer) {
  const stage = viewer.querySelector('.viewer-stage');
  const canvas = stage.querySelector('canvas');
  const fallback = stage.querySelector('.viewer-fallback');
  const status = viewer.querySelector('.viewer-status');
  const modes = [...viewer.querySelectorAll('[data-viewer-mode]')];
  const presets = [...viewer.querySelectorAll('[data-view]')];
  const reset = viewer.querySelector('[data-view-reset]');
  const controls = [...presets, reset].filter(Boolean);
  let selectedMode = 'phone';
  let showModel;

  canvas.tabIndex = -1;
  canvas.setAttribute('aria-hidden', 'true');
  controls.forEach((control) => { control.disabled = true; });

  function selectMode(mode) {
    if (!Object.hasOwn(modeNames, mode)) return;

    selectedMode = mode;
    for (const button of modes) {
      button.setAttribute('aria-pressed', String(button.dataset.viewerMode === selectedMode));
    }
    fallback.src = `assets/chalk-v3/mode-${mode}.webp`;
    fallback.alt = fallbackDescriptions[mode];
    canvas.setAttribute('aria-label', `3D model of Puck in ${modeNames[mode].toLowerCase()} mode`);
    if (showModel) showModel();
    else if (viewer.classList.contains('viewer-static')) {
      status.textContent = `${modeNames[mode]} static preview. Interactive 3D is unavailable in this browser.`;
    }
  }

  for (const button of modes) {
    button.addEventListener('click', () => selectMode(button.dataset.viewerMode));
  }

  document.addEventListener('click', (event) => {
    const link = event.target.closest?.('[data-model-link]');
    if (link && !event.ctrlKey && !event.metaKey && !event.shiftKey && !event.altKey) {
      selectMode(link.dataset.modelLink);
    }
  });

  async function loadViewer() {
    try {
      const context = canvas.getContext('webgl2', { alpha: true, antialias: true });
      if (!context) throw new Error('WebGL 2 unavailable');

      // Three.js r187, bundled from the official package for offline use.
      const three = await import('./assets/vendor/puck-three.min.js');
      createViewer(three, context);
    } catch {
      viewer.classList.add('viewer-static');
      status.textContent = `${modeNames[selectedMode]} static preview. Interactive 3D is unavailable in this browser.`;
    }
  }

  function createViewer(three, context) {
    const renderer = new three.WebGLRenderer({ canvas, context, alpha: true, antialias: true });
    renderer.setClearColor(0xffffff, 0);
    renderer.toneMapping = three.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.14;

    const scene = new three.Scene();
    const camera = new three.PerspectiveCamera(29, 1, 0.1, 70);
    const shadow = makeContactShadow(three);
    scene.add(shadow);
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
    const corner = new three.Vector3();

    const rear = { yaw: 0.36, pitch: 0.08, roll: -0.07 };
    const front = { yaw: Math.PI - 0.31, pitch: 0.06, roll: 0.07 };
    const target = { ...rear };
    const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
    const products = new Map();

    let model;
    let activeView = 'rear';
    let inspectingConnector = false;
    let frame = 0;
    let pointer = null;
    let contextLost = false;

    function sideLabel() {
      return selectedMode === 'clip' ? 'Clip side' : 'Back';
    }

    function updateControls() {
      const standalone = selectedMode === 'pocket' || selectedMode === 'clip';
      for (const button of presets) {
        button.setAttribute('aria-pressed', String(button.dataset.view === activeView));
        if (button.dataset.view === 'rear') button.textContent = standalone ? 'Face' : 'Rear';
        if (button.dataset.view === 'front') button.textContent = standalone ? sideLabel() : 'Front';
      }
    }

    function viewLabel(view) {
      const standalone = selectedMode === 'pocket' || selectedMode === 'clip';
      if (view === 'side') return 'Volume rocker highlighted on Puck’s edge.';
      if (view === 'front') return standalone ? `${sideLabel()} view.` : 'Front view.';
      return standalone ? 'Face view.' : 'Rear view.';
    }

    function moveTo(view, snap = false) {
      const connector = view === 'connector';
      const mode = connector ? 'pocket' : selectedMode;
      try {
        if (!products.has(mode)) products.set(mode, makeProduct(three, mode));
      } catch {
        setInteractive(false);
        status.textContent = `${modeNames[mode]} static preview. This model could not load.`;
        return;
      }

      const next = products.get(mode);
      const angle = { rear, side: next.rockerView, connector: next.connectorView, front }[view];
      if (!angle) {
        status.textContent = 'This detail view is unavailable.';
        return;
      }

      if (next !== model) {
        if (model) {
          next.group.rotation.copy(model.group.rotation);
          scene.remove(model.group);
        } else {
          next.group.rotation.set(rear.pitch, rear.yaw, rear.roll, 'YXZ');
        }
        model = next;
        scene.add(model.group);
        shadow.position.set(model.width * 0.035, -model.height / 2 - 0.12, 0);
        shadow.scale.set(model.width / 2.96, Math.max(0.7, model.width / 3.6), 1);
      }

      const currentYaw = model.group.rotation.y;
      const delta = three.MathUtils.euclideanModulo(angle.yaw - currentYaw + Math.PI, 2 * Math.PI) - Math.PI;
      Object.assign(target, angle, { yaw: currentYaw + delta });
      if (snap) model.group.rotation.set(target.pitch, target.yaw, target.roll, 'YXZ');
      activeView = view;
      inspectingConnector = connector;
      marker.textContent = connector ? 'Docking pins' : 'Volume rocker';
      marker.dataset.detail = connector ? 'connector' : 'rocker';
      canvas.setAttribute('aria-label', connector ? 'Detached Puck back with gold docking pins' : `3D model of Puck in ${modeNames[mode].toLowerCase()} mode`);
      updateControls();
      setInteractive(!contextLost);
      if (contextLost) status.textContent = `${modeNames[selectedMode]} static preview while the 3D view reconnects.`;
      else if (connector) status.textContent = 'Detached Puck back. Gold docking pins highlighted.';
      else status.textContent = `${modeNames[selectedMode]} model. ${viewLabel(view)}`;
      requestFrame();
    }

    function frameModel(rotation) {
      const tanHalfFov = Math.tan(camera.fov * Math.PI / 360);
      const horizontal = tanHalfFov * camera.aspect / 1.13;
      const vertical = tanHalfFov / (inspectingConnector ? 1.42 : 1.20);
      const halfWidth = model.width / 2;
      const halfHeight = model.height / 2;
      const halfDepth = (model.depth || 0.7) / 2;
      const eyeTilt = 0.055;
      const sin = Math.sin(eyeTilt);
      const cos = Math.cos(eyeTilt);
      let distance = halfDepth + Math.max(halfWidth / horizontal, halfHeight / vertical);

      // Fit the rotated bounding corners as well as the starting silhouette.
      // This keeps a wide tablet inside a narrow viewport without zooming in on edge-on views.
      for (const x of [-halfWidth, halfWidth]) {
        for (const y of [-halfHeight, halfHeight]) {
          for (const z of [-halfDepth, halfDepth]) {
            corner.set(x, y, z).applyEuler(rotation);
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
    }

    function positionMarker(rotation) {
      const anchor = { side: model.rockerAnchor, connector: model.connectorAnchor }[activeView];
      marker.hidden = !anchor || Math.max(
        Math.abs(rotation.y - target.yaw),
        Math.abs(rotation.x - target.pitch),
      ) > 0.21;
      if (marker.hidden) return;

      anchor.getWorldPosition(markerPosition).project(camera);
      const x = (markerPosition.x + 1) * 50;
      const y = (1 - markerPosition.y) * 50;
      const leftSpace = stage.clientWidth * x / 100;
      const rightSpace = stage.clientWidth - leftSpace;
      const isConnector = activeView === 'connector';
      const isRight = !isConnector && rightSpace > 118 && (x >= 50 || leftSpace < 118);
      marker.classList.toggle('is-right', isRight);
      marker.classList.toggle('is-long', !isConnector && !isRight && x > 65 && leftSpace > 155);
      marker.classList.toggle('is-below', isConnector);
      if (isConnector) {
        const stageHeight = stage.clientHeight;
        const visibleHeight = Math.min(stageHeight / 1.42, stage.clientWidth * model.height / model.width / 1.13);
        const pinY = stageHeight * y / 100;
        const leader = Math.min(stageHeight - pinY - 31, stageHeight / 2 + visibleHeight / 2 - pinY + 17);
        marker.style.setProperty('--leader', `${Math.max(22, leader)}px`);
      } else {
        marker.style.removeProperty('--leader');
      }
      marker.style.left = `${x}%`;
      marker.style.top = `${y}%`;
    }

    function render() {
      frame = 0;
      if (contextLost || !model) return;

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

    function announceCustomView() {
      status.textContent = inspectingConnector ? 'Detached Puck. Custom view.' : `${modeNames[selectedMode]} model. Custom view.`;
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
        moveTo('rear');
        return;
      }

      const rotation = rotations[event.key];
      if (!rotation) return;
      event.preventDefault();
      beginCustomView();
      target.yaw += rotation[0];
      target.pitch = three.MathUtils.clamp(target.pitch + rotation[1], -0.72, 0.72);
      announceCustomView();
      requestFrame();
    });

    presets.forEach((button) => button.addEventListener('click', () => moveTo(button.dataset.view)));
    reset?.addEventListener('click', () => moveTo('rear'));

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
      scene.environment = makeStudioLight(three, renderer);
      moveTo('rear', true);
      resize();
    });

    showModel = () => moveTo('rear', true);
    showModel();
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
