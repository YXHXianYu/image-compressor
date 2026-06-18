const App = {
  images: [],
  selectedIds: new Set(),
  activeId: null,
  comparator: null,
  sortMode: 'size-desc',
  listItemElements: new Map(),

  init() {
    this.comparator = new ImageComparator();
    this.bindEvents();
    this.loadConfig();
  },

  bindEvents() {
    document.getElementById('scanBtn').addEventListener('click', () => this.scan());
    document.getElementById('selectAll').addEventListener('change', (e) => this.toggleSelectAll(e.target.checked));
    document.getElementById('replaceBtn').addEventListener('click', () => this.replaceSelected());
    document.getElementById('revertBtn').addEventListener('click', () => this.revertSelected());
    document.getElementById('settingsBtn').addEventListener('click', () => {
      this.showToast('设置功能暂未实现，请修改 config.json 文件');
    });
    document.getElementById('sortSelect').addEventListener('change', (e) => {
      this.sortMode = e.target.value;
      this.sortImages();
      this.renderList(true);
    });
  },

  async loadConfig() {
    try {
      const res = await API.fetchJson('/api/health');
      if (res.success) {
        document.getElementById('targetDir').textContent = res.targetDir;
      }
    } catch (err) {
      console.error('Failed to load config:', err);
    }
  },

  setLoading(show, text = '正在扫描并压缩图片，请稍候...') {
    const overlay = document.getElementById('loadingOverlay');
    const loadingText = overlay.querySelector('.loading-text');
    loadingText.textContent = text;
    overlay.classList.toggle('hidden', !show);
  },

  async scan() {
    this.setLoading(true);
    try {
      const res = await API.scan();
      if (res.success) {
        this.images = res.data || [];
        this.selectedIds.clear();
        this.activeId = null;
        this.sortImages();
        this.renderList(true);
        this.updateButtons();
        this.updateSelectAllState();
        if (this.images.length > 0) {
          this.activateImage(this.images[0].id);
        }
        this.showToast(`扫描完成，共 ${this.images.length} 张图片`);
      } else {
        this.showToast(`扫描失败: ${res.error}`, 'error');
      }
    } catch (err) {
      console.error('Scan error:', err);
      this.showToast('扫描请求失败，请检查服务是否运行', 'error');
    } finally {
      this.setLoading(false);
    }
  },

  sortImages() {
    const [field, order] = this.sortMode.split('-');

    const getters = {
      size: (img) => img.originalSize,
      savings: (img) => img.savingRatio,
      name: (img) => img.name.toLowerCase()
    };

    const get = getters[field] || getters.size;
    const multiplier = order === 'asc' ? 1 : -1;

    this.images.sort((a, b) => {
      const va = get(a);
      const vb = get(b);
      if (va < vb) return -1 * multiplier;
      if (va > vb) return 1 * multiplier;
      return 0;
    });
  },

  renderList(fullRebuild = false) {
    const listEl = document.getElementById('imageList');
    if (this.images.length === 0) {
      listEl.innerHTML = '<div class="empty-state">暂无图片，点击“扫描并压缩”开始</div>';
      this.listItemElements.clear();
      return;
    }

    if (fullRebuild) {
      // Keep existing elements when possible to avoid image re-decoding
      const fragment = document.createDocumentFragment();
      const newElements = new Map();

      for (const image of this.images) {
        let item = this.listItemElements.get(image.id);
        if (!item) {
          item = this.createListItem(image);
        }
        this.updateListItemContent(item, image);
        this.updateListItemState(item, image);
        newElements.set(image.id, item);
        fragment.appendChild(item);
      }

      listEl.innerHTML = '';
      listEl.appendChild(fragment);
      this.listItemElements = newElements;
    } else {
      // Only update selection/active states
      for (const image of this.images) {
        const item = this.listItemElements.get(image.id);
        if (item) {
          this.updateListItemState(item, image);
        }
      }
    }

    this.updateSelectAllState();
  },

  createListItem(image) {
    const item = document.createElement('div');
    item.className = 'image-item';
    item.dataset.id = image.id;

    item.innerHTML = `
      <input type="checkbox">
      <img class="image-thumb" alt="" loading="lazy" onerror="this.style.display='none'">
      <div class="image-meta">
        <div class="image-name"></div>
        <div class="image-sizes"></div>
        <div class="image-savings"></div>
      </div>
    `;

    const checkbox = item.querySelector('input[type="checkbox"]');

    item.addEventListener('click', (e) => {
      if (image.skipped) {
        // Skipped images can only be previewed, not selected
        if (e.target.tagName !== 'INPUT') {
          this.activateImage(image.id);
        }
        return;
      }

      if (e.target.tagName === 'INPUT') {
        e.stopPropagation();
        this.toggleSelection(image.id);
      } else {
        this.activateImage(image.id);
      }
    });

    return item;
  },

  updateListItemContent(item, image) {
    const thumb = item.querySelector('.image-thumb');
    const nameEl = item.querySelector('.image-name');
    const sizesEl = item.querySelector('.image-sizes');
    const savingsEl = item.querySelector('.image-savings');
    const checkbox = item.querySelector('input[type="checkbox"]');

    thumb.src = API.getThumbnailUrl(image.id);
    thumb.style.display = '';
    nameEl.textContent = image.name;
    nameEl.title = image.name;

    if (image.skipped) {
      checkbox.disabled = true;
      sizesEl.textContent = `${this.formatSize(image.originalSize)}（已跳过）`;
      savingsEl.textContent = '小于阈值，无需压缩';
      return;
    }

    checkbox.disabled = false;
    const compressedText = image.compressedSize
      ? `${this.formatSize(image.compressedSize)}`
      : (image.error ? '压缩失败' : '未压缩');
    sizesEl.textContent = `${this.formatSize(image.originalSize)} → ${compressedText}`;

    const savings = image.savingRatio > 0 ? `节省 ${(image.savingRatio * 100).toFixed(1)}%` : '';
    savingsEl.textContent = savings;
  },

  updateListItemState(item, image) {
    item.classList.toggle('active', image.id === this.activeId);
    item.classList.toggle('error', !!image.error);
    item.classList.toggle('skipped', !!image.skipped);
    const checkbox = item.querySelector('input[type="checkbox"]');
    checkbox.checked = this.selectedIds.has(image.id);
  },

  updateSelectAllState() {
    const selectAll = document.getElementById('selectAll');
    const selectable = this.images.filter(img => img.compressed && !img.error && !img.skipped);
    selectAll.checked = selectable.length > 0 && selectable.every(img => this.selectedIds.has(img.id));
  },

  activateImage(id) {
    const oldActiveId = this.activeId;
    this.activeId = id;
    const image = this.images.find(img => img.id === id);
    if (image) {
      this.comparator.loadImages(image);
    }

    // Update only affected items instead of full re-render
    if (oldActiveId) {
      const oldItem = this.listItemElements.get(oldActiveId);
      if (oldItem) oldItem.classList.remove('active');
    }
    const newItem = this.listItemElements.get(id);
    if (newItem) newItem.classList.add('active');
  },

  toggleSelection(id) {
    const image = this.images.find(img => img.id === id);
    if (image && image.skipped) return;

    if (this.selectedIds.has(id)) {
      this.selectedIds.delete(id);
    } else {
      this.selectedIds.add(id);
    }
    this.updateButtons();

    const item = this.listItemElements.get(id);
    if (item) {
      const checkbox = item.querySelector('input[type="checkbox"]');
      checkbox.checked = this.selectedIds.has(id);
    }
    this.updateSelectAllState();
  },

  toggleSelectAll(checked) {
    if (checked) {
      for (const image of this.images) {
        if (image.compressed && !image.error && !image.skipped) {
          this.selectedIds.add(image.id);
        }
      }
    } else {
      this.selectedIds.clear();
    }
    this.updateButtons();

    for (const item of this.listItemElements.values()) {
      const checkbox = item.querySelector('input[type="checkbox"]');
      checkbox.checked = this.selectedIds.has(item.dataset.id);
    }
    this.updateSelectAllState();
  },

  updateButtons() {
    const hasSelection = this.selectedIds.size > 0;
    document.getElementById('replaceBtn').disabled = !hasSelection;
    document.getElementById('revertBtn').disabled = !hasSelection;
  },

  async replaceSelected() {
    const ids = Array.from(this.selectedIds).filter(id => {
      const image = this.images.find(img => img.id === id);
      return image && !image.skipped;
    });
    if (ids.length === 0) return;

    this.setLoading(true, '正在替换原图，请稍候...');
    try {
      const res = await API.replace(ids);
      if (res.success) {
        this.showToast(`成功替换 ${res.replaced.length} 张图片`);
        if (res.failed.length > 0) {
          console.error('Failed replacements:', res.failed);
        }
      } else {
        this.showToast(`替换失败: ${res.error}`, 'error');
      }
    } catch (err) {
      console.error('Replace error:', err);
      this.showToast('替换请求失败', 'error');
    } finally {
      this.setLoading(false);
    }
  },

  async revertSelected() {
    const ids = Array.from(this.selectedIds).filter(id => {
      const image = this.images.find(img => img.id === id);
      return image && !image.skipped;
    });
    if (ids.length === 0) return;

    this.setLoading(true, '正在撤销替换，请稍候...');
    try {
      const res = await API.revert(ids);
      if (res.success) {
        this.showToast(`成功撤销 ${res.reverted.length} 张图片`);
      } else {
        this.showToast(`撤销失败: ${res.error}`, 'error');
      }
    } catch (err) {
      console.error('Revert error:', err);
      this.showToast('撤销请求失败', 'error');
    } finally {
      this.setLoading(false);
    }
  },

  formatSize(bytes) {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
  },

  showToast(message, type = 'info') {
    const toast = document.getElementById('toast');
    toast.textContent = message;
    toast.classList.remove('hidden');

    if (type === 'error') {
      toast.style.background = '#dc2626';
    } else {
      toast.style.background = '#1f2937';
    }

    setTimeout(() => {
      toast.classList.add('hidden');
    }, 3000);
  }
};

document.addEventListener('DOMContentLoaded', () => {
  App.init();
});
