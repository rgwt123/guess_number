#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
多人在线猜数字游戏服务器
支持：创建房间、加入房间、自由模式、轮次模式、实时聊天
"""

import random
import string
import time
from collections import defaultdict
from threading import Lock

from flask import Flask, render_template, request
from flask_socketio import SocketIO, emit, join_room, leave_room

app = Flask(__name__)
app.config['SECRET_KEY'] = 'guess-number-game-secret-key'
socketio = SocketIO(app, cors_allowed_origins="*")

# 游戏数据存储（内存中）
rooms = {}  # {room_id: room_data}
players = {}  # {sid: player_data}
room_lock = Lock()

# 房间清理配置
ROOM_CLEANUP_DELAY = 120  # 2分钟
ROOM_FORCE_CLEANUP_DELAY = ROOM_CLEANUP_DELAY * 2


def generate_room_id():
    """生成6位房间号"""
    while True:
        room_id = ''.join(random.choices(string.digits, k=6))
        if room_id not in rooms:
            return room_id


def generate_answer(digit_count, include_zero, allow_repeat):
    """生成答案数字"""
    digits = []
    min_digit = 0 if include_zero else 1
    max_digit = 9
    
    if not allow_repeat:
        available = list(range(min_digit, max_digit + 1))
        for _ in range(digit_count):
            if not available:
                break
            d = random.choice(available)
            digits.append(d)
            available.remove(d)
    else:
        for _ in range(digit_count):
            digits.append(random.randint(min_digit, max_digit))
    
    return ''.join(map(str, digits))


def count_matches(guess, answer):
    """计算匹配位数"""
    return sum(1 for i in range(len(guess)) if i < len(answer) and guess[i] == answer[i])


def create_room_data(room_id, host_sid, settings):
    """创建房间数据结构"""
    return {
        'id': room_id,
        'host': host_sid,
        'players': {},  # {sid: player_info}
        'settings': settings,
        'status': 'waiting',  # waiting, playing, finished
        'answer': None,
        'chat_history': [],
        'turn_order': [],  # 轮次模式用
        'current_turn_idx': 0,
        'created_at': time.time(),
        'last_activity': time.time(),
        'winner': None,
        'turn_timer': None,  # 轮次计时器
        'turn_start_time': None  # 当前轮次开始时间
    }


def get_room_list():
    """获取可加入的房间列表"""
    result = []
    now = time.time()
    for room_id, room in rooms.items():
        if room['status'] == 'waiting':
            result.append({
                'id': room_id,
                'player_count': len(room['players']),
                'max_players': room['settings']['max_players'],
                'host_name': room['players'].get(room['host'], {}).get('name', '未知'),
                'settings': room['settings']
            })
    return result


def broadcast_room_list():
    """广播房间列表更新"""
    socketio.emit('room_list_update', get_room_list(), namespace='/')


def cleanup_room(room_id):
    """清理空房间"""
    with room_lock:
        if room_id in rooms:
            room = rooms[room_id]
            idle_seconds = time.time() - room['last_activity']
            if room['status'] != 'playing' and idle_seconds > ROOM_FORCE_CLEANUP_DELAY:
                del rooms[room_id]
                print(f"房间 {room_id} 已清理")
                broadcast_room_list()
                return
            if len(room['players']) == 0 and idle_seconds > ROOM_CLEANUP_DELAY:
                del rooms[room_id]
                print(f"房间 {room_id} 已清理")
                broadcast_room_list()


def inherit_host(room_id):
    """房主继承"""
    with room_lock:
        if room_id not in rooms:
            return
        room = rooms[room_id]
        if len(room['players']) > 0:
            # 随机选择新房主
            new_host = random.choice(list(room['players'].keys()))
            room['host'] = new_host
            # 通知所有玩家
            for sid in room['players']:
                socketio.emit('host_changed', {
                    'new_host': new_host,
                    'new_host_name': room['players'][new_host]['name']
                }, room=sid)
            print(f"房间 {room_id} 新房主: {room['players'][new_host]['name']}")


@app.route('/')
def index():
    return render_template('index.html')


# ==================== SocketIO 事件处理 ====================

@socketio.on('connect')
def handle_connect():
    """玩家连接"""
    print(f"玩家连接: {request.sid}")
    emit('connected', {'sid': request.sid})
    emit('room_list_update', get_room_list())


@socketio.on('disconnect')
def handle_disconnect():
    """玩家断开连接"""
    sid = request.sid
    print(f"玩家断开: {sid}")
    
    if sid in players:
        player = players[sid]
        room_id = player.get('room_id')
        
        if room_id and room_id in rooms:
            room = rooms[room_id]
            
            # 处理玩家离开（先移除玩家）
            if sid in room['players']:
                player_name = room['players'][sid]['name']
                is_host = (room['host'] == sid)
                
                # 通知其他玩家
                emit('player_left', {'sid': sid, 'name': player_name}, room=room_id, broadcast=True)
                
                # 从房间中移除玩家
                del room['players'][sid]
                
                # 如果游戏进行中，结束游戏
                if room['status'] == 'playing':
                    stop_turn_timer(room_id)
                    
                    # 如果是房主，继承房主（移除后继承）
                    if is_host and len(room['players']) > 0:
                        inherit_host(room_id)
                    
                    # 广播游戏结束
                    emit('game_finished', {
                        'room': get_room_data(room_id),
                        'answer': room['answer'],
                        'results': [
                            {
                                'sid': p_sid,
                                'name': p['name'],
                                'guess_count': p['guess_count'],
                                'finished': p.get('finished', False)
                            }
                            for p_sid, p in room['players'].items()
                        ],
                        'reason': 'player_left',
                        'left_player': player_name
                    }, room=room_id, broadcast=True)
                    
                    # 游戏结束后重置房间状态为waiting，让其他人可以重新加入
                    room['status'] = 'waiting'
                    room['answer'] = None
                    room['winner'] = None
                    room['turn_order'] = []
                    room['current_turn_idx'] = 0
                    
                    # 重置玩家准备状态
                    for p in room['players'].values():
                        p['ready'] = False
                        p['guess_count'] = 0
                        p['last_match'] = 0
                        p['finished'] = False
                        p['guesses'] = []
                    
                    print(f"房间 {room_id} 游戏结束（玩家 {player_name} 断开），已重置为可加入状态")
                    
                    # 广播房间列表更新
                    broadcast_room_list()
                else:
                    # 非游戏状态，如果是房主则继承
                    if is_host and len(room['players']) > 0:
                        inherit_host(room_id)
                
                # 更新房间活动时间和玩家列表
                room['last_activity'] = time.time()
                emit('player_list_update', {
                    'players': get_player_list(room_id)
                }, room=room_id, broadcast=True)
                
                # 如果房间空了，标记清理时间
                if len(room['players']) == 0:
                    room['last_activity'] = time.time()
        
        del players[sid]


@socketio.on('reconnect_attempt')
def handle_reconnect_attempt(data):
    """尝试重连"""
    sid = request.sid
    old_sid = data.get('old_sid')
    room_id = data.get('room_id')
    
    print(f"重连尝试: {old_sid} -> {sid}, 房间: {room_id}")
    
    if room_id and room_id in rooms:
        room = rooms[room_id]
        if old_sid in room['players']:
            # 转移玩家数据
            room['players'][sid] = room['players'].pop(old_sid)
            room['players'][sid]['online'] = True
            room['players'][sid]['sid'] = sid
            
            # 更新房主
            if room['host'] == old_sid:
                room['host'] = sid
            
            # 更新 turn_order
            if old_sid in room['turn_order']:
                idx = room['turn_order'].index(old_sid)
                room['turn_order'][idx] = sid
            
            # 更新玩家记录
            players[sid] = players.pop(old_sid, {})
            players[sid]['sid'] = sid
            players[sid]['room_id'] = room_id
            
            # 加入房间
            join_room(room_id)
            
            emit('reconnect_success', {
                'room': get_room_data(room_id),
                'player': room['players'][sid]
            })
            
            # 通知其他玩家
            emit('player_online', {
                'sid': sid,
                'name': room['players'][sid]['name']
            }, room=room_id, broadcast=True, include_self=False)
            
            emit('player_list_update', {
                'players': get_player_list(room_id)
            }, room=room_id, broadcast=True)
            
            print(f"重连成功: {sid}")
            return
    
    emit('reconnect_failed')


def get_player_list(room_id):
    """获取房间玩家列表"""
    if room_id not in rooms:
        return []
    room = rooms[room_id]
    return [
        {
            'sid': sid,
            'name': p['name'],
            'ready': p.get('ready', False),
            'online': p.get('online', True),
            'guess_count': p.get('guess_count', 0),
            'last_match': p.get('last_match', 0),
            'is_host': room['host'] == sid,
            'finished': p.get('finished', False)
        }
        for sid, p in room['players'].items()
    ]


def get_room_data(room_id):
    """获取房间数据（用于发送给客户端）"""
    if room_id not in rooms:
        return None
    room = rooms[room_id]
    return {
        'id': room['id'],
        'host': room['host'],
        'settings': room['settings'],
        'status': room['status'],
        'players': get_player_list(room_id),
        'chat_history': room['chat_history'],
        'current_turn': room['turn_order'][room['current_turn_idx']] if room['turn_order'] else None,
        'winner': room['winner']
    }


@socketio.on('set_name')
def handle_set_name(data):
    """设置玩家名称"""
    sid = request.sid
    name = data.get('name', '').strip()[:5]
    
    if not name:
        emit('error', {'message': '用户名不能为空'})
        return
    
    players[sid] = {
        'sid': sid,
        'name': name,
        'room_id': None
    }
    
    emit('name_set', {'name': name})


@socketio.on('create_room')
def handle_create_room(data):
    """创建房间"""
    sid = request.sid
    
    if sid not in players:
        emit('error', {'message': '请先设置用户名'})
        return
    
    settings = {
        'max_players': min(max(int(data.get('max_players', 2)), 1), 5),
        'digit_count': min(max(int(data.get('digit_count', 4)), 3), 8),
        'include_zero': bool(data.get('include_zero', True)),
        'allow_repeat': bool(data.get('allow_repeat', False)),
        'game_mode': data.get('game_mode', 'free'),  # free, turn
        'time_limit': int(data.get('time_limit', 0))  # 0表示不限时
    }
    
    room_id = generate_room_id()
    
    with room_lock:
        rooms[room_id] = create_room_data(room_id, sid, settings)
        rooms[room_id]['players'][sid] = {
            'sid': sid,
            'name': players[sid]['name'],
            'ready': False,
            'online': True,
            'guess_count': 0,
            'last_match': 0,
            'finished': False,
            'guesses': []
        }
    
    players[sid]['room_id'] = room_id
    join_room(room_id)
    
    emit('room_created', {'room': get_room_data(room_id)})
    broadcast_room_list()


@socketio.on('join_room')
def handle_join_room(data):
    """加入房间"""
    sid = request.sid
    room_id = data.get('room_id', '').strip()
    
    if sid not in players:
        emit('error', {'message': '请先设置用户名'})
        return
    
    if room_id not in rooms:
        emit('error', {'message': '房间不存在'})
        return
    
    room = rooms[room_id]
    
    if room['status'] != 'waiting':
        emit('error', {'message': '房间已开始游戏'})
        return
    
    if len(room['players']) >= room['settings']['max_players']:
        emit('error', {'message': '房间已满'})
        return
    
    # 添加玩家到房间
    room['players'][sid] = {
        'sid': sid,
        'name': players[sid]['name'],
        'ready': False,
        'online': True,
        'guess_count': 0,
        'last_match': 0,
        'finished': False,
        'guesses': []
    }
    
    players[sid]['room_id'] = room_id
    join_room(room_id)
    room['last_activity'] = time.time()
    
    emit('room_joined', {'room': get_room_data(room_id)})
    
    # 通知其他玩家
    emit('player_joined', {
        'player': {
            'sid': sid,
            'name': players[sid]['name'],
            'ready': False,
            'online': True
        }
    }, room=room_id, broadcast=True, include_self=False)
    
    emit('player_list_update', {
        'players': get_player_list(room_id)
    }, room=room_id, broadcast=True)
    
    broadcast_room_list()


@socketio.on('leave_room')
def handle_leave_room():
    """离开房间"""
    sid = request.sid
    
    if sid not in players:
        return
    
    room_id = players[sid].get('room_id')
    if not room_id or room_id not in rooms:
        return
    
    room = rooms[room_id]
    
    # 获取离开玩家的名字
    player_name = room['players'].get(sid, {}).get('name', '未知')
    
    # 如果游戏进行中，先结束游戏并通知其他玩家
    if room['status'] == 'playing':
        room['status'] = 'finished'
        stop_turn_timer(room_id)
        
        # 先给离开的人发送 left_room（让他离开游戏界面）
        emit('left_room', room=sid)
        
        # 移除玩家
        if sid in room['players']:
            del room['players'][sid]
        
        # 如果是房主，继承房主
        if room['host'] == sid and len(room['players']) > 0:
            inherit_host(room_id)
        
        # 再给剩下的玩家发送游戏结束
        if len(room['players']) > 0:
            emit('game_finished', {
                'room': get_room_data(room_id),
                'answer': room['answer'],
                'results': [
                    {
                        'sid': p_sid,
                        'name': p['name'],
                        'guess_count': p['guess_count'],
                        'finished': p.get('finished', False)
                    }
                    for p_sid, p in room['players'].items()
                ],
                'reason': 'player_left',
                'left_player': player_name
            }, room=room_id)
            
            emit('player_left', {'sid': sid, 'name': player_name}, room=room_id)
            emit('player_list_update', {
                'players': get_player_list(room_id)
            }, room=room_id)
        else:
            room['last_activity'] = time.time()
        
        leave_room(room_id)
        players[sid]['room_id'] = None
        broadcast_room_list()
        return
    
    # 非游戏状态下的正常离开逻辑
    # 移除玩家
    if sid in room['players']:
        del room['players'][sid]
    
    leave_room(room_id)
    players[sid]['room_id'] = None
    
    # 如果是房主，继承房主
    if room['host'] == sid and len(room['players']) > 0:
        inherit_host(room_id)
    
    # 如果房间空了，标记活动时间（用于后续清理）
    if len(room['players']) == 0:
        room['last_activity'] = time.time()
    else:
        # 通知其他玩家
        emit('player_left', {'sid': sid, 'name': player_name}, room=room_id, broadcast=True)
        emit('player_list_update', {
            'players': get_player_list(room_id)
        }, room=room_id, broadcast=True)
    
    emit('left_room')
    broadcast_room_list()


@socketio.on('toggle_ready')
def handle_toggle_ready():
    """切换准备状态"""
    sid = request.sid
    
    if sid not in players:
        return
    
    room_id = players[sid].get('room_id')
    if not room_id or room_id not in rooms:
        return
    
    room = rooms[room_id]
    
    if sid not in room['players']:
        return
    
    # 切换准备状态
    room['players'][sid]['ready'] = not room['players'][sid].get('ready', False)
    room['last_activity'] = time.time()
    
    emit('ready_toggled', {'ready': room['players'][sid]['ready']})
    
    # 广播玩家列表更新
    emit('player_list_update', {
        'players': get_player_list(room_id)
    }, room=room_id, broadcast=True)


@socketio.on('start_game')
def handle_start_game():
    """开始游戏"""
    sid = request.sid
    
    if sid not in players:
        emit('error', {'message': '请先设置用户名'})
        return
    
    room_id = players[sid].get('room_id')
    if not room_id or room_id not in rooms:
        emit('error', {'message': '房间不存在'})
        return
    
    room = rooms[room_id]
    
    # 检查是否是房主
    if room['host'] != sid:
        emit('error', {'message': '只有房主可以开始游戏'})
        return
    
    # 检查人数是否满足要求
    current_players = len(room['players'])
    required_players = room['settings']['max_players']
    if current_players < required_players:
        emit('error', {'message': f'人数不足，需要 {required_players} 人，当前 {current_players} 人'})
        return
    
    # 检查是否都准备了（多人的时候），房主不需要准备
    # 注意：游戏结束后ready状态会被重置，这里需要玩家重新准备
    if len(room['players']) > 1:
        not_ready = [p for p in room['players'].values() if not p.get('ready', False) and p['sid'] != room['host']]
        if not_ready:
            not_ready_names = ', '.join([p['name'] for p in not_ready])
            emit('error', {'message': f'还有玩家未准备: {not_ready_names}'})
            return
    
    # 生成答案
    settings = room['settings']
    room['answer'] = generate_answer(
        settings['digit_count'],
        settings['include_zero'],
        settings['allow_repeat']
    )
    
    # 初始化游戏状态
    room['status'] = 'playing'
    room['turn_order'] = list(room['players'].keys())
    room['current_turn_idx'] = 0
    room['winner'] = None
    
    # 重置玩家游戏数据
    for p in room['players'].values():
        p['guess_count'] = 0
        p['last_match'] = 0
        p['finished'] = False
        p['guesses'] = []
        p['ready'] = False
    
    room['last_activity'] = time.time()
    
    print(f"房间 {room_id} 游戏开始，答案: {room['answer']}")
    
    # 广播游戏开始
    emit('game_started', {
        'room': get_room_data(room_id),
        'settings': settings
    }, room=room_id, broadcast=True)
    
    # 如果设置了时间限制，启动计时器
    if settings['time_limit'] > 0 and settings['game_mode'] == 'turn':
        start_turn_timer(room_id)


@socketio.on('submit_guess')
def handle_submit_guess(data):
    """提交猜测"""
    sid = request.sid
    guess = data.get('guess', '').strip()
    
    if sid not in players:
        emit('error', {'message': '请先设置用户名'})
        return
    
    room_id = players[sid].get('room_id')
    if not room_id or room_id not in rooms:
        emit('error', {'message': '房间不存在'})
        return
    
    room = rooms[room_id]
    
    if room['status'] != 'playing':
        emit('error', {'message': '游戏未开始'})
        return
    
    if sid not in room['players']:
        emit('error', {'message': '不在房间中'})
        return
    
    player = room['players'][sid]
    settings = room['settings']

    # 检查是否已完成
    if player.get('finished', False):
        emit('error', {'message': '你已经猜对了，等待游戏结束'})
        return

    # 检查是否已超时（本轮已跳过）
    if player.get('timed_out', False):
        emit('error', {'message': '你已超时，请等待下一轮'})
        return

    # 轮次模式检查
    if settings['game_mode'] == 'turn':
        current_turn_sid = room['turn_order'][room['current_turn_idx']]
        if current_turn_sid != sid:
            emit('error', {'message': '还没轮到你'})
            return
    
    # 验证输入
    if len(guess) != settings['digit_count']:
        emit('error', {'message': f'请输入{settings["digit_count"]}位数字'})
        return
    
    if not guess.isdigit():
        emit('error', {'message': '只能输入数字'})
        return
    
    if not settings['include_zero'] and '0' in guess:
        emit('error', {'message': '答案不包含0'})
        return
    
    if not settings['allow_repeat']:
        if len(set(guess)) != len(guess):
            emit('error', {'message': '答案没有重复数字'})
            return
    
    # 计算匹配
    match_count = count_matches(guess, room['answer'])
    is_correct = (match_count == settings['digit_count'])
    
    # 更新玩家数据
    player['guess_count'] += 1
    player['last_match'] = match_count
    player['guesses'].append({
        'guess': guess,
        'match': match_count,
        'time': time.time()
    })
    
    if is_correct:
        player['finished'] = True
        if room['winner'] is None:
            room['winner'] = sid
    
    room['last_activity'] = time.time()
    
    # 轮次模式：切换到下一个玩家
    next_sid = None
    if settings['game_mode'] == 'turn':
        # 找到下一个未完成的玩家
        for _ in range(len(room['turn_order'])):
            room['current_turn_idx'] = (room['current_turn_idx'] + 1) % len(room['turn_order'])
            next_sid = room['turn_order'][room['current_turn_idx']]
            if not room['players'][next_sid].get('finished', False):
                break

        # 重置新回合玩家的超时标志
        if next_sid:
            room['players'][next_sid]['timed_out'] = False

    # 检查游戏是否结束：有人答对就结束
    if is_correct:
        room['status'] = 'finished'

        # 停止计时器
        stop_turn_timer(room_id)

        # 广播游戏结束
        emit('game_finished', {
            'room': get_room_data(room_id),
            'answer': room['answer'],
            'results': [
                {
                    'sid': sid,
                    'name': p['name'],
                    'guess_count': p['guess_count'],
                    'finished': p.get('finished', False)
                }
                for sid, p in room['players'].items()
            ]
        }, room=room_id, broadcast=True)
    else:
        # 广播猜测结果
        emit('guess_result', {
            'sid': sid,
            'name': player['name'],
            'guess': guess,
            'match': match_count,
            'is_correct': is_correct,
            'guess_count': player['guess_count'],
            'current_turn': room['turn_order'][room['current_turn_idx']] if settings['game_mode'] == 'turn' else None,
            'players': get_player_list(room_id)
        }, room=room_id, broadcast=True)

        # 轮次模式下，发送turn_changed事件同步计时器
        if settings['game_mode'] == 'turn' and next_sid:
            next_player = room['players'][next_sid]
            socketio.emit('turn_changed', {
                'current_turn': next_sid,
                'current_turn_name': next_player['name'],
                'time_limit': settings['time_limit']
            }, room=room_id)

            # 启动新计时器
            if settings['time_limit'] > 0:
                start_turn_timer(room_id)


@socketio.on('send_chat')
def handle_send_chat(data):
    """发送聊天消息"""
    sid = request.sid
    message = data.get('message', '').strip()
    
    if not message or len(message) > 100:
        return
    
    if sid not in players:
        return
    
    room_id = players[sid].get('room_id')
    if not room_id or room_id not in rooms:
        return
    
    room = rooms[room_id]
    player_name = room['players'].get(sid, {}).get('name', '未知')
    
    chat_msg = {
        'name': player_name,
        'message': message,
        'time': time.time()
    }
    
    # 保存到历史（最多100条）
    room['chat_history'].append(chat_msg)
    if len(room['chat_history']) > 100:
        room['chat_history'] = room['chat_history'][-100:]
    
    room['last_activity'] = time.time()
    
    # 广播消息
    emit('chat_message', chat_msg, room=room_id, broadcast=True)


@socketio.on('get_room_list')
def handle_get_room_list():
    """获取房间列表"""
    emit('room_list_update', get_room_list())


# ==================== 计时器功能 ====================

def start_turn_timer(room_id):
    """启动轮次计时器"""
    if room_id not in rooms:
        return
    
    room = rooms[room_id]
    settings = room['settings']
    
    if settings['time_limit'] <= 0:
        return
    
    # 先停止之前的计时器（会增加turn_id）
    stop_turn_timer(room_id)

    # 获取当前的turn_id（stop_turn_timer已经增加了）
    current_turn_id = room.get('turn_id', 0)
    room['turn_start_time'] = time.time()
    
    def timer_callback():
        socketio.sleep(settings['time_limit'])
        # 检查是否还是同一个回合
        if room_id in rooms and rooms[room_id].get('turn_id') == current_turn_id:
            handle_turn_timeout(room_id)
    
    room['turn_timer'] = socketio.start_background_task(timer_callback)
    print(f"房间 {room_id} 计时器启动: {settings['time_limit']}秒 (回合ID: {current_turn_id})")


def handle_turn_timeout(room_id):
    """处理轮次超时"""
    print(f"[超时处理] 房间 {room_id} 进入 handle_turn_timeout")
    if room_id not in rooms:
        print(f"[超时处理] 房间 {room_id} 不存在")
        return

    room = rooms[room_id]

    # 检查游戏是否还在进行
    if room['status'] != 'playing':
        print(f"[超时处理] 房间 {room_id} 游戏未进行，状态: {room['status']}")
        return

    # 计时器已经被停止（通过turn_id检查）
    # 注意：后台任务执行时，turn_timer应该还是任务对象
    # 如果为None，说明被stop_turn_timer停止了
    if room['turn_timer'] is None:
        print(f"[超时处理] 房间 {room_id} 计时器已被停止（turn_timer为None），跳过")
        return
    
    # 标记为已处理，防止重复
    room['turn_timer'] = 'handled'
    
    settings = room['settings']
    current_sid = room['turn_order'][room['current_turn_idx']]
    
    if current_sid not in room['players']:
        return
    
    player = room['players'][current_sid]
    
    # 标记玩家已超时，禁止再提交
    player['timed_out'] = True
    
    # 自动提交空答案（0匹配）
    player['guess_count'] += 1
    player['last_match'] = 0
    player['guesses'].append({
        'guess': '超时',
        'match': 0,
        'time': time.time()
    })
    
    print(f"[超时处理] 房间 {room_id} 玩家 {player['name']} 超时，准备切换到下一个")

    # 广播超时消息
    socketio.emit('guess_result', {
        'sid': current_sid,
        'name': player['name'],
        'guess': '【超时】',
        'match': 0,
        'is_correct': False,
        'guess_count': player['guess_count'],
        'current_turn': None,
        'players': get_player_list(room_id),
        'timeout': True
    }, room=room_id)
    
    # 切换到下一个玩家
    if settings['game_mode'] == 'turn':
        # 找到下一个未完成的玩家
        for _ in range(len(room['turn_order'])):
            room['current_turn_idx'] = (room['current_turn_idx'] + 1) % len(room['turn_order'])
            next_sid = room['turn_order'][room['current_turn_idx']]
            if not room['players'][next_sid].get('finished', False):
                break

        # 重置新回合玩家的超时标志
        next_sid = room['turn_order'][room['current_turn_idx']]
        room['players'][next_sid]['timed_out'] = False

        # 广播轮到谁
        next_player = room['players'][next_sid]
        time_limit = room['settings']['time_limit']

        print(f"[超时处理] 房间 {room_id} 切换到下一个玩家: {next_player['name']}, 发送 turn_changed")

        socketio.emit('turn_changed', {
            'current_turn': next_sid,
            'current_turn_name': next_player['name'],
            'time_limit': time_limit  # 发送时间限制，让前端同步
        }, room=room_id)

        # 启动新计时器
        if time_limit > 0:
            start_turn_timer(room_id)


def stop_turn_timer(room_id):
    """停止计时器"""
    if room_id in rooms:
        room = rooms[room_id]
        room['turn_timer'] = None
        # 增加turn_id使旧计时器的回调失效
        room['turn_id'] = room.get('turn_id', 0) + 1
        print(f"房间 {room_id} 计时器停止 (回合ID更新为: {room['turn_id']})")


# 定时清理任务
@socketio.on('cleanup_rooms')
def cleanup_rooms_task():
    """清理空房间任务"""
    with room_lock:
        now = time.time()
        to_remove = []
        for room_id, room in rooms.items():
            idle_seconds = now - room['last_activity']
            if room['status'] != 'playing' and idle_seconds > ROOM_FORCE_CLEANUP_DELAY:
                to_remove.append(room_id)
                continue
            if len(room['players']) == 0 and idle_seconds > ROOM_CLEANUP_DELAY:
                to_remove.append(room_id)
        
        for room_id in to_remove:
            del rooms[room_id]
            print(f"清理房间: {room_id}")
        
        if to_remove:
            broadcast_room_list()


if __name__ == '__main__':
    print("=" * 50)
    print("多人在线猜数字游戏服务器")
    print("=" * 50)
    print("服务器启动中...")
    
    # 启动定时清理任务
    def cleanup_task():
        while True:
            socketio.sleep(30)  # 每30秒检查一次
            cleanup_rooms_task()
    
    socketio.start_background_task(cleanup_task)
    
    # 启动服务器
    socketio.run(app, host='0.0.0.0', port=5426, debug=True)
