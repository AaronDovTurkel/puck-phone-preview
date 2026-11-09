const modes = {
  pocket: {
    title: 'The pocket core.',
    description: 'Take a call or capture a voice note with earbuds and a physical button. The core stays connected while the screen stays home.',
    tag: 'Screenless carry',
    alt: 'Detached Chalk Optics Puck with three cameras, an orange record button, and a slim rocker on its top edge',
  },
  phone: {
    title: 'A phone in your hand.',
    description: 'The Puck sits in a shallow recess inside the handset’s rails, with its volume rocker exposed along the upper edge.',
    tag: 'Handheld',
    alt: 'Rear view of Chalk Optics seated inside the graphite handset rails',
  },
  mini: {
    title: 'More room to work.',
    description: 'The same handheld-width core docks behind the wider mini tablet. See the screen and rear mount side by side.',
    tag: 'Mini tablet',
    alt: 'Front and rear views of the same graphite mini tablet, with the Chalk Optics Puck seated on the back',
  },
  fold: {
    title: 'Open up a bigger screen.',
    description: 'The Puck docks vertically on one rear half, leaving the center crease clear as the display opens like a book.',
    tag: 'Foldable concept',
    alt: 'Rear view of an open graphite foldable showing the center crease and a vertical Chalk Optics Puck on the right half',
  },
  clip: {
    title: 'Clip it on and head out.',
    description: 'Clip the Puck upright to a bag strap, with the cameras above the record button and the volume rocker on the exposed edge.',
    tag: 'Clip attachment',
    alt: 'Chalk Optics Puck mounted vertically on a charcoal strap',
  },
};

const modeTabs = [...document.querySelectorAll('[role="tab"][data-mode]')];
const modePanel = document.querySelector('#mode-panel');
const modeImage = document.querySelector('#mode-image');
const modeIndex = document.querySelector('#mode-index');
const modeTitle = document.querySelector('#mode-title');
const modeDescription = document.querySelector('#mode-description');
const modeTag = document.querySelector('#mode-tag');
const modeInspector = document.querySelector('[data-model-link]');

function selectMode(index) {
  const selected = modeTabs[index];
  const mode = modes[selected.dataset.mode];

  modeTabs.forEach((tab, tabIndex) => {
    const isSelected = tabIndex === index;
    tab.setAttribute('aria-selected', String(isSelected));
    tab.tabIndex = isSelected ? 0 : -1;
  });

  modePanel.setAttribute('aria-labelledby', selected.id);
  modeImage.src = `assets/chalk-v2/mode-${selected.dataset.mode}.webp`;
  modeImage.alt = mode.alt;
  modeIndex.textContent = [index + 1, modeTabs.length]
    .map((number) => String(number).padStart(2, '0'))
    .join(' / ');
  modeTitle.textContent = mode.title;
  modeDescription.textContent = mode.description;
  modeTag.textContent = mode.tag;
  modeInspector.dataset.modelLink = selected.dataset.mode;
}

modeTabs.forEach((tab, index) => {
  tab.addEventListener('click', () => selectMode(index));
  tab.addEventListener('keydown', (event) => {
    const last = modeTabs.length - 1;
    const nextIndex = {
      ArrowLeft: index === 0 ? last : index - 1,
      ArrowRight: index === last ? 0 : index + 1,
      Home: 0,
      End: last,
    }[event.key];

    if (nextIndex === undefined) return;
    event.preventDefault();
    selectMode(nextIndex);
    modeTabs[nextIndex].focus();
  });
});

const rewards = {
  core: {
    title: 'Core Kit',
    price: '$199',
    description: 'Carry the core with a clip for screenless calls and voice notes.',
    items: ['Puck compute core', 'Clip attachment'],
  },
  everyday: {
    title: 'Everyday Kit',
    price: '$299',
    description: 'Switch between screenless carry and a familiar handheld phone.',
    items: ['Puck compute core', 'Handheld touchscreen', 'Clip attachment'],
  },
  studio: {
    title: 'Studio Kit',
    price: '$449',
    description: 'Keep a handheld screen for your pocket and a mini-tablet screen for more space.',
    items: ['Puck compute core', 'Handheld touchscreen', 'Mini-tablet touchscreen', 'Clip attachment'],
  },
};

const rewardDialog = document.querySelector('#reward-dialog');
const rewardTitle = document.querySelector('#reward-dialog-title');
const rewardPrice = document.querySelector('#reward-dialog-price');
const rewardDescription = document.querySelector('#reward-dialog-description');
const rewardItems = document.querySelector('#reward-dialog-items');
const rewardSave = document.querySelector('#reward-save');
const rewardStatus = document.querySelector('#reward-status');
const rewardButtons = [...document.querySelectorAll('[data-pledge]')];
const rewardStorageKey = 'puck-campaign-kit';
let selectedReward;

function markSavedReward() {
  let savedReward;
  try {
    savedReward = localStorage.getItem(rewardStorageKey);
  } catch {
    return;
  }

  rewardButtons.forEach((button) => {
    button.toggleAttribute('data-saved', button.dataset.pledge === savedReward);
  });
}

rewardButtons.forEach((button) => {
  button.addEventListener('click', () => {
    selectedReward = button.dataset.pledge;
    const reward = rewards[selectedReward];
    rewardTitle.textContent = reward.title;
    rewardPrice.textContent = reward.price;
    rewardDescription.textContent = reward.description;
    rewardStatus.textContent = '';
    rewardItems.replaceChildren(...reward.items.map((item) => {
      const listItem = document.createElement('li');
      listItem.textContent = item;
      return listItem;
    }));

    if (button.hasAttribute('data-saved')) {
      rewardStatus.textContent = 'This kit is saved in your browser.';
    }

    rewardDialog.showModal();
  });
});

rewardSave?.addEventListener('click', () => {
  if (!selectedReward) return;

  try {
    localStorage.setItem(rewardStorageKey, selectedReward);
    markSavedReward();
    rewardStatus.textContent = 'Kit saved in this browser.';
  } catch {
    rewardStatus.textContent = 'Your browser blocked saving. You can still preview this kit.';
  }
});

rewardDialog?.addEventListener('click', (event) => {
  if (event.target !== rewardDialog) return;

  const { top, right, bottom, left } = rewardDialog.getBoundingClientRect();
  if (event.clientX < left || event.clientX > right || event.clientY < top || event.clientY > bottom) {
    rewardDialog.close();
  }
});

markSavedReward();

const shareStatus = document.querySelector('#share-status');

document.querySelectorAll('[data-share]').forEach((button) => {
  button.addEventListener('click', async () => {
    const url = new URL(window.location.href);
    url.hash = '';

    if (url.protocol === 'file:') {
      shareStatus.textContent = 'Open the campaign over HTTP to copy a link.';
      return;
    }

    try {
      await navigator.clipboard.writeText(url.href);
      shareStatus.textContent = 'Campaign link copied.';
    } catch {
      shareStatus.textContent = 'Copy the campaign link from your address bar.';
    }
  });
});

const menuToggle = document.querySelector('[data-menu-toggle]');
const siteMenu = document.querySelector('#site-menu');

menuToggle?.addEventListener('click', () => {
  const expanded = menuToggle.getAttribute('aria-expanded') === 'true';
  menuToggle.setAttribute('aria-expanded', String(!expanded));
});

siteMenu?.addEventListener('click', (event) => {
  if (event.target.closest('a')) menuToggle?.setAttribute('aria-expanded', 'false');
});

document.addEventListener('keydown', (event) => {
  if (event.key === 'Escape' && menuToggle?.getAttribute('aria-expanded') === 'true') {
    menuToggle.setAttribute('aria-expanded', 'false');
    menuToggle.focus();
  }
});

const sectionNav = document.querySelector('.section-nav');
const sectionLinks = [...(sectionNav?.querySelectorAll('a[href^="#"]') ?? [])]
  .map((link) => ({ link, section: document.getElementById(link.hash.slice(1)) }))
  .filter(({ section }) => section);

if (sectionLinks.length > 0) {
  let frame;
  function syncSectionNav() {
    const line = Math.max(120, sectionNav.getBoundingClientRect().bottom + 24);
    const reached = sectionLinks.filter(({ section }) => section.getBoundingClientRect().top <= line);
    const atEnd = window.scrollY + window.innerHeight >= document.documentElement.scrollHeight - 2;
    const current = (atEnd ? sectionLinks.at(-1) : reached.at(-1))?.link;

    sectionLinks.forEach(({ link }) => {
      if (link === current) link.setAttribute('aria-current', 'location');
      else link.removeAttribute('aria-current');
    });
  }

  function scheduleNavSync() {
    window.cancelAnimationFrame(frame);
    frame = window.requestAnimationFrame(syncSectionNav);
  }

  window.addEventListener('scroll', scheduleNavSync, { passive: true });
  window.addEventListener('resize', scheduleNavSync);
  syncSectionNav();
}
