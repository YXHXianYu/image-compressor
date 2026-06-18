# 图片压缩/优化工具开发计划

## 1. 项目背景与目标

为博客仓库 `E:\Data\BJTU\NJU1\15.Blog\my-blog\source\_posts\2603-japan` 开发一个本地 Web 端图片压缩与对比工具。

核心目标：
- 扫描目标目录下的所有图片；
- 根据文件大小阈值 / 相对质量 / 两者兼有的策略生成压缩副本（先存入缓存目录）；
- 提供 Web UI，让用户在左侧原图与右侧压缩图之间进行可视化对比，并选择是否用压缩后的图像替换原图。

---

## 2. 技术路线

采用 **Node.js 全栈** 方案：

| 层级 | 技术选型 | 说明 |
|---|---|---|
| 后端运行时 | Node.js (LTS v20+) | 稳定的长期支持版本 |
| 图像处理库 | Sharp | 基于 libvips，支持 JPEG/PNG/WebP/AVIF/GIF/SVG，压缩速度快 |
| Web 框架 | Express | 轻量、生态成熟、易于本地服务搭建 |
| 文件扫描 | glob / fast-glob | 递归扫描目录中的图片文件 |
| 缓存管理 | fs-extra + 哈希目录 | 按原图内容哈希生成缓存 key |
| 前端 | 原生 HTML + CSS + JavaScript | 无需构建工具，直接运行；支持左右对比与局部放大 |
| 实时通信 | Server-Sent Events (SSE) | 可选，用于扫描/压缩进度推送 |

**不选用的方案说明**：
- Python + Pillow：图像处理速度不如 Sharp，WebP/AVIF 支持需额外插件；
- 调用外部命令行工具（pngquant/mozjpeg/cwebp）：需要额外安装二进制文件，增加本地部署复杂度。

---

## 3. 目录结构

项目根目录：`E:/Data/BJTU/NJU4/14.image-compressor/`

```
image-compressor-web/
├── package.json
├── README.md
├── Plan.md                          # 本文档
├── config.json                      # 默认压缩策略配置
├── cache/                           # 压缩后副本缓存目录
│   └── <hash>/
│       └── <filename>.<ext>
├── backend/
│   ├── app.js                       # Express 入口
│   ├── routes/
│   │   ├── images.js                # 图片扫描、压缩、替换相关接口
│   │   └── preview.js               # 预览图静态服务
│   ├── services/
│   │   ├── scanner.js               # 目录扫描逻辑
│   │   ├── compressor.js            # 压缩核心逻辑（基于 Sharp）
│   │   ├── cacheManager.js          # 缓存管理
│   │   └── replacer.js              # 替换原图逻辑
│   └── utils/
│       └── hash.js                  # 文件哈希工具
├── frontend/
│   ├── index.html                   # 主页面
│   ├── css/
│   │   └── style.css                # 页面样式
│   └── js/
│       ├── app.js                   # 前端主逻辑
│       ├── comparator.js            # 左右对比与局部放大
│       └── api.js                   # 后端接口调用
└── tests/                           # 可选：单元测试
    └── compressor.test.js
```

---

## 4. 功能需求

### 4.1 扫描目录

- 递归扫描指定目录下的图片文件；
- 支持的格式：JPEG、PNG、WebP、AVIF、GIF、SVG；
- 可选：忽略 `.git/`、`node_modules/`、缓存目录等；
- 输出图片元信息：路径、文件名、原始大小、格式、尺寸。

### 4.2 压缩策略

支持三种策略，通过 `config.json` 配置：

| 策略 | 说明 |
|---|---|
| `size_first` | 优先满足文件大小阈值，逐步降低质量直到满足条件 |
| `quality_first` | 优先保证最低质量，不满足大小阈值也保留 |
| `balanced` | 在大小与质量之间取平衡（例如质量 80，若仍超阈值则最多降到 60） |

配置示例：

```json
{
  "targetDir": "E:/Data/BJTU/NJU1/15.Blog/my-blog/source/_posts/2603-japan",
  "maxFileSizeKB": 200,
  "minQuality": 70,
  "strategy": "size_first",
  "outputFormats": {
    "jpeg": { "quality": 85, "progressive": true },
    "png": { "quality": 80, "compressionLevel": 9 },
    "webp": { "quality": 85 },
    "avif": { "quality": 75 }
  },
  "fallbackFormat": "webp"
}
```

### 4.3 压缩流程

1. 读取原图；
2. 生成内容哈希作为缓存 key；
3. 检查缓存是否命中：命中则直接返回缓存路径；
4. 未命中则按策略压缩：
   - JPEG/WebP/AVIF：调整 `quality`；
   - PNG：先尝试 `pngquant` 风格的调色板量化（Sharp 内置 `palette`），必要时转 WebP；
   - GIF/SVG：暂不做压缩，仅做记录；
5. 保存压缩副本到 `cache/<hash>/<filename>.<ext>`；
6. 记录压缩结果：原始大小、压缩后大小、压缩率、质量参数。

### 4.4 Web UI 核心交互

- **图片列表**：展示所有扫描到的图片，显示文件名、原大小、压缩后大小、节省比例；
- **选择替换**：每张图片提供复选框，用户勾选后点击“应用选中”替换原图；
- **左右对比**：
  - 左侧：原图；
  - 右侧：压缩后的缓存图；
- **局部放大**：
  - 鼠标在左侧或右侧图片上移动时，对应区域放大显示；
  - 左右两张图同步放大位置，方便对比细节；
  - 放大倍数可配置（默认 2x）。

---

## 5. API 设计

### 5.1 扫描图片

```http
POST /api/scan
Content-Type: application/json

{
  "targetDir": "E:/Data/BJTU/NJU1/15.Blog/my-blog/source/_posts/2603-japan"
}
```

响应：

```json
{
  "success": true,
  "data": [
    {
      "id": "a1b2c3d4",
      "path": ".../2603-japan/photo1.jpg",
      "name": "photo1.jpg",
      "format": "jpeg",
      "originalSize": 512000,
      "compressedSize": 128000,
      "savingRatio": 0.75,
      "cachePath": "cache/a1b2c3d4/photo1.jpg",
      "dimensions": { "width": 1920, "height": 1080 }
    }
  ]
}
```

### 5.2 获取压缩预览

```http
GET /api/preview/:id
```

返回压缩后的图片文件。

### 5.3 应用替换

```http
POST /api/replace
Content-Type: application/json

{
  "ids": ["a1b2c3d4", "e5f6g7h8"]
}
```

响应：

```json
{
  "success": true,
  "replaced": ["a1b2c3d4"],
  "failed": []
}
```

### 5.4 撤销替换（可选）

```http
POST /api/revert
Content-Type: application/json

{
  "ids": ["a1b2c3d4"]
}
```

实现方式：替换前将原图备份到 `cache/<hash>/backup/`。

---

## 6. 前端页面设计

### 6.1 布局

```
┌─────────────────────────────────────────────────────────────────┐
│  Image Compressor Tool                              [扫描] [设置]  │
├─────────────────────────────────────────────────────────────────┤
│  目标目录：E:/.../2603-japan                                      │
├──────────────────────┬──────────────────────────────────────────┤
│  图片列表             │  对比区域                                  │
│  ┌────────────────┐  │  ┌──────────────────┬──────────────────┐  │
│  │ photo1.jpg     │  │  │     原图         │    压缩后        │  │
│  │ 500KB → 125KB  │  │  │   [放大镜]       │   [放大镜]       │  │
│  │ [✓]            │  │  │                  │                  │  │
│  ├────────────────┤  │  └──────────────────┴──────────────────┘  │
│  │ photo2.png     │  │                                           │
│  │ 1.2MB → 300KB  │  │  信息：原图 500KB / 压缩后 125KB / 节省 75%  │
│  │ [ ]            │  │                                           │
│  └────────────────┘  │  [应用选中] [撤销]                          │
└──────────────────────┴──────────────────────────────────────────┘
```

### 6.2 局部放大镜实现

- 监听 `mousemove` 事件，计算鼠标在图片上的相对位置 `(x, y)`；
- 对图片容器应用 `transform: scale(var(--zoom))`；
- 设置 `transform-origin: x% y%`；
- 左右两侧图片同步坐标与缩放倍数。

示例 CSS：

```css
.comparison-image {
  transition: transform 0.1s ease;
  transform-origin: var(--origin-x, 50%) var(--origin-y, 50%);
}
.comparison-image.zoomed {
  transform: scale(2);
}
```

---

## 7. 实现阶段

### Phase 1：基础骨架

- 初始化 Node.js 项目；
- 安装 `express`、`sharp`、`glob`、`fs-extra`；
- 搭建 Express 基础服务；
- 创建 `index.html` 静态页面。

### Phase 2：扫描与压缩

- 实现目录扫描；
- 实现基于 Sharp 的压缩核心；
- 实现缓存机制；
- 完成 `/api/scan`、`/api/preview` 接口。

### Phase 3：对比 UI

- 实现图片列表展示；
- 实现左右对比布局；
- 实现局部放大镜与同步；
- 完成图片选中状态管理。

### Phase 4：替换与撤销

- 实现 `/api/replace`；
- 实现替换前备份；
- 实现 `/api/revert`；
- 前端整合“应用选中”与“撤销”按钮。

### Phase 5：优化与测试

- 添加配置文件支持；
- 处理异常与错误提示；
- 可选：SSE 进度推送；
- 可选：批量压缩性能优化。

---

## 8. 关键技术点

### 8.1 Sharp 压缩示例

```javascript
const sharp = require('sharp');

await sharp(inputPath)
  .jpeg({ quality: 80, progressive: true, mozjpeg: true })
  .toFile(outputPath);
```

### 8.2 PNG 压缩示例

```javascript
await sharp(inputPath)
  .png({ quality: 80, compressionLevel: 9, palette: true })
  .toFile(outputPath);
```

### 8.3 文件哈希用于缓存

```javascript
const crypto = require('crypto');
const fs = require('fs');

function getFileHash(path) {
  const buffer = fs.readFileSync(path);
  return crypto.createHash('sha256').update(buffer).digest('hex').slice(0, 16);
}
```

---

## 9. 注意事项

- 压缩前**不要直接覆盖原图**，必须先生成缓存副本；
- 替换原图前**自动备份**到缓存目录，便于撤销；
- AVIF 编码较慢，默认策略中可作为可选项；
- 支持 Windows 路径（`\` 与 `/` 混用需处理）；
- 忽略隐藏目录与版本控制目录。

---

## 10. 后续可扩展方向

- 支持拖拽上传压缩；
- 支持批量导出压缩包；
- 支持自定义输出格式（如统一转 WebP）；
- 支持压缩前后图片尺寸调整（resize）；
- 支持集成到 Hexo 博客构建流程中。
