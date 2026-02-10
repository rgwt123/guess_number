/**
 * 多人在线猜数字游戏 - 前端逻辑
 */

// ==================== 全局状态 ====================
const gameState = {
    socket: null,
    mySid: null,
    myName: '',
    roomId: null,
    room: null,
    isHost: false,
    isReady: false,
    settings: null,
    myGuesses: [],
    gameStatus: 'waiting', // waiting, playing, finished
    reconnectAttempts: 0,
    maxReconnectAttempts: 5,
    timerInterval: null,
    timeLeft: 0
};

// ==================== DOM 元素 ====================
const elements = {
    // 状态指示器
    statusIndicator: document.getElementById('status-indicator'),
    
    // 面板
    namePanel: document.getElementById('name-panel'),
    lobbyPanel: document.getElementById('lobby-panel'),
    roomPanel: document.getElementById('room-panel'),
    gamePanel: document.getElementById('game-panel'),
    resultPanel: document.getElementById('result-panel'),
    
    // 用户名设置
    usernameInput: document.getElementById('username-input'),
    setNameBtn: document.getElementById('set-name-btn'),
    
    // 创建房间表单
    createRoomForm: document.getElementById('create-room-form'),
    createMaxPlayers: document.getElementById('create-max-players'),
    createMaxPlayersValue: document.getElementById('create-max-players-value'),
    createDigitCount: document.getElementById('create-digit-count'),
    createDigitCountValue: document.getElementById('create-digit-count-value'),
    createIncludeZero: document.getElementById('create-include-zero'),
    createAllowRepeat: document.getElementById('create-allow-repeat'),
    createGameMode: document.getElementById('create-game-mode'),
    createTimeLimit: document.getElementById('create-time-limit'),
    createTimeLimitValue: document.getElementById('create-time-limit-value'),
    timeLimitContainer: document.getElementById('time-limit-container'),
    
    // 房间列表
    refreshRoomsBtn: document.getElementById('refresh-rooms-btn'),
    roomList: document.getElementById('room-list'),
    
    // 房间面板
    roomIdDisplay: document.getElementById('room-id-display'),
    playerList: document.getElementById('player-list'),
    readyBtn: document.getElementById('ready-btn'),
    startGameBtn: document.getElementById('start-game-btn'),
    leaveRoomBtn: document.getElementById('leave-room-btn'),
    roomSettingsInfo: document.getElementById('room-settings-info'),
    chatContainer: document.getElementById('chat-container'),
    chatForm: document.getElementById('chat-form'),
    chatInput: document.getElementById('chat-input'),
    
    // 游戏面板
    gamePlayerList: document.getElementById('game-player-list'),
    gameModeDisplay: document.getElementById('game-mode-display'),
    turnIndicator: document.getElementById('turn-indicator'),
    timerContainer: document.getElementById('timer-container'),
    timerDisplay: document.getElementById('timer-display'),
    gameRules: document.getElementById('game-rules'),
    gameGuessForm: document.getElementById('game-guess-form'),
    gameGuessInput: document.getElementById('game-guess-input'),
    gameGuessError: document.getElementById('game-guess-error'),
    myHistory: document.getElementById('my-history'),
    gameChatContainer: document.getElementById('game-chat-container'),
    gameChatForm: document.getElementById('game-chat-form'),
    gameChatInput: document.getElementById('game-chat-input'),
    
    // 结果面板
    resultAnswer: document.getElementById('result-answer'),
    resultList: document.getElementById('result-list'),
    playAgainBtn: document.getElementById('play-again-btn'),
    backToLobbyBtn: document.getElementById('back-to-lobby-btn')
};

// ==================== Socket.IO 连接 ====================
function initSocket() {
    // 检测服务器地址
    const serverUrl = window.location.origin;
    
    gameState.socket = io(serverUrl, {
        transports: ['websocket', 'polling'],
        reconnection: true,
        reconnectionAttempts: gameState.maxReconnectAttempts,
        reconnectionDelay: 1000
    });
    
    // 连接事件
    gameState.socket.on('connect', () => {
        console.log('已连接到服务器');
        updateConnectionStatus('connected');
        gameState.mySid = gameState.socket.id;
        
        // 尝试重连
        if (gameState.reconnectAttempts > 0 && gameState.roomId) {
            attemptReconnect();
        }
    });
    
    gameState.socket.on('disconnect', () => {
        console.log('与服务器断开连接');
        updateConnectionStatus('disconnected');
    });
    
    gameState.socket.on('connect_error', (error) => {
        console.error('连接错误:', error);
        updateConnectionStatus('error');
        gameState.reconnectAttempts++;
    });
    
    // 服务器事件处理
    setupSocketListeners();
}

function updateConnectionStatus(status) {
    const indicator = elements.statusIndicator;
    if (status === 'connected') {
        indicator.className = 'inline-flex items-center px-3 py-1 rounded-full text-xs font-medium bg-green-100 text-green-800';
        indicator.innerHTML = '<span class="w-2 h-2 bg-green-500 rounded-full mr-2"></span>已连接';
    } else if (status === 'disconnected') {
        indicator.className = 'inline-flex items-center px-3 py-1 rounded-full text-xs font-medium bg-red-100 text-red-800';
        indicator.innerHTML = '<span class="w-2 h-2 bg-red-500 rounded-full mr-2 animate-pulse"></span>已断开';
    } else {
        indicator.className = 'inline-flex items-center px-3 py-1 rounded-full text-xs font-medium bg-yellow-100 text-yellow-800';
        indicator.innerHTML = '<span class="w-2 h-2 bg-yellow-500 rounded-full mr-2 animate-pulse"></span>连接中...';
    }
}

function attemptReconnect() {
    console.log('尝试重连...');
    gameState.socket.emit('reconnect_attempt', {
        oldSid: gameState.mySid,
        roomId: gameState.roomId
    });
}

// ==================== Socket 事件监听 ====================
function setupSocketListeners() {
    // 连接确认
    gameState.socket.on('connected', (data) => {
        gameState.mySid = data.sid;
    });
    
    // 错误消息
    gameState.socket.on('error', (data) => {
        showError(data.message);
    });
    
    // 用户名设置成功
    gameState.socket.on('name_set', (data) => {
        gameState.myName = data.name;
        showPanel('lobby');
        addSystemMessage(`欢迎，${data.name}！`);
    });
    
    // 房间列表更新
    gameState.socket.on('room_list_update', (data) => {
        updateRoomList(data);
    });
    
    // 房间创建成功
    gameState.socket.on('room_created', (data) => {
        enterRoom(data.room);
    });
    
    // 加入房间成功
    gameState.socket.on('room_joined', (data) => {
        enterRoom(data.room);
    });
    
    // 离开房间
    gameState.socket.on('left_room', () => {
        gameState.roomId = null;
        gameState.room = null;
        gameState.isHost = false;
        gameState.isReady = false;
        showPanel('lobby');
        clearChat();
    });
    
    // 玩家加入
    gameState.socket.on('player_joined', (data) => {
        addSystemMessage(`${data.player.name} 加入了房间`);
    });
    
    // 玩家离开
    gameState.socket.on('player_left', (data) => {
        const player = gameState.room?.players.find(p => p.sid === data.sid);
        if (player) {
            addSystemMessage(`${player.name} 离开了房间`);
        }
    });
    
    // 玩家离线
    gameState.socket.on('player_offline', (data) => {
        addSystemMessage(`${data.name} 离线了`);
    });
    
    // 玩家上线
    gameState.socket.on('player_online', (data) => {
        addSystemMessage(`${data.name} 重新上线了`);
    });
    
    // 房主变更
    gameState.socket.on('host_changed', (data) => {
        addSystemMessage(`${data.new_host_name} 成为新房主`);
        if (data.new_host === gameState.mySid) {
            gameState.isHost = true;
            updateRoomButtons();
        }
    });
    
    // 玩家列表更新
    gameState.socket.on('player_list_update', (data) => {
        if (gameState.room) {
            gameState.room.players = data.players;
            updatePlayerList();
            updateGamePlayerList();
        }
    });
    
    // 准备状态切换
    gameState.socket.on('ready_toggled', (data) => {
        gameState.isReady = data.ready;
        updateReadyButton();
        // 同时更新结果面板的按钮（如果当前在结果面板）
        if (gameState.gameStatus === 'finished' && !gameState.isHost) {
            if (data.ready) {
                elements.playAgainBtn.innerHTML = '<i class="fa fa-check mr-2"></i> 已准备';
                elements.playAgainBtn.classList.remove('bg-secondary', 'hover:bg-green-600');
                elements.playAgainBtn.classList.add('bg-gray-500');
            } else {
                elements.playAgainBtn.innerHTML = '<i class="fa fa-check mr-2"></i> 准备';
                elements.playAgainBtn.classList.add('bg-secondary', 'hover:bg-green-600');
                elements.playAgainBtn.classList.remove('bg-gray-500');
            }
        }
    });
    
    // 游戏开始
    gameState.socket.on('game_started', (data) => {
        gameState.settings = data.settings;
        gameState.gameStatus = 'playing';
        gameState.myGuesses = [];
        gameState.room = data.room;
        startGame();
    });
    
    // 猜测结果
    gameState.socket.on('guess_result', (data) => {
        handleGuessResult(data);
    });
    
    // 游戏结束
    gameState.socket.on('game_finished', (data) => {
        console.log('game_finished 收到:', data);
        gameState.gameStatus = 'finished';
        stopTimer();
        elements.timerContainer.classList.add('hidden');
        
        // 如果有人退出导致游戏结束，显示提示并自动返回房间
        if (data.reason === 'player_left') {
            console.log('玩家退出导致游戏结束，切换到房间界面');
            addGameChatMessage('系统', `${data.left_player} 退出游戏，游戏结束`, true);
            
            // 先切换界面，再显示alert
            showPanel('room');
            console.log('已调用 showPanel(room)');
            
            // 更新房间状态
            if (data.room) {
                gameState.room = data.room;
                gameState.roomId = data.room.id;
                gameState.room.status = 'waiting';
                gameState.isHost = data.room.host === gameState.mySid;
                gameState.isReady = false;
                elements.roomIdDisplay.textContent = `房间号: ${data.room.id}`;
                updatePlayerList();
                updateRoomButtons();
            }
            
            // 清空游戏相关状态
            gameState.myGuesses = [];
            
            // 显示提示
            setTimeout(() => {
                alert(`${data.left_player} 退出了游戏，游戏结束！\n正确答案是: ${data.answer}`);
            }, 100);
        } else {
            showGameResult(data);
        }
    });
    
    // 聊天消息
    gameState.socket.on('chat_message', (data) => {
        addChatMessage(data.name, data.message, data.name === gameState.myName);
    });
    
    // 回合切换（轮次模式）
    gameState.socket.on('turn_changed', (data) => {
        console.log('收到 turn_changed:', data);
        gameState.room.current_turn = data.current_turn;
        updateTurnIndicator();
        addGameChatMessage('系统', `轮到 ${data.current_turn_name} 猜测`, true);
        // 使用服务器发送的时间重置计时器
        if (data.time_limit > 0) {
            console.log('重置计时器:', data.time_limit, '秒');
            resetTimerWithTime(data.time_limit);
        } else {
            stopTimer();
            elements.timerContainer.classList.add('hidden');
        }
    });
    
    // 重连成功
    gameState.socket.on('reconnect_success', (data) => {
        console.log('重连成功');
        gameState.reconnectAttempts = 0;
        gameState.mySid = gameState.socket.id;
        enterRoom(data.room);
        
        // 恢复游戏状态
        if (data.room.status === 'playing') {
            gameState.settings = data.room.settings;
            gameState.gameStatus = 'playing';
            startGame();
        } else if (data.room.status === 'finished') {
            showPanel('room');
        }
    });
    
    // 重连失败
    gameState.socket.on('reconnect_failed', () => {
        console.log('重连失败');
        showError('重连失败，请重新加入房间');
        gameState.roomId = null;
        gameState.room = null;
        showPanel('lobby');
    });
}

// ==================== 面板切换 ====================
function showPanel(panelName) {
    // 隐藏所有面板
    elements.namePanel.classList.add('hidden');
    elements.lobbyPanel.classList.add('hidden');
    elements.roomPanel.classList.add('hidden');
    elements.gamePanel.classList.add('hidden');
    elements.resultPanel.classList.add('hidden');
    
    // 显示指定面板
    switch(panelName) {
        case 'name':
            elements.namePanel.classList.remove('hidden');
            break;
        case 'lobby':
            elements.lobbyPanel.classList.remove('hidden');
            gameState.socket.emit('get_room_list');
            break;
        case 'room':
            elements.roomPanel.classList.remove('hidden');
            break;
        case 'game':
            elements.gamePanel.classList.remove('hidden');
            break;
        case 'result':
            elements.resultPanel.classList.remove('hidden');
            break;
    }
}

// ==================== 用户名设置 ====================
function handleSetName() {
    const name = elements.usernameInput.value.trim();
    if (!name) {
        showError('请输入用户名');
        return;
    }
    if (name.length > 5) {
        showError('用户名不能超过5个字符');
        return;
    }
    gameState.socket.emit('set_name', { name });
}

// ==================== 房间列表 ====================
function updateRoomList(rooms) {
    if (rooms.length === 0) {
        elements.roomList.innerHTML = '<p class="text-gray-500 text-center py-8">暂无可用房间</p>';
        return;
    }
    
    elements.roomList.innerHTML = rooms.map(room => `
        <div class="bg-gray-50 rounded-lg p-3 flex justify-between items-center hover:bg-gray-100 transition-colors">
            <div>
                <div class="font-medium text-dark">房间 ${room.id}</div>
                <div class="text-xs text-gray-500">
                    房主: ${room.host_name} | 
                    ${room.player_count}/${room.max_players}人 | 
                    ${room.settings.digit_count}位 | 
                    ${room.settings.game_mode === 'free' ? '自由' : '轮次'}模式
                </div>
            </div>
            <button onclick="joinRoom('${room.id}')" 
                class="bg-primary hover:bg-blue-600 text-white text-sm font-bold py-1 px-3 rounded btn-hover">
                加入
            </button>
        </div>
    `).join('');
}

function joinRoom(roomId) {
    gameState.socket.emit('join_room', { room_id: roomId });
}

// ==================== 创建房间 ====================
function handleCreateRoom(e) {
    e.preventDefault();
    
    const settings = {
        max_players: parseInt(elements.createMaxPlayers.value),
        digit_count: parseInt(elements.createDigitCount.value),
        include_zero: elements.createIncludeZero.checked,
        allow_repeat: elements.createAllowRepeat.checked,
        game_mode: elements.createGameMode.value,
        time_limit: parseInt(elements.createTimeLimit.value)
    };
    
    gameState.socket.emit('create_room', settings);
}

// ==================== 房间逻辑 ====================
function enterRoom(room) {
    gameState.roomId = room.id;
    gameState.room = room;
    gameState.isHost = room.host === gameState.mySid;
    gameState.isReady = false;
    gameState.settings = room.settings;
    
    elements.roomIdDisplay.textContent = `房间号: ${room.id}`;
    
    // 更新房间设置显示
    const timeText = room.settings.time_limit === 0 ? '不限时' : `${room.settings.time_limit}秒`;
    elements.roomSettingsInfo.innerHTML = `
        <div><span class="font-medium">人数:</span> 1-${room.settings.max_players}人</div>
        <div><span class="font-medium">位数:</span> ${room.settings.digit_count}位</div>
        <div><span class="font-medium">包含0:</span> ${room.settings.include_zero ? '是' : '否'}</div>
        <div><span class="font-medium">允许重复:</span> ${room.settings.allow_repeat ? '是' : '否'}</div>
        <div><span class="font-medium">模式:</span> ${room.settings.game_mode === 'free' ? '自由模式' : '轮次模式'}</div>
        <div><span class="font-medium">时间限制:</span> ${timeText}</div>
    `;
    
    updatePlayerList();
    updateRoomButtons();
    showPanel('room');
    
    // 加载聊天历史
    loadChatHistory(room.chat_history);
}

function updatePlayerList() {
    if (!gameState.room) return;
    
    elements.playerList.innerHTML = gameState.room.players.map(player => `
        <div class="player-card ${player.online === false ? 'offline' : ''} ${!player.is_host && player.ready ? 'ring-2 ring-green-400' : ''}">
            <div class="flex justify-between items-center">
                <div class="flex items-center">
                    <span class="font-medium ${player.sid === gameState.mySid ? 'text-primary' : ''}">
                        ${player.name} ${player.sid === gameState.mySid ? '(我)' : ''}
                    </span>
                    ${player.is_host ? '<span class="ml-2 text-xs bg-yellow-100 text-yellow-700 px-1 rounded">房主</span>' : ''}
                </div>
                <div class="flex items-center space-x-2">
                    ${player.online === false ? '<span class="text-xs text-gray-400">离线</span>' : ''}
                    ${player.is_host 
                        ? '<span class="text-xs text-yellow-600">房主</span>' 
                        : (player.ready ? '<i class="fa fa-check text-green-500"></i>' : '<i class="fa fa-hourglass-o text-gray-400"></i>')}
                </div>
            </div>
        </div>
    `).join('');
}

function updateRoomButtons() {
    const playerCount = gameState.room.players.length;
    
    if (gameState.isHost) {
        elements.readyBtn.classList.add('hidden');
        elements.startGameBtn.classList.remove('hidden');
        
        // 检查是否都能开始
        if (playerCount === 1) {
            elements.startGameBtn.disabled = false;
            elements.startGameBtn.classList.remove('opacity-50', 'cursor-not-allowed');
        } else {
            const allReady = gameState.room.players.every(p => p.ready || p.sid === gameState.mySid);
            if (allReady) {
                elements.startGameBtn.disabled = false;
                elements.startGameBtn.classList.remove('opacity-50', 'cursor-not-allowed');
            } else {
                elements.startGameBtn.disabled = true;
                elements.startGameBtn.classList.add('opacity-50', 'cursor-not-allowed');
            }
        }
    } else {
        elements.readyBtn.classList.remove('hidden');
        elements.startGameBtn.classList.add('hidden');
        updateReadyButton();
    }
}

function updateReadyButton() {
    if (gameState.isReady) {
        elements.readyBtn.innerHTML = '<i class="fa fa-times mr-2"></i> 取消准备';
        elements.readyBtn.classList.remove('bg-accent', 'hover:bg-yellow-600');
        elements.readyBtn.classList.add('bg-gray-500', 'hover:bg-gray-600');
    } else {
        elements.readyBtn.innerHTML = '<i class="fa fa-check mr-2"></i> 准备';
        elements.readyBtn.classList.add('bg-accent', 'hover:bg-yellow-600');
        elements.readyBtn.classList.remove('bg-gray-500', 'hover:bg-gray-600');
    }
}

function handleToggleReady() {
    gameState.socket.emit('toggle_ready');
}

function handleStartGame() {
    gameState.socket.emit('start_game');
}

function handleLeaveRoom() {
    gameState.socket.emit('leave_room');
}

// ==================== 游戏逻辑 ====================
function startGame() {
    showPanel('game');
    
    const modeText = gameState.settings.game_mode === 'free' ? '自由模式' : '轮次模式';
    const timeText = gameState.settings.time_limit === 0 ? '不限时' : `${gameState.settings.time_limit}秒`;
    elements.gameModeDisplay.textContent = `${modeText} | ${gameState.settings.digit_count}位 | ${timeText}`;
    
    // 设置输入框
    elements.gameGuessInput.maxLength = gameState.settings.digit_count;
    elements.gameGuessInput.placeholder = `输入${gameState.settings.digit_count}位数字`;
    
    // 清空历史
    elements.myHistory.innerHTML = '<p class="text-gray-500 text-sm italic text-center py-4">还没有猜测记录</p>';
    elements.gameGuessError.classList.add('hidden');

    // 显示游戏规则
    const rules = [];
    rules.push(`<span class="font-medium text-blue-700">${gameState.settings.digit_count}位数字</span>`);
    rules.push(gameState.settings.include_zero ? '包含0-9' : '不含0 (1-9)');
    rules.push(gameState.settings.allow_repeat ? '数字可重复' : '数字不重复');
    rules.push(gameState.settings.game_mode === 'free' ? '自由模式: 各自猜测' : '轮次模式: 轮流猜测');
    if (gameState.settings.game_mode === 'turn' && gameState.settings.time_limit > 0) {
        rules.push(`限时${gameState.settings.time_limit}秒`);
    }
    elements.gameRules.innerHTML = rules.join(' | ');

    // 初始化倒计时
    initTimer();
    
    updateGamePlayerList();
    updateTurnIndicator();
}

// ==================== 倒计时功能 ====================

function initTimer() {
    // 清除之前的计时器（多次确保清除干净）
    stopTimer();
    if (gameState.timerInterval) {
        clearInterval(gameState.timerInterval);
        gameState.timerInterval = null;
    }

    // 重置时间显示
    gameState.timeLeft = gameState.settings.time_limit;
    updateTimerDisplay();

    // 只在轮次模式且有限时的情况下显示
    if (gameState.settings.game_mode === 'turn' && gameState.settings.time_limit > 0) {
        elements.timerContainer.classList.remove('hidden');
        startTimer(gameState.settings.time_limit);
    } else {
        elements.timerContainer.classList.add('hidden');
    }
}

function startTimer(seconds) {
    console.log('startTimer 被调用，设置时间:', seconds);
    // 如果已有计时器在运行，先停止
    if (gameState.timerInterval) {
        console.log('发现已有计时器，先停止');
        stopTimer();
    }
    gameState.timeLeft = seconds;
    updateTimerDisplay();
    console.log('计时器已启动，当前剩余:', gameState.timeLeft);

    gameState.timerInterval = setInterval(() => {
        gameState.timeLeft--;
        console.log('计时器tick，剩余:', gameState.timeLeft);
        updateTimerDisplay();

        if (gameState.timeLeft <= 0) {
            console.log('计时器到期');
            stopTimer();
            // 超时自动提交空答案（仅当前回合玩家）
            if (gameState.room.current_turn === gameState.mySid) {
                console.log('当前是我的回合，执行超时提交');
                handleTimeoutSubmit();
            }
        }
    }, 1000);
}

function stopTimer() {
    if (gameState.timerInterval) {
        clearInterval(gameState.timerInterval);
        gameState.timerInterval = null;
    }
}

function updateTimerDisplay() {
    elements.timerDisplay.textContent = gameState.timeLeft;
    
    // 时间少于5秒时变红并闪烁
    if (gameState.timeLeft <= 5) {
        elements.timerContainer.querySelector('div').classList.add('animate-pulse', 'bg-red-100');
        elements.timerContainer.querySelector('div').classList.remove('bg-red-50');
    } else {
        elements.timerContainer.querySelector('div').classList.remove('animate-pulse', 'bg-red-100');
        elements.timerContainer.querySelector('div').classList.add('bg-red-50');
    }
}

function handleTimeoutSubmit() {
    // 前端计时器到期，只显示提示，不发送请求
    // 服务器端的计时器会处理超时逻辑并广播结果
    console.log('前端计时器到期，等待服务器处理');
    addGameChatMessage('系统', '时间到！等待服务器处理...', true);
}

function resetTimerWithTime(seconds) {
    console.log('resetTimerWithTime 被调用:', seconds, '秒');
    // 使用指定时间重置计时器（服务器同步）
    // 先确保完全停止之前的计时器
    stopTimer();
    if (gameState.timerInterval) {
        clearInterval(gameState.timerInterval);
        gameState.timerInterval = null;
    }
    // 显示并启动新计时器
    elements.timerContainer.classList.remove('hidden');
    gameState.timeLeft = seconds;
    updateTimerDisplay();
    console.log('启动计时器，剩余时间:', gameState.timeLeft);
    startTimer(seconds);
}

function resetTimer() {
    // 重置计时器（轮到新的人时调用）
    if (gameState.settings.game_mode === 'turn' && gameState.settings.time_limit > 0) {
        // 先确保完全停止之前的计时器
        stopTimer();
        // 清除可能存在的多个interval
        if (gameState.timerInterval) {
            clearInterval(gameState.timerInterval);
            gameState.timerInterval = null;
        }
        // 重置显示
        gameState.timeLeft = gameState.settings.time_limit;
        updateTimerDisplay();
        // 启动新计时器
        startTimer(gameState.settings.time_limit);
    }
}

function updateGamePlayerList() {
    if (!gameState.room) return;
    
    elements.gamePlayerList.innerHTML = gameState.room.players.map(player => {
        const isCurrentTurn = gameState.room.current_turn === player.sid;
        const hasGuessed = player.guess_count > 0;
        
        return `
        <div class="player-card ${isCurrentTurn ? 'active' : ''} ${player.finished ? 'finished' : ''} ${player.online === false ? 'offline' : ''}">
            <div class="flex justify-between items-center mb-1">
                <span class="font-medium text-sm ${player.sid === gameState.mySid ? 'text-primary' : ''}">
                    ${player.name} ${player.sid === gameState.mySid ? '(我)' : ''}
                </span>
                ${player.finished ? '<span class="text-xs text-green-600 font-bold">已完成</span>' : ''}
                ${isCurrentTurn ? '<span class="text-xs text-primary animate-pulse">回合中</span>' : ''}
            </div>
            <div class="text-xs text-gray-600 space-y-1">
                <div class="flex justify-between">
                    <span>猜测次数:</span>
                    <span class="font-medium">${player.guess_count}</span>
                </div>
                ${hasGuessed ? `
                <div class="flex justify-between">
                    <span>最近匹配:</span>
                    <span class="font-medium ${player.last_match === gameState.settings.digit_count ? 'text-green-600' : ''}">
                        ${player.last_match}/${gameState.settings.digit_count}
                    </span>
                </div>
                ` : ''}
            </div>
        </div>
        `;
    }).join('');
}

function updateTurnIndicator() {
    if (gameState.settings.game_mode === 'turn' && gameState.room.current_turn) {
        elements.turnIndicator.classList.remove('hidden');
        if (gameState.room.current_turn === gameState.mySid) {
            elements.turnIndicator.textContent = '轮到你了！';
            elements.turnIndicator.className = 'text-sm font-bold text-green-600 mt-1';
        } else {
            const player = gameState.room.players.find(p => p.sid === gameState.room.current_turn);
            elements.turnIndicator.textContent = `等待 ${player?.name || '其他玩家'}...`;
            elements.turnIndicator.className = 'text-sm font-bold text-gray-500 mt-1';
        }
    } else {
        elements.turnIndicator.classList.add('hidden');
    }
}

function handleGameGuess(e) {
    e.preventDefault();

    // 检查是否是自己的回合（轮次模式）
    if (gameState.settings.game_mode === 'turn' && gameState.room.current_turn !== gameState.mySid) {
        showGameError('还没轮到你');
        return;
    }

    const guess = elements.gameGuessInput.value.trim();

    // 验证
    if (guess.length !== gameState.settings.digit_count) {
        showGameError(`请输入${gameState.settings.digit_count}位数字`);
        return;
    }

    if (!/^\d+$/.test(guess)) {
        showGameError('只能输入数字');
        return;
    }

    if (!gameState.settings.include_zero && guess.includes('0')) {
        showGameError('答案不包含0');
        return;
    }

    if (!gameState.settings.allow_repeat && new Set(guess).size !== guess.length) {
        showGameError('答案没有重复数字');
        return;
    }

    gameState.socket.emit('submit_guess', { guess });
    elements.gameGuessInput.value = '';
    elements.gameGuessError.classList.add('hidden');
}

function showGameError(message) {
    elements.gameGuessError.textContent = message;
    elements.gameGuessError.classList.remove('hidden');
    setTimeout(() => {
        elements.gameGuessError.classList.add('hidden');
    }, 3000);
}

function handleGuessResult(data) {
    // 更新房间数据
    gameState.room.players = data.players;
    gameState.room.current_turn = data.current_turn;

    // 如果是自己的猜测，添加到历史
    if (data.sid === gameState.mySid) {
        gameState.myGuesses.push({
            guess: data.guess,
            match: data.match,
            isCorrect: data.is_correct
        });
        updateMyHistory();
    }

    // 显示系统消息
    const player = gameState.room.players.find(p => p.sid === data.sid);
    if (data.timeout) {
        addGameChatMessage('系统', `${player?.name || '玩家'} 超时未猜，自动跳过`, true);
    } else if (data.is_correct) {
        addGameChatMessage('系统', `${player?.name || '玩家'} 猜对了答案！`, true);
    }

    updateGamePlayerList();
    updateTurnIndicator();

    // 注意：计时器由 turn_changed 事件处理，这里不再重置
    // 服务器会在切换回合时发送 turn_changed 事件
}

function updateMyHistory() {
    if (gameState.myGuesses.length === 0) {
        elements.myHistory.innerHTML = '<p class="text-gray-500 text-sm italic text-center py-4">还没有猜测记录</p>';
        return;
    }
    
    elements.myHistory.innerHTML = gameState.myGuesses.map((g, i) => `
        <div class="flex justify-between items-center py-2 px-3 rounded ${g.isCorrect ? 'bg-green-100' : 'bg-gray-50'}">
            <span class="font-mono font-medium">${g.guess}</span>
            <span class="text-sm ${g.isCorrect ? 'text-green-600 font-bold' : 'text-gray-600'}">
                ${g.isCorrect ? '✓ 正确' : `匹配: ${g.match}/${gameState.settings.digit_count}`}
            </span>
        </div>
    `).join('');
    
    // 滚动到底部
    elements.myHistory.scrollTop = elements.myHistory.scrollHeight;
}

// ==================== 游戏结果 ====================
function showGameResult(data) {
    showPanel('result');

    elements.resultAnswer.textContent = data.answer;

    // 重置游戏状态
    gameState.isReady = false;
    gameState.gameStatus = 'finished';

    // 更新isHost状态（以防房主变更）
    if (data.room) {
        gameState.isHost = data.room.host === gameState.mySid;
        gameState.room = data.room;
        gameState.room.status = 'waiting';
    }

    // 根据房主状态更新按钮文字
    if (gameState.isHost) {
        elements.playAgainBtn.innerHTML = '<i class="fa fa-play mr-2"></i> 再来一局';
    } else {
        elements.playAgainBtn.innerHTML = '<i class="fa fa-check mr-2"></i> 准备';
    }

    // 排序结果（完成的在前，按猜测次数排序）
    const sortedResults = data.results.sort((a, b) => {
        if (a.finished && !b.finished) return -1;
        if (!a.finished && b.finished) return 1;
        if (a.finished && b.finished) return a.guess_count - b.guess_count;
        return 0;
    });

    elements.resultList.innerHTML = sortedResults.map((r, i) => `
        <div class="flex justify-between items-center py-2 px-3 rounded ${r.sid === gameState.mySid ? 'bg-blue-50' : 'bg-white'}">
            <div class="flex items-center">
                <span class="w-6 h-6 rounded-full ${i === 0 && r.finished ? 'bg-yellow-400' : 'bg-gray-200'}
                    flex items-center justify-center text-xs font-bold mr-2">
                    ${i + 1}
                </span>
                <span class="font-medium ${r.sid === gameState.mySid ? 'text-primary' : ''}">
                    ${r.name} ${r.sid === gameState.mySid ? '(我)' : ''}
                </span>
            </div>
            <div class="text-right">
                ${r.finished
                    ? `<span class="text-green-600 font-bold">${r.guess_count}次猜对</span>`
                    : `<span class="text-gray-500">${r.guess_count}次未猜对</span>`
                }
            </div>
        </div>
    `).join('');
}

function handlePlayAgain() {
    // 非房主点击"再来一局"相当于准备
    if (!gameState.isHost) {
        gameState.socket.emit('toggle_ready');
        // 显示提示
        addSystemMessage('你已准备，等待房主开始游戏...');
    } else {
        // 房主直接开始游戏
        gameState.socket.emit('start_game');
    }
}

function handleBackToLobby() {
    gameState.socket.emit('leave_room');
}

// ==================== 聊天功能 ====================
function handleSendChat(e) {
    e.preventDefault();
    const message = elements.chatInput.value.trim();
    if (!message) return;
    
    gameState.socket.emit('send_chat', { message });
    elements.chatInput.value = '';
}

function handleGameSendChat(e) {
    e.preventDefault();
    const message = elements.gameChatInput.value.trim();
    if (!message) return;
    
    gameState.socket.emit('send_chat', { message });
    elements.gameChatInput.value = '';
}

function addChatMessage(name, message, isSelf) {
    const div = document.createElement('div');
    div.className = `chat-message ${isSelf ? 'chat-self' : 'chat-other'}`;
    div.innerHTML = `<span class="font-medium">${name}:</span> ${escapeHtml(message)}`;
    elements.chatContainer.appendChild(div);
    elements.chatContainer.scrollTop = elements.chatContainer.scrollHeight;
    
    // 同时添加到游戏聊天
    addGameChatMessage(name, message, isSelf);
}

function addGameChatMessage(name, message, isSelf) {
    const div = document.createElement('div');
    div.className = `chat-message ${isSelf ? 'chat-self' : 'chat-other'}`;
    div.innerHTML = `<span class="font-medium">${name}:</span> ${escapeHtml(message)}`;
    elements.gameChatContainer.appendChild(div);
    elements.gameChatContainer.scrollTop = elements.gameChatContainer.scrollHeight;
}

function addSystemMessage(message) {
    const div = document.createElement('div');
    div.className = 'chat-message chat-system';
    div.textContent = message;
    elements.chatContainer.appendChild(div);
    elements.chatContainer.scrollTop = elements.chatContainer.scrollHeight;
    
    // 同时添加到游戏聊天
    const div2 = document.createElement('div');
    div2.className = 'chat-message chat-system';
    div2.textContent = message;
    elements.gameChatContainer.appendChild(div2);
    elements.gameChatContainer.scrollTop = elements.gameChatContainer.scrollHeight;
}

function loadChatHistory(history) {
    elements.chatContainer.innerHTML = '';
    elements.gameChatContainer.innerHTML = '';
    
    history.forEach(msg => {
        const isSelf = msg.name === gameState.myName;
        addChatMessage(msg.name, msg.message, isSelf);
    });
}

function clearChat() {
    elements.chatContainer.innerHTML = '';
    elements.gameChatContainer.innerHTML = '';
}

// ==================== 工具函数 ====================
function showError(message) {
    alert(message);
}

function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

// ==================== 事件监听 ====================
function initEventListeners() {
    // 用户名
    elements.setNameBtn.addEventListener('click', handleSetName);
    elements.usernameInput.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') handleSetName();
    });
    
    // 创建房间表单
    elements.createRoomForm.addEventListener('submit', handleCreateRoom);
    
    // 滑块值更新
    elements.createMaxPlayers.addEventListener('input', () => {
        elements.createMaxPlayersValue.textContent = elements.createMaxPlayers.value + '人';
    });
    elements.createDigitCount.addEventListener('input', () => {
        elements.createDigitCountValue.textContent = elements.createDigitCount.value + '位';
    });
    elements.createTimeLimit.addEventListener('input', () => {
        const val = parseInt(elements.createTimeLimit.value);
        elements.createTimeLimitValue.textContent = val === 0 ? '不限时' : val + '秒';
    });
    
    // 游戏模式切换 - 自由模式隐藏时间限制
    elements.createGameMode.addEventListener('change', () => {
        const isTurnMode = elements.createGameMode.value === 'turn';
        if (isTurnMode) {
            elements.timeLimitContainer.classList.remove('hidden');
        } else {
            elements.timeLimitContainer.classList.add('hidden');
            // 自由模式强制设为不限时
            elements.createTimeLimit.value = 0;
            elements.createTimeLimitValue.textContent = '不限时';
        }
    });
    
    // 刷新房间列表
    elements.refreshRoomsBtn.addEventListener('click', () => {
        gameState.socket.emit('get_room_list');
    });
    
    // 房间按钮
    elements.readyBtn.addEventListener('click', handleToggleReady);
    elements.startGameBtn.addEventListener('click', handleStartGame);
    elements.leaveRoomBtn.addEventListener('click', handleLeaveRoom);
    
    // 聊天
    elements.chatForm.addEventListener('submit', handleSendChat);
    elements.gameChatForm.addEventListener('submit', handleGameSendChat);
    
    // 游戏
    elements.gameGuessForm.addEventListener('submit', handleGameGuess);
    elements.gameGuessInput.addEventListener('input', (e) => {
        e.target.value = e.target.value.replace(/[^0-9]/g, '');
    });
    
    // 结果面板
    elements.playAgainBtn.addEventListener('click', handlePlayAgain);
    elements.backToLobbyBtn.addEventListener('click', handleBackToLobby);
}

// ==================== 初始化 ====================
document.addEventListener('DOMContentLoaded', () => {
    console.log('游戏初始化...');
    initSocket();
    initEventListeners();
    
    // 初始化时间限制显示状态（根据默认选择的模式）
    const isTurnMode = elements.createGameMode.value === 'turn';
    if (!isTurnMode) {
        elements.timeLimitContainer.classList.add('hidden');
        elements.createTimeLimit.value = 0;
        elements.createTimeLimitValue.textContent = '不限时';
    }
});
