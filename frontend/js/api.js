const API = {
  async fetchJson(url, options = {}) {
    const res = await fetch(url, {
      headers: { 'Content-Type': 'application/json' },
      ...options
    });
    return res.json();
  },

  async scan(targetDir = null) {
    const body = targetDir ? JSON.stringify({ targetDir }) : '{}';
    return this.fetchJson('/api/scan', {
      method: 'POST',
      body
    });
  },

  async getImages() {
    return this.fetchJson('/api/images');
  },

  async replace(ids) {
    return this.fetchJson('/api/replace', {
      method: 'POST',
      body: JSON.stringify({ ids })
    });
  },

  async revert(ids) {
    return this.fetchJson('/api/revert', {
      method: 'POST',
      body: JSON.stringify({ ids })
    });
  },

  getOriginalUrl(id) {
    return `/api/preview/${id}/original`;
  },

  getCompressedUrl(id) {
    return `/api/preview/${id}/compressed`;
  },

  getThumbnailUrl(id) {
    return `/api/preview/${id}/thumbnail`;
  }
};
