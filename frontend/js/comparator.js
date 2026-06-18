class ImageComparator {
  constructor() {
    this.originalWrapper = document.getElementById('originalWrapper');
    this.compressedWrapper = document.getElementById('compressedWrapper');
    this.originalImg = document.getElementById('originalImg');
    this.compressedImg = document.getElementById('compressedImg');
    this.zoomSlider = document.getElementById('zoomSlider');
    this.zoomValue = document.getElementById('zoomValue');
    this.previewInfo = document.getElementById('previewInfo');

    this.zoom = parseFloat(this.zoomSlider.value);
    this.isZoomed = false;

    this.bindEvents();
  }

  bindEvents() {
    this.zoomSlider.addEventListener('input', (e) => {
      this.setZoom(parseFloat(e.target.value));
    });

    [this.originalWrapper, this.compressedWrapper].forEach(wrapper => {
      wrapper.addEventListener('mouseenter', () => this.startZoom());
      wrapper.addEventListener('mouseleave', () => this.endZoom());
      wrapper.addEventListener('mousemove', (e) => this.handleMouseMove(e));
      wrapper.addEventListener('wheel', (e) => this.handleWheel(e), { passive: false });
    });
  }

  setZoom(value) {
    const min = parseFloat(this.zoomSlider.min);
    const max = parseFloat(this.zoomSlider.max);
    this.zoom = Math.max(min, Math.min(max, parseFloat(value.toFixed(1))));
    this.zoomSlider.value = this.zoom;
    this.zoomValue.textContent = this.zoom;
    if (this.isZoomed) {
      this.applyZoom();
    }
  }

  handleWheel(e) {
    e.preventDefault();
    const delta = e.deltaY > 0 ? -0.5 : 0.5;
    this.setZoom(this.zoom + delta);
  }

  loadImages(image) {
    this.currentImage = image;
    this.originalImg.src = API.getOriginalUrl(image.id);
    this.compressedImg.src = API.getCompressedUrl(image.id);
    this.updateInfo(image);
    this.endZoom();
  }

  updateInfo(image) {
    if (!image) {
      this.previewInfo.textContent = '请选择一张图片';
      return;
    }

    const orig = this.formatSize(image.originalSize);
    const comp = image.compressedSize ? this.formatSize(image.compressedSize) : '-';
    const ratio = image.savingRatio ? `(-${(image.savingRatio * 100).toFixed(1)}%)` : '';
    const dims = image.width && image.height ? `${image.width}x${image.height}` : '';
    this.previewInfo.textContent = `${image.name} | ${dims} | 原图 ${orig} → 压缩后 ${comp} ${ratio}`;
  }

  formatSize(bytes) {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
  }

  handleMouseMove(e) {
    const wrapper = e.currentTarget;
    const rect = wrapper.getBoundingClientRect();
    const x = ((e.clientX - rect.left) / rect.width) * 100;
    const y = ((e.clientY - rect.top) / rect.height) * 100;

    this.originX = Math.max(0, Math.min(100, x));
    this.originY = Math.max(0, Math.min(100, y));

    this.applyZoom();
  }

  startZoom() {
    this.isZoomed = true;
    this.originalImg.classList.add('zoomed');
    this.compressedImg.classList.add('zoomed');
    this.applyZoom();
  }

  endZoom() {
    this.isZoomed = false;
    this.originalImg.classList.remove('zoomed');
    this.compressedImg.classList.remove('zoomed');
    this.originalImg.style.transform = '';
    this.compressedImg.style.transform = '';
    this.originalImg.style.transformOrigin = '';
    this.compressedImg.style.transformOrigin = '';
  }

  applyZoom() {
    if (!this.isZoomed) return;

    const origin = `${this.originX}% ${this.originY}%`;
    const transform = `scale(${this.zoom})`;

    this.originalImg.style.transformOrigin = origin;
    this.compressedImg.style.transformOrigin = origin;
    this.originalImg.style.transform = transform;
    this.compressedImg.style.transform = transform;
  }
}
