import { db } from '../db';

/**
 * 把今天的健康数据 (步数 / 心率 / 睡眠) 拼成一段 system prompt 注入
 * 块. Wisteria 聊天发消息时自动从 db.healthDaily 拿最新一条 (今天
 * 的) 塞给 persona, 这样用户说 "我今天走了多少步" / "昨晚睡得怎
 * 么样" persona 直接知道, 不用她重复.
 *
 * 不主动提起 — 只在用户问起 / 上下文相关时引用.
 */
export async function formatHealthContextBlock(): Promise<string> {
  // 拿最近一条快照, 看是不是今天的. 不是今天就算了 — Body 页一开
  // 就会更新, 不太可能差太多.
  const all = await db.healthDaily.orderBy('date').reverse().limit(1).toArray();
  const latest = all[0];
  if (!latest) return '';

  const today = todayStr();
  const isToday = latest.date === today;
  if (!isToday) {
    // 不是今天的数据就只给一句, 让 persona 知道有过, 但别用旧的当今天
    return [
      '# 健康数据 (自动注入, 上次同步)',
      `- 最近同步: ${latest.date}, 当时步数 ${latest.steps}`,
      '不要主动提起, 只在相关时引用. 不知道今天最新数字.',
    ].join('\n');
  }

  const lines: string[] = ['# 健康数据 (自动注入, 今天截至刚才)'];
  lines.push(`- 步数: ${latest.steps}`);
  if (latest.heartRate.latest !== null) {
    lines.push(
      `- 心率: 最新 ${latest.heartRate.latest} BPM, 今日范围 ${latest.heartRate.min}–${latest.heartRate.max}`,
    );
  }
  if (latest.sleep && latest.sleep.totalMin > 0) {
    const totalH = Math.floor(latest.sleep.totalMin / 60);
    const totalM = latest.sleep.totalMin % 60;
    let sleepLine = `- 昨晚睡眠: ${totalH}时${totalM}分`;
    if (latest.sleep.deepMin > 0) {
      const dh = Math.floor(latest.sleep.deepMin / 60);
      const dm = latest.sleep.deepMin % 60;
      sleepLine += ` (深睡 ${dh}时${dm}分, 浅 ${Math.floor(latest.sleep.lightMin / 60)}时${latest.sleep.lightMin % 60}分, REM ${latest.sleep.remMin} 分)`;
    }
    lines.push(sleepLine);
  }
  // No sync HH:MM — minute clocks make this block unique every refresh and
  // burn uncached tokens for zero conversational value.
  lines.push('');
  lines.push('不要主动提起这些数字. 只在用户问起或对话直接相关时引用.');
  return lines.join('\n');
}

function todayStr(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
