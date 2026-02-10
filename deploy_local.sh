#!/bin/bash
# 多人在线猜数字游戏部署脚本

set -e

echo "========================================"
echo "多人在线猜数字游戏 - 部署脚本"
echo "========================================"

# 检查 Python 版本
PYTHON_VERSION=$(python3 --version 2>&1 | awk '{print $2}' | cut -d. -f1,2)
REQUIRED_VERSION="3.6"

if [ "$(printf '%s\n' "$REQUIRED_VERSION" "$PYTHON_VERSION" | sort -V | head -n1)" != "$REQUIRED_VERSION" ]; then 
    echo "错误: 需要 Python 3.6+，当前版本: $PYTHON_VERSION"
    exit 1
fi

echo "✓ Python 版本检查通过: $PYTHON_VERSION"

# 创建虚拟环境（如果不存在）
if [ ! -d "venv" ]; then
    echo "创建虚拟环境..."
    python3 -m venv venv
fi

# 激活虚拟环境
echo "激活虚拟环境..."
source venv/bin/activate

# 安装依赖
echo "安装依赖..."
pip install --upgrade pip
pip install -r requirements_local.txt

echo "✓ 依赖安装完成"

# 检查端口是否被占用
if lsof -Pi :5426 -sTCP:LISTEN -t >/dev/null 2>&1; then
    echo "警告: 端口 5426 已被占用，尝试停止现有进程..."
    lsof -Pi :5426 -sTCP:LISTEN -t | xargs kill -9 2>/dev/null || true
    sleep 2
fi

# 创建 systemd 服务文件（可选）
if [ "$1" == "--service" ]; then
    echo "创建 systemd 服务..."
    
    SERVICE_FILE="/etc/systemd/system/guess-number.service"
    WORKING_DIR=$(pwd)
    
    sudo tee $SERVICE_FILE > /dev/null << EOF
[Unit]
Description=Guess Number Game Server
After=network.target

[Service]
Type=simple
User=$USER
WorkingDirectory=$WORKING_DIR
Environment=PATH=$WORKING_DIR/venv/bin
ExecStart=$WORKING_DIR/venv/bin/python server.py
Restart=always
RestartSec=5

[Install]
WantedBy=multi-user.target
EOF

    sudo systemctl daemon-reload
    sudo systemctl enable guess-number.service
    sudo systemctl start guess-number.service
    
    echo "✓ 服务已创建并启动"
    echo "查看状态: sudo systemctl status guess-number"
    echo "查看日志: sudo journalctl -u guess-number -f"
else
    # 直接启动
    echo ""
    echo "========================================"
    echo "启动服务器..."
    echo "访问地址: http://8.147.57.62:5426"
    echo "========================================"
    echo ""
    
    python server.py
fi
