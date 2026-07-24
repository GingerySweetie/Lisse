# Lisse

一个能续聊老对话的多模型 PWA 客户端喵。

* 自带 ChatGPT / Claude 导出导入（v0.5+）
* 支持任意 OpenAI 兼容 / Anthropic 原生 endpoint（AIHubMix、SiliconFlow、官方、本地 Ollama……）
* 数据全在浏览器本地（IndexedDB），可导出/导入
* 安装到手机主屏幕就是一个 app

## 已经能用的功能

- [x] 多 endpoint 配置（OpenAI / Anthropic 两套协议，自定义 base URL + auth）
- [x] 一键测试 endpoint 连通性
- [x] 多对话 + 侧边栏切换
- [x] 流式输出 + Markdown + 代码高亮
- [x] PWA：手机"添加到主屏幕"即可
- [x] 全部存 IndexedDB，离线打开依然能看历史
- [x] Persona 系统：多人格切换（内置：默认 / 理理酱 / Rhema），system prompt 注入
- [x] 消息分支：编辑用户消息 / 重生成助手消息 → 创建新分支；侧边箭头切换
- [x] ChatGPT / Claude conversations.json 导入（保留 ChatGPT 分支树结构）
- [x] 全量备份 / 恢复（含 endpoints / 人格 / 对话 / 消息 / 记忆 / 设置）
- [x] 单条对话导出（聊天页右上角下载按钮 → Markdown / TXT / JSON）
- [x] 批量对话导出（`/data` 页 → ZIP，可选当前分支或完整树）
- [x] 人格记忆导出为 Markdown（按分类分组）
- [x] **跨对话记忆（D 级）**：每轮对话结束后台抽取事实 → 存入 persona 记忆池 → 下轮按相似度检索 top-K 注入 system prompt。支持手工添加、置顶、归档、按人格隔离。
- [x] **对话中主动记忆管理**：开启工具调用后，模型可按语境调用 `remember` / `recall` / `update_memory` / `forget_memory` 写入、检索、改写或归档记忆（近重复自动合并更新）。

## 还没做的（路线图）

- [ ] 浏览器本地嵌入模型兜底（transformers.js）
- [ ] Prompt caching 命中率监控面板
- [ ] 语音输入（Web Speech API）
- [ ] 暗色主题
- [ ] 多模态：图片/文件附件

## 本地开发

需要 Node 22+ 和 pnpm。

```bash
pnpm install
pnpm dev          # http://localhost:5173
pnpm build        # 出 dist/
pnpm preview      # 本地起一个 dist 的预览
```

## 部署到 Cloudflare Pages（推荐 5 分钟）

仓库已经包含 `wrangler.toml` 和 `public/_headers` / `public/_redirects`，CF Pages 直接连仓库就行：

1. https://dash.cloudflare.com/ → **Workers & Pages** → **Create** → **Pages** → **Connect to Git**
2. 选 `gingerysweetie/lisse` → 分支 `claude/add-missing-feature-kkizk`
3. **Build command**: `pnpm install && pnpm build`
4. **Build output directory**: `dist`
5. 环境变量：`PNPM_VERSION = 10`
6. Save and Deploy

之后每次 push 自动重新部署。手机打开拿到的 URL 就能"添加到主屏幕"。

炼金工房 Cursor Cloud 需要同源反代 `/proxy/cursor`（仓库已带 `functions/proxy/cursor` + `worker/index.ts`）。Pages Git 部署会吃 `functions/`；若用 `wrangler deploy` 则走 Worker。

## 部署到 VPS（nginx）

构建产物完全是静态文件，nginx 直接 serve 就行。

### 1. 构建

```bash
pnpm install
pnpm build
# 产物在 dist/
```

### 2. 上传到 VPS

```bash
# 在本地或 CI 里
rsync -avz --delete dist/ user@rheomorpha.duckdns.org:/var/www/lisse/
```

或者在 VPS 上 `git pull && pnpm install && pnpm build`，然后 `cp -r dist/* /var/www/lisse/`。

### 3. nginx 配置

新建 `/etc/nginx/sites-available/lisse` 大概这样：

```nginx
server {
    listen 443 ssl http2;
    server_name lisse.rheomorpha.duckdns.org;

    ssl_certificate     /etc/letsencrypt/live/rheomorpha.duckdns.org/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/rheomorpha.duckdns.org/privkey.pem;

    root /var/www/lisse;
    index index.html;

    # PWA 需要正确的 MIME types
    types {
        application/manifest+json webmanifest;
        text/cache-manifest        appcache;
    }

    # SPA fallback：所有路由都丢回 index.html
    location / {
        try_files $uri $uri/ /index.html;
    }

    # service worker 不要被中间层缓存
    location = /sw.js {
        add_header Cache-Control "no-cache, no-store, must-revalidate";
        expires 0;
    }
    location = /registerSW.js {
        add_header Cache-Control "no-cache, no-store, must-revalidate";
        expires 0;
    }
    location = /manifest.webmanifest {
        add_header Cache-Control "no-cache";
    }

    # 静态资源用 hash 命名，可以长缓存
    location /assets/ {
        expires 1y;
        add_header Cache-Control "public, immutable";
    }

    # 安全 + PWA header
    add_header X-Content-Type-Options nosniff;
    add_header Referrer-Policy strict-origin-when-cross-origin;
}

server {
    listen 80;
    server_name lisse.rheomorpha.duckdns.org;
    return 301 https://$host$request_uri;
}
```

激活并 reload：

```bash
sudo ln -s /etc/nginx/sites-available/lisse /etc/nginx/sites-enabled/
sudo nginx -t
sudo systemctl reload nginx
```

如果用子域名记得在 DuckDNS / DNS 控制台加上 `lisse.rheomorpha.duckdns.org` 的解析。或者你也可以用 `https://rheomorpha.duckdns.org/lisse/` 这种子路径方式 —— 这样不用配 DNS，但需要在 `vite.config.ts` 里加 `base: '/lisse/'` 重新构建。

### 4. CORS 注意

中转站（AIHubMix / SiliconFlow）从浏览器直接调，需要它们开启 CORS。AIHubMix 据观察默认是允许浏览器调用的（响应头里有 `access-control-allow-origin: *`）。如果遇到 CORS 错误，要么：

- 换用支持 CORS 的中转站
- 或者在你 VPS 上加一层 nginx 反代，把 CORS header 注入进来

反代示例（如果需要）：

```nginx
location /proxy/aihubmix/ {
    proxy_pass https://aihubmix.com/;
    proxy_set_header Host aihubmix.com;
    add_header Access-Control-Allow-Origin "https://lisse.rheomorpha.duckdns.org" always;
    add_header Access-Control-Allow-Headers "Authorization, Content-Type, x-api-key, anthropic-version" always;
    add_header Access-Control-Allow-Methods "POST, OPTIONS" always;
    if ($request_method = OPTIONS) { return 204; }
}

# 炼金工房 Cursor Cloud（Cloudflare 部署已由 worker/index.ts 内置）
location /proxy/cursor/ {
    proxy_pass https://api.cursor.com/;
    proxy_set_header Host api.cursor.com;
    proxy_set_header Authorization $http_authorization;
    proxy_http_version 1.1;
    proxy_buffering off;
    proxy_read_timeout 3600s;
}
```

然后 endpoint 配 `https://lisse.rheomorpha.duckdns.org/proxy/aihubmix/v1`；
Cursor Cloud 的 API Base 填 `/proxy/cursor`。

## 项目结构

```
src/
├── main.tsx              # 入口
├── App.tsx               # 路由
├── index.css             # Tailwind + 主题 token
├── types.ts              # 共享类型
├── db/                   # Dexie 数据层
│   └── index.ts
├── api/                  # 多 provider API client
│   ├── openai.ts         # OpenAI 兼容流式
│   ├── anthropic.ts      # Anthropic 原生流式
│   ├── sse.ts            # SSE parser
│   └── types.ts
├── lib/                  # 业务逻辑
│   ├── chat.ts           # 发消息编排
│   ├── branch.ts         # 分支树遍历
│   ├── id.ts             # nanoid
│   └── format.ts         # 时间格式化
├── components/
│   ├── Layout.tsx
│   ├── Sidebar.tsx
│   ├── MessageBubble.tsx
│   ├── ChatInput.tsx
│   └── EndpointPicker.tsx
└── pages/
    ├── Chat.tsx
    └── Settings.tsx
```

## 数据存哪里

全部在浏览器的 IndexedDB（库名 `lisse`），分四张表：

- `endpoints` — API endpoint 配置（含 API key，明文存）
- `conversations` — 对话元数据
- `messages` — 消息节点（带 `parentId` 形成分支树）
- `kv` — 应用设置（默认 endpoint / 默认模型 / theme）

清浏览器数据 = 全没了。后续会加导出/导入功能。

## License

私人项目，未定。
