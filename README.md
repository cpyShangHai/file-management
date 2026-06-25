# 文件管理系统

轻量级桌面文件管理器，基于 **Vue 3 + Electron** 构建，支持本地文件浏览与 **FTP / SFTP** 远程连接，提供接近系统原生文件管理器的使用体验。

[English](README.en.md)

## 功能特性

### 本地文件管理

- 浏览、搜索、前进 / 后退 / 上级目录导航
- 列表视图与网格视图切换
- 新建文件夹 / 文件、重命名、删除、复制、剪切、粘贴、复制副本
- 拖拽导入外部文件、跨目录拖放移动
- 文本与图片文件内置预览
- 快捷访问：主目录、桌面、文档、下载、图片、音乐、视频
- 在 Finder / 资源管理器中显示、用系统默认应用打开、在终端中打开
- 复制路径 / 文件名到剪贴板

### 远程文件管理

- 支持 **FTP** 与 **SFTP** 协议
- 保存连接配置，可选加密存储密码（依赖系统密钥链）
- FTP 文件名编码切换（GBK、GB18030、UTF-8、Big5、Latin-1）
- 远程文件浏览、下载，支持下载进度与取消
- 本地与远程之间拖放传输

## 技术栈

| 层级 | 技术 |
|------|------|
| 前端 | Vue 3、Vite、原生 CSS |
| 桌面 | Electron 33 |
| 远程 | basic-ftp、ssh2-sftp-client、iconv-lite |
| 打包 | electron-builder |

## 项目结构

```
file-management-system/
├── desktop/              # Electron 主进程
│   ├── main.js           # 窗口与应用入口
│   ├── launch.js         # 启动脚本
│   ├── preload.js        # 预加载桥接
│   ├── ipc-handlers.js   # 本地文件 IPC 处理
│   ├── remote-fs.js      # FTP / SFTP 远程文件系统
│   ├── ftp-encoding.js   # FTP 编码处理
│   └── credential-store.js  # 密码加密存储
├── src/                  # Vue 前端
│   ├── App.vue
│   ├── components/       # UI 组件
│   └── composables/      # 业务逻辑（文件管理、远程连接、拖放等）
├── build/                # 应用图标等资源
└── release/              # 打包输出目录
```

## 环境要求

- Node.js 18+
- npm 9+

## 安装与开发

```bash
# 克隆仓库
git clone <仓库地址>
cd file-management-system

# 安装依赖
npm install

# 启动开发模式（Vite 热更新 + Electron）
npm run dev
```

## 构建与发布

```bash
# 构建前端并启动生产模式
npm start

# 仅构建 Web 资源
npm run build:web

# 打包桌面应用（当前平台）
npm run build

# 打包 macOS 安装包（dmg / zip）
npm run build:mac

# 打包 Windows 安装包（nsis）
npm run build:win
```

打包产物输出至 `release/` 目录。

## 使用说明

### 基本操作

1. 启动应用后，侧边栏可快速跳转到常用目录。
2. 单击选中文件或文件夹，双击打开文件夹或用系统默认程序打开文件。
3. 右键菜单提供新建、重命名、删除、复制、剪切、粘贴等操作。
4. 工具栏支持搜索过滤、切换列表 / 网格视图、前进后退导航。
5. 选中支持的文本或图片文件时，右侧可预览内容。

### 远程连接

1. 点击侧边栏「添加远程连接」。
2. 填写连接名称、协议（FTP / SFTP）、主机、端口、用户名与密码。
3. 连接成功后，远程目录会出现在侧边栏，可像本地目录一样浏览。
4. 若 FTP 中文文件名乱码，可在连接设置中切换编码（如 GBK）。

### 快捷键

| 快捷键 | 功能 |
|--------|------|
| `Cmd/Ctrl + A` | 全选 |
| `Cmd/Ctrl + C` | 复制选中项 |
| `Cmd/Ctrl + Alt + C` | 复制路径 |
| `Cmd/Ctrl + X` | 剪切 |
| `Cmd/Ctrl + V` | 粘贴 |
| `Cmd/Ctrl + N` | 新建文件 |
| `Cmd/Ctrl + Shift + N` | 新建文件夹 |
| `Cmd/Ctrl + Shift + M` | 移动到… |
| `Cmd/Ctrl + Shift + D` | 复制到… |
| `Cmd/Ctrl + Shift + T` | 在终端中打开（仅本地） |
| `Cmd/Ctrl + R` | 刷新 / 在 Finder 中显示 |
| `Backspace` | 返回上级目录 |
| `Delete` / `Cmd + Backspace` | 删除选中项 |
| `F2` | 重命名 |
| `Enter` | 打开 |
| `Esc` | 关闭预览 / 取消选择 |

## 参与贡献

1. Fork 本仓库
2. 新建功能分支（如 `feat/xxx`）
3. 提交代码
4. 发起 Pull Request

## 许可证

本项目为原创作品，版权归作者所有。
