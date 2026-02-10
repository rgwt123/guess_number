import itertools
import random
from collections import defaultdict

def generate_candidates(n):
    digits = '123456789'
    return [''.join(perm) for perm in itertools.permutations(digits, n)]

def count_exact_matches(guess, target):
    return sum(g == t for g, t in zip(guess, target))

def score_guess_minimax(guess, candidates, n):
    """
    对一个 guess 评分：
    - primary: worst-case bucket size (越小越好)
    - secondary: sum of squares of bucket sizes (越小越好，越均匀)
    """
    buckets = [0] * (n + 1)
    for c in candidates:
        b = count_exact_matches(guess, c)
        buckets[b] += 1
    worst = max(buckets)
    # sum of squares: 越小表示分桶越均匀（信息量更大）
    sse = sum(x * x for x in buckets)
    return (worst, sse)

def get_optimal_guess(candidates, n):
    """
    近似/精确 minimax 策略：
    - 候选池小：对所有 candidates 做精确 minimax
    - 候选池大：从 candidates 里抽样若干个作为备选 guess，做近似 minimax
    """
    m = len(candidates)
    if m == 0:
        return None
    if m == 1:
        return candidates[0]

    # 候选池很小：直接猜一个也行（更快），但我们仍然走 minimax
    # 你也可以把这个阈值调大/调小：越大越“聪明”，但越慢
    EXACT_THRESHOLD = 2000

    # 候选池大时，抽样多少个 guess 来评分（越大越聪明，越慢）
    # n 越大，匹配计算越贵，抽样稍微保守一点
    if m > EXACT_THRESHOLD:
        sample_size = 250 if n <= 5 else 180
        # 保证不超过候选池大小
        sample_size = min(sample_size, m)
        guess_pool = random.sample(candidates, sample_size)
    else:
        guess_pool = candidates  # 精确：所有候选都当 guess 评一遍

    best_guess = None
    best_score = None

    # 一个小优化：打乱，避免总是偏向某些前缀
    # （尤其 candidates 是按 permutations 顺序生成的）
    guess_pool = list(guess_pool)
    random.shuffle(guess_pool)

    for g in guess_pool:
        sc = score_guess_minimax(g, candidates, n)
        if best_score is None or sc < best_score:
            best_score = sc
            best_guess = g

        # 早停：理论最优 worst-case 不可能小于 ceil(m/(n+1))
        # 如果已经达到这个下界，就很难再改进了，直接停
        lower_bound = (m + (n + 1) - 1) // (n + 1)
        if best_score[0] == lower_bound:
            break

    return best_guess

def validate_feedback(feedback_input, n):
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
    print("===== 程序猜数字游戏（Minimax版） =====")
    print("规则：你心里想一个n位数（3≤n≤8），无0、每位数字不重复")

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

    candidates = generate_candidates(n)
    guess_count = 0
    print(f"\n✅ 已准备好！你现在可以在心里想好一个{n}位数（无0、无重复）")
    input("想好后按Enter键开始游戏...")

    while len(candidates) > 0:
        guess = get_optimal_guess(candidates, n)
        if guess is None:
            print("\n❌ 候选池为空，可能是你输入的反馈有误！")
            return

        guess_count += 1
        print(f"\n【第{guess_count}次猜测】我猜：{guess}")

        while True:
            feedback_input = input(f"请告诉我有几位完全匹配（位置+数字都对，0~{n}）：")
            is_valid, feedback = validate_feedback(feedback_input, n)
            if is_valid:
                break

        if feedback == n:
            print(f"\n🎉 我猜中了！答案是：{guess}")
            print(f"📊 总共猜了 {guess_count} 次")
            return

        # 过滤候选池
        candidates = [c for c in candidates if count_exact_matches(guess, c) == feedback]

        print(f"🔍 剩余候选数：{len(candidates)} 个")
        # 强烈建议别打印全部 candidates，n=8 会爆炸刷屏
        # print(candidates)

    print("\n❌ 没有找到符合你所有反馈的数字，可能是你输入的反馈有误！")

if __name__ == "__main__":
    guess_number_game()
