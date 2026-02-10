# 多人在线猜数字游戏

一个支持多人在线对战的猜数字游戏，使用 Flask + SocketIO 实现实时通信。

## 功能特性

- 🎮 **多人对战**: 支持 1-5 人同时游戏
- 🏠 **房间系统**: 创建房间、加入房间、房间列表
- 🎯 **两种游戏模式**:
  - 自由模式: 各自猜测，先猜对者获胜
  - 轮次模式: 轮流猜测，每人一轮
- ⚙️ **灵活设置**: 数字位数(3-8)、是否包含0、是否允许重复、时间限制
- 💬 **实时聊天**: 房间内公屏聊天
- 📊 **进度显示**: 实时显示其他玩家的猜测进度
- 🔄 **断线重连**: 支持断线后重新连接
- 👑 **房主继承**: 房主离开后自动继承

## 服务器信息

- **IP**: 8.147.57.62
- **端口**: 5426
- **访问地址**: http://8.147.57.62:5426

## 快速部署

### 方式一：直接运行

```bash
cd /path/to/guess_number
chmod +x deploy.sh
./deploy.sh
```

### 方式二：作为系统服务运行

```bash
./deploy.sh --service
```

服务管理命令：
```bash
# 查看状态
sudo systemctl status guess-number

# 停止服务
sudo systemctl stop guess-number

# 重启服务
sudo systemctl restart guess-number

# 查看日志
sudo journalctl -u guess-number -f
```

### 手动部署

1. 安装依赖：
```bash
python3 -m venv venv
source venv/bin/activate
pip install -r requirements.txt
```

2. 启动服务器：
```bash
python server.py
```

## 项目结构

```
guess_number/
├── server.py           # Flask + SocketIO 服务端
├── requirements.txt    # Python 依赖
├── deploy.sh           # 部署脚本
├── README.md           # 说明文档
├── static/
│   └── game.js         # 前端游戏逻辑
└── templates/
    └── index.html      # 主页面
```

## 游戏规则

1. **设置用户名**: 进入游戏后先设置用户名（最多5个字符）
2. **创建/加入房间**: 
   - 创建房间：设置人数、位数、游戏模式等选项
   - 加入房间：从房间列表选择一个房间加入
3. **准备**: 多人模式下需要点击"准备"按钮
4. **开始游戏**: 房主点击"开始游戏"
5. **猜测数字**:
   - 根据房间设置猜测数字
   - 系统会提示匹配位数（位置正确的数字个数）
   - 自由模式下可随时猜测
   - 轮次模式下需等待轮到自己
6. **获胜**: 第一个猜对全部数字位置的玩家获胜

## 技术栈

- **后端**: Python 3.6+, Flask, Flask-SocketIO, Eventlet
- **前端**: HTML5, Tailwind CSS, Socket.IO Client
- **通信**: WebSocket (Socket.IO)

## 配置说明

服务器配置在 `server.py` 中：

```python
ROOM_CLEANUP_DELAY = 120  # 空房间清理延迟（秒）
PORT = 5426               # 服务端口
```

## 注意事项

1. 确保服务器防火墙开放 5426 端口
2. 建议使用现代浏览器访问（Chrome, Firefox, Safari, Edge）
3. 长时间未操作的空房间会被自动清理

## 更新日志

### v1.0.0
- 初始版本发布
- 支持多人对战
- 支持自由模式和轮次模式
- 支持实时聊天
- 支持断线重连
