import itertools
import random

def generate_candidates(n):
    """生成所有符合条件的n位数候选（无0、无重复，字符串形式）"""
    digits = '123456789'
    candidates = [''.join(perm) for perm in itertools.permutations(digits, n)]
    return candidates

def count_exact_matches(guess, target):
    """计算两个n位数的「完全匹配位数」（位置+数字都对）"""
    return sum(g == t for g, t in zip(guess, target))

def get_optimal_guess(candidates, n):
    """优化的最优猜测策略：优先选能最大程度均分候选池的猜测"""
    if len(candidates) <= 5:  # 候选池小时直接遍历，加快猜中
        return candidates[0]
    
    # 候选池大时，选包含1-9中高频数字的初始猜测（加速消去）
    optimal_starts = {
        3: "123", 4: "1234", 5: "12345", 6: "123456", 7: "1234567", 8: "12345678"
    }
    first_guess = optimal_starts[n]
    if first_guess in candidates:
        return first_guess
    
    # 若初始猜测不在候选池（极端情况），随机选前10个中的一个
    return random.choice(candidates[:10])

def validate_feedback(feedback_input, n):
    """验证用户输入的反馈是否合法"""
    try:
        feedback_int = int(feedback_input)
        if 0 <= feedback_int <= n:
            return True, feedback_int
        else:
            print(f"❌ 反馈必须是0到{n}之间的整数！")
            return False, 0
    except ValueError:
        print("❌ 请输入有效的数字！")
        return False, 0

def guess_number_game():
    """主游戏逻辑：程序猜，用户给反馈（修复版）"""
    print("===== 程序猜数字游戏（修复版） =====")
    print("规则：你心里想一个n位数（3≤n≤8），无0、每位数字不重复")
    
    # 1. 获取并验证位数n
    while True:
        n_input = input("请输入你想的数字位数（3-8）：")
        if not n_input.isdigit():
            print("❌ 请输入3-8之间的整数！")
            continue
        n = int(n_input)
        if 3 <= n <= 8:
            break
        else:
            print("❌ 位数必须在3到8之间！")
    
    # 2. 初始化候选池和计数
    candidates = generate_candidates(n)
    guess_count = 0
    print(f"\n✅ 已准备好！你现在可以在心里想好一个{n}位数（无0、无重复）")
    input("想好后按Enter键开始游戏...")
    
    # 3. 循环猜测直到猜中
    while len(candidates) > 0:
        # 选最优猜测（候选池为空时终止）
        if len(candidates) == 0:
            print("\n❌ 没有找到符合你反馈的数字，可能是你输入的反馈有误！")
            return
        guess = get_optimal_guess(candidates, n)
        guess_count += 1
        print(f"\n【第{guess_count}次猜测】我猜：{guess}")
        
        # 获取并验证反馈（修复f-string格式化）
        while True:
            feedback_input = input(f"请告诉我有几位完全匹配（位置+数字都对，0~{n}）：")
            is_valid, feedback = validate_feedback(feedback_input, n)
            if is_valid:
                break
        
        # 若反馈等于n，直接猜中，终止循环
        if feedback == n:
            print(f"\n🎉 我猜中了！答案是：{guess}")
            print(f"📊 总共猜了 {guess_count} 次")
            return
        
        # 过滤候选池：保留和当前猜测匹配数等于反馈的候选
        new_candidates = []
        for candidate in candidates:
            if count_exact_matches(guess, candidate) == feedback:
                new_candidates.append(candidate)
        candidates = new_candidates
        
        # 提示剩余候选数
        print(f"🔍 剩余候选数：{len(candidates)} 个")
        print(candidates)

    # 若候选池为空（反馈矛盾）
    print("\n❌ 没有找到符合你所有反馈的数字，可能是你输入的反馈有误！")

# 启动游戏
if __name__ == "__main__":
    guess_number_game()