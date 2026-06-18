const App = {
  images: [],
  selectedIds: new Set(),
  activeId: null,
  comparator: null,

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
        this.renderList();
        this.updateButtons();
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

  renderList() {
    const listEl = document.getElementById('imageList');
    if (this.images.length === 0) {
      listEl.innerHTML = '<div class="empty-state">暂无图片，点击“扫描并压缩”开始</div>';
      return;
    }

    listEl.innerHTML = '';
    for (const image of this.images) {
      const item = document.createElement('div');
      item.className = `image-item ${image.id === this.activeId ? 'active' : ''} ${image.error ? 'error' : ''}`;
      item.dataset.id = image.id;

      const thumbUrl = API.getCompressedUrl(image.id);
      const checked = this.selectedIds.has(image.id) ? 'checked' : '';
      const savings = image.savingRatio > 0 ? `节省 ${(image.savingRatio * 100).toFixed(1)}%` : '';
      const compressedText = image.compressedSize
        ? `${this.formatSize(image.compressedSize)}`
        : (image.error ? '压缩失败' : '未压缩');

      item.innerHTML = `
        <input type="checkbox" ${checked}>
        <img class="image-thumb" src="${thumbUrl}" alt="" loading="lazy" onerror="this.style.display='none'">
        <div class="image-meta">
          <div class="image-name" title="${image.name}">${image.name}</div>
          <div class="image-sizes">${this.formatSize(image.originalSize)} → ${compressedText}</div>
          <div class="image-savings">${savings}</div>
        </div>
      `;

      item.addEventListener('click', (e) => {
        if (e.target.tagName === 'INPUT') {
          e.stopPropagation();
          this.toggleSelection(image.id);
        } else {
          this.activateImage(image.id);
        }
      });

      listEl.appendChild(item);
    }

    document.getElementById('selectAll').checked = this.selectedIds.size === this.images.length && this.images.length > 0;
  },

  activateImage(id) {
    this.activeId = id;
    const image = this.images.find(img => img.id === id);
    if (image) {
      this.comparator.loadImages(image);
    }
    this.renderList();
  },

  toggleSelection(id) {
    if (this.selectedIds.has(id)) {
      this.selectedIds.delete(id);
    } else {
      this.selectedIds.add(id);
    }
    this.updateButtons();
    this.renderList();
  },

  toggleSelectAll(checked) {
    if (checked) {
      for (const image of this.images) {
        if (image.compressed && !image.error) {
          this.selectedIds.add(image.id);
        }
      }
    } else {
      this.selectedIds.clear();
    }
    this.updateButtons();
    this.renderList();
  },

  updateButtons() {
    const hasSelection = this.selectedIds.size > 0;
    document.getElementById('replaceBtn').disabled = !hasSelection;
    document.getElementById('revertBtn').disabled = !hasSelection;
  },

  async replaceSelected() {
    const ids = Array.from(this.selectedIds);
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
    const ids = Array.from(this.selectedIds);
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
