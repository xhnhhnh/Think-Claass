# syntax=docker/dockerfile:1

# Think-Class 生产镜像（微信云托管 / 任意容器平台）
#
# 构建（在仓库根目录执行，上下文 = 仓库根目录）：
#     docker build -f deploy/Dockerfile -t think-class:local .
#
# 这个镜像刻意是**单阶段**的，理由有两条，都是这个仓库的具体事实：
#
#   1. `npm run start` 就是 `tsx api/server.ts`（package.json），而 `tsx` 是 devDependency。
#      所以运行时必须保留一份完整的 node_modules，`npm ci --omit=dev` 装出来的镜像根本起不来。
#   2. `better-sqlite3` 是原生模块。预编译包下载失败时 npm 会退回 node-gyp 现场编译，
#      那就需要 python3 / make / g++。装在这里比在构建阶段里"用完就删"少一类故障，
#      代价是镜像大一些 —— 这个取舍是明确的。
#
# 与 `scripts/deploy-common.sh` 的安装步骤保持一致：
#   `install_project_dependencies()` = `npm install` + `npx prisma generate --schema prisma/schema.prisma`。
# 镜像里也一样，只是用 `npm ci`（有 package-lock.json 时才可复现）。

FROM node:24-slim

# node:24-slim 只有运行时。better-sqlite3 的编译链 + openssl（生成 ENCRYPTION_KEY 用，
# `install.sh` 在没有 node 时也是退到 openssl rand -hex 16）。
RUN apt-get update \
    && apt-get install -y --no-install-recommends python3 make g++ openssl ca-certificates \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# 先只拷清单文件，让依赖层可以被缓存：改源码不会重新装依赖。
COPY package.json package-lock.json ./

# `--include=dev` 是故意的，不是笔误：
#   * `tsx`（运行时）和 `prisma`（CLI）都在 devDependencies 里；
#   * 有些平台在构建阶段就注入了 NODE_ENV=production，那样 npm 会静默跳过 devDependencies，
#     镜像构建成功、容器启动即报 "tsx: not found"。
RUN npm ci --include=dev

# 运行需要的全部内容：api/（服务入口）、packages/（kernel 与插件运行时）、plugins/（业务域）、
# prisma/（schema）、dist/（前端构建产物在下面自己生成）、tsconfig.json（tsx 靠它的 paths 解析
# `@thinkclass/*`，缺了它启动就找不到包）。
COPY . .

# Prisma Client 生成与前端构建。`dist/` 是本镜像自己构建的，不从宿主机拷
# （`api/app.ts` 用 `path.join(__dirname, '../dist')` 提供静态文件，没有 dist 首页就是 404）。
RUN npx prisma generate --schema prisma/schema.prisma \
    && npm run build

# `/app/uploads` 指向 `/data/uploads` 的符号链接，是为了让"只挂一个持久卷"就够用：
#   * 上传目录在实际运行中固定解析到 `<cwd>/uploads`（`api/app.ts:86` 提供静态服务，
#     `plugins/homework`、`plugins/learning` 写文件也用 `process.cwd()`），它不读 `UPLOADS_DIR`；
#   * 数据库用 `DATABASE_FILE=/data/database.sqlite` 落到同一个挂载卷上。
# 于是 CFS 挂到 `/data` 就够了，照片和数据库都在持久存储里。不挂卷时它也照常工作
# （文件写进容器可写层，只是不持久）。若你把 CFS 直接挂到 `/app/uploads`，这个链接会被挂载覆盖，
# 同样可用 —— 两种都行，见 docs/wechat/10-deploy-cloudrun.md。
#
# 目标目录 `/data/uploads` 在这里一并建出来：符号链接指向一个不存在的目录时，第一条写入会以
# ENOENT 失败，而那时应用已经在跑了 —— 让它在镜像里就存在，故障就少一个。
RUN mkdir -p /data/uploads \
    && rm -rf /app/uploads \
    && ln -s /data/uploads /app/uploads

# 容器里保持 root（node:24-slim 的默认用户）：CFS 挂载点的属主由云托管决定，
# 换成非 root 就要自己 chown 挂载点，多一个会静默失败的地方。
ENV NODE_ENV=production \
    PORT=3001

# 不要设 THINK_CLASS_ROOT。默认值就是 `process.cwd()`（= /app），而上传目录按 cwd 解析、
# 数据库/静态目录按 THINK_CLASS_ROOT 解析；把两者指到不同目录会让「照片写进去了但访问 404」。
# DATABASE_FILE / UPLOADS_DIR 由平台环境变量注入，见 docs/wechat/10-deploy-cloudrun.md。

EXPOSE 3001

# 健康检查打 `GET /api/health`（kernel 路由，两种组合下都提供，返回
# `{"success":true,"kernel":{"plugins":{"total":N,"active":N}}}`）。
# 用 node 自带 fetch，省掉镜像里的 curl。start-period 给足，因为首次启动要跑迁移建表。
HEALTHCHECK --interval=30s --timeout=5s --start-period=60s --retries=3 \
    CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||3001)+'/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

# 与 install.sh 的 PM2 启动方式一致（`pm2 start npm --name think-class -- run start`）。
# 停止容器时 Docker 把 SIGTERM 发给 PID 1 的 npm，npm 会转发给子进程；`api/server.ts` 注册了
# SIGTERM/SIGINT 做优雅关闭。若发现关闭时没有走优雅流程，把这条换成
# CMD ["npx","tsx","api/server.ts"] 即可（同一个入口，少一层 npm）。
CMD ["npm", "run", "start"]
