/**
 * Clawd pixel-crab emotes — original SVG+CSS from
 * https://github.com/xixicc186/clawd-emotes-skill (MIT).
 * Attribution: xixicc186 / clawd-emotes-skill.
 */

export type ClawdEmoteId =
  | 'listening'
  | 'gaming'
  | 'singing'
  | 'reading'
  | 'eating'
  | 'exercise'
  | 'shower'
  | 'sleeping'
  | 'coffee'
  | 'painting'
  | 'photo'
  | 'watering'
  | 'guitar'
  | 'coding'
  | 'birthday'
  | 'spring'
  | 'mid-autumn'
  | 'dragon-boat'
  | 'christmas'
  | 'halloween'
  | 'new-year'
  | 'lantern'
  | 'valentine'
  | 'qixi'
;

export type ClawdEmoteMeta = {
  id: ClawdEmoteId;
  name: string;
  tag: string;
  desc: string;
};

export const CLAWD_EMOTE_META: ClawdEmoteMeta[] = [
  { id: 'listening', name: "听歌", tag: "Listening", desc: "戴耳机随节奏摇摆 · 双钳打拍子 · 音符飘飞 · 沉浸律动" },
  { id: 'gaming', name: "打游戏", tag: "Gaming", desc: "紧握手柄 · 双钳前倾操作 · 屏幕蓝光映脸 · 按键狂点 · 偶尔激动一跳" },
  { id: 'singing', name: "唱歌", tag: "Singing", desc: "手握话筒深情献唱 · 张嘴高歌 · 另一钳挥舞 · 音符四散 · 身体摇摆" },
  { id: 'reading', name: "看书", tag: "Reading", desc: "捧书阅读 · 目光逐行扫描 · 偶尔翻页 · 安静专注" },
  { id: 'eating', name: "吃饭", tag: "Eating", desc: "端碗夹菜 · 筷子来回送饭 · 嘴巴咀嚼 · 热气腾腾" },
  { id: 'exercise', name: "锻炼", tag: "Exercise", desc: "双钳举哑铃弯举 · 屈膝发力 · 咬牙坚持 · 汗水飞溅 · 红色头带" },
  { id: 'shower', name: "洗澡", tag: "Shower", desc: "花洒淋水 · 海绵搓洗 · 头顶泡沫 · 肥皂泡升腾 · 小黄鸭作伴" },
  { id: 'sleeping', name: "睡觉", tag: "Sleeping", desc: "闭眼酣睡 · 缓缓呼吸起伏 · 睡帽歪戴 · 鼻泡一鼓一瘪 · ZZZ 升腾" },
  { id: 'coffee', name: "喝咖啡", tag: "Coffee", desc: "双钳捧杯 · 热气袅袅升腾 · 仰头轻啜 · 提神回血" },
  { id: 'painting', name: "画画", tag: "Painting", desc: "左钳托调色盘 · 右钳挥画笔 · 蘸彩点染 · 灵感四溅" },
  { id: 'photo', name: "拍照", tag: "Photo", desc: "双钳端稳相机 · 对焦取景 · 咔嚓一闪 · 定格瞬间" },
  { id: 'watering', name: "浇花", tag: "Watering", desc: "举壶倾洒 · 细水浇灌 · 绿叶轻摇 · 小花绽放" },
  { id: 'guitar', name: "弹吉他", tag: "Guitar", desc: "抱琴扫弦 · 指尖按品 · 音符飞扬 · 自弹自唱" },
  { id: 'coding', name: "写代码", tag: "Coding", desc: "屏幕泛光映脸 · 双钳飞速敲键 · 光标闪烁 · 一行行码字" },
  { id: 'birthday', name: "生日快乐", tag: "Birthday", desc: "挥手雀跃 · 派对帽随身摆动 · 蜡烛火苗 · 八色纸屑纷飞" },
  { id: 'spring', name: "新年快乐", tag: "春节 · Spring Festival", desc: "拱手作揖 · 灯笼带流苏摇曳 · 菱形福字脉动 · 金币纷落" },
  { id: 'mid-autumn', name: "中秋快乐", tag: "中秋 · Mid-Autumn", desc: "举饼望月 · 玉兔轻浮于月轮 · 星辰闪烁 · 眼神追月" },
  { id: 'dragon-boat', name: "端午安康", tag: "端午 · Dragon Boat", desc: "坐镇龙舟 · 双桨破浪 · 船身起伏 · 龙首龙尾 · 粽子飘香 · 青巾束发" },
  { id: 'christmas', name: "圣诞快乐", tag: "圣诞 · Christmas", desc: "圣诞帽绒球摆动 · 雪花飘落 · 圣诞树星灯闪烁 · 红绿围巾" },
  { id: 'halloween', name: "万圣节", tag: "万圣节 · Halloween", desc: "悬浮飘动 · 女巫帽 · 橙瞳幽光 · 南瓜灯脉动 · 幽灵游荡 · 蝙蝠掠过" },
  { id: 'new-year', name: "元旦快乐", tag: "元旦 · New Year", desc: "举臂欢呼 · 三色烟花绽放 · 2026 跨年 · 张嘴大笑" },
  { id: 'lantern', name: "元宵节", tag: "元宵 · Lantern Festival", desc: "提灯漫步 · 灯笼暖光摇曳 · 一碗热汤圆 · 热气升腾" },
  { id: 'valentine', name: "情人节快乐", tag: "情人节 · Valentine", desc: "手捧玫瑰 · 红心眼怦怦跳 · 脸颊泛红 · 爱心冉冉升起" },
  { id: 'qixi', name: "七夕快乐", tag: "七夕 · Qixi", desc: "仰望星河 · 喜鹊飞渡鹊桥 · 牛郎织女双星 · 银河心动" },
];

const SVG: Record<ClawdEmoteId, string> = {
  'listening': `<svg xmlns="http://www.w3.org/2000/svg" viewBox="-15 -25 45 45">
<defs><style>
.lm-body{transform-origin:7.5px 13px;animation:lm-groove 1.1s infinite ease-in-out;}
.lm-shad{transform-origin:7.5px 15.5px;animation:lm-shadow 1.1s infinite ease-in-out;}
.lm-eye {transform-origin:7.5px 9px;animation:lm-blink 3s infinite;}
.lm-al  {transform-origin:2px 10px;animation:lm-tap-l .55s infinite alternate ease-in-out;}
.lm-ar  {transform-origin:13px 10px;animation:lm-tap-r .55s infinite alternate ease-in-out;}
.lm-note{opacity:0;animation:lm-note var(--d,2s) var(--delay,0s) infinite ease-out;}
@keyframes lm-groove{0%,100%{transform:rotate(-3deg) translateY(0);}50%{transform:rotate(3deg) translateY(-1px);}}
@keyframes lm-shadow{0%,100%{transform:scaleX(1);opacity:.5;}50%{transform:scaleX(.9);opacity:.42;}}
@keyframes lm-blink{0%,46%,54%,100%{transform:scaleY(1);}50%{transform:scaleY(.1);}}
@keyframes lm-tap-l{0%{transform:rotate(0);}100%{transform:rotate(22deg);}}
@keyframes lm-tap-r{0%{transform:rotate(0);}100%{transform:rotate(-22deg);}}
@keyframes lm-note{0%{opacity:0;transform:translate(0,0) rotate(0);}15%{opacity:1;}80%{opacity:.85;}100%{opacity:0;transform:translate(var(--tx,4px),-19px) rotate(var(--r,20deg));}}
</style></defs>

<!-- music notes -->
<g>
<g class="lm-note" style="--delay:0s;--d:1.9s;--tx:6px;--r:25deg" transform="translate(13,-2)" fill="#a98cff"><ellipse cx="0" cy="2" rx="1.1" ry=".85"/><rect x="1" y="-2" width=".7" height="4"/><rect x="1" y="-2" width="2.2" height=".8"/></g>
<g class="lm-note" style="--delay:-.7s;--d:2.2s;--tx:-5px;--r:-20deg" transform="translate(-2,-1)" fill="#c0a6ff"><ellipse cx="0" cy="1.6" rx=".9" ry=".7"/><rect x=".8" y="-1.6" width=".6" height="3.4"/></g>
<g class="lm-note" style="--delay:-1.3s;--d:2s;--tx:4px;--r:15deg" transform="translate(9,-3)" fill="#8c6cff"><ellipse cx="0" cy="1.6" rx="1" ry=".75"/><rect x=".9" y="-1.8" width=".6" height="3.6"/><rect x=".9" y="-1.8" width="1.8" height=".7"/></g>
</g>

<rect class="lm-shad" x="3" y="15" width="9" height="1" fill="#000" opacity=".5"/>
<g class="lm-body">
<g fill="#DE886D">
<rect x="3" y="13" width="1" height="2"/><rect x="5" y="13" width="1" height="2"/>
<rect x="9" y="13" width="1" height="2"/><rect x="11" y="13" width="1" height="2"/>
</g>
<rect x="2" y="6" width="11" height="7" fill="#DE886D"/>
<g class="lm-al"><rect x="0" y="9" width="2" height="2" fill="#DE886D"/></g>
<g class="lm-ar"><rect x="13" y="9" width="2" height="2" fill="#DE886D"/></g>
<!-- headphones -->
<path d="M1 6 Q7.5 -.5 14 6" stroke="#2b2b35" stroke-width="1.5" fill="none"/>
<rect x="-.4" y="6.2" width="2.6" height="3.6" rx=".9" fill="#33333f"/>
<rect x="12.8" y="6.2" width="2.6" height="3.6" rx=".9" fill="#33333f"/>
<rect x=".1" y="6.8" width="1.6" height="2.4" rx=".6" fill="#6a5ad0"/>
<rect x="13.3" y="6.8" width="1.6" height="2.4" rx=".6" fill="#6a5ad0"/>
<g class="lm-eye" fill="#000"><rect x="4" y="8" width="1" height="2"/><rect x="10" y="8" width="1" height="2"/></g>
</g>
</svg>`,
  'gaming': `<svg xmlns="http://www.w3.org/2000/svg" viewBox="-15 -25 45 45">
<defs><style>
.gm-body{transform-origin:7.5px 13px;animation:gm-lean 2.4s infinite ease-in-out;}
.gm-shad{transform-origin:7.5px 15.5px;animation:gm-shadow 2.4s infinite ease-in-out;}
.gm-eye {transform-origin:7.5px 9px;animation:gm-blink 2.8s infinite;}
.gm-al  {transform-origin:2px 10px;animation:gm-hold-l 2.4s infinite ease-in-out;}
.gm-ar  {transform-origin:13px 10px;animation:gm-hold-r 2.4s infinite ease-in-out;}
.gm-ba  {transform-origin:center;animation:gm-press .36s infinite alternate ease-in-out;}
.gm-bb  {transform-origin:center;animation:gm-press .36s -.18s infinite alternate ease-in-out;}
.gm-glow{animation:gm-glow .5s infinite alternate ease-in-out;}
.gm-scr {animation:gm-flick 2.4s infinite ease-in-out;}
.gm-spr {animation:gm-spr .8s infinite ease-in-out;}
.gm-enm {animation:gm-enm 1.1s infinite ease-in-out;}
@keyframes gm-flick{0%,100%{opacity:.96;}50%{opacity:1;}}
@keyframes gm-spr{0%,100%{transform:translateY(0);}50%{transform:translateY(-1.4px);}}
@keyframes gm-enm{0%,100%{transform:translateX(0);}50%{transform:translateX(-2px);}}
@keyframes gm-lean{0%,58%,100%{transform:translateY(0) rotate(0);}74%{transform:translateY(-2px) rotate(-2deg);}84%{transform:translateY(0) rotate(0);}}
@keyframes gm-shadow{0%,100%{transform:scaleX(1);opacity:.5;}74%{transform:scaleX(.9);opacity:.42;}}
@keyframes gm-blink{0%,45%,55%,100%{transform:scaleY(.82);}50%{transform:scaleY(.1);}}
@keyframes gm-hold-l{0%,100%{transform:rotate(46deg);}74%{transform:rotate(40deg);}}
@keyframes gm-hold-r{0%,100%{transform:rotate(-46deg);}74%{transform:rotate(-40deg);}}
@keyframes gm-press{0%{transform:translateY(-.3px);}100%{transform:translateY(.5px);}}
@keyframes gm-glow{0%{opacity:.1;}100%{opacity:.26;}}
</style></defs>

<!-- monitor / game screen (faced by crab) -->
<g class="gm-scr">
<rect x="-1" y="-12.5" width="18" height="11.4" rx="1.2" fill="#16161d"/>
<rect x=".4" y="-11.1" width="15.2" height="8.5" rx=".6" fill="#0b1626"/>
<rect x=".4" y="-4.9" width="15.2" height="2.3" fill="#15401b"/>
<rect class="gm-spr" x="2.4" y="-6.9" width="1.9" height="2" fill="#4ad6ff"/>
<rect class="gm-enm" x="10" y="-5" width="1.7" height="2.4" fill="#ff5a5a"/>
<rect x="12.8" y="-9.8" width="1.1" height="1.1" rx=".55" fill="#ffd14a"/>
<rect x="5.2" y="-10" width=".9" height=".9" fill="#fff" opacity=".6"/>
<rect x="7" y="-1.2" width="2.6" height="2" fill="#16161d"/>
<rect x="3.8" y=".8" width="9" height="1.4" rx=".6" fill="#16161d"/>
</g>

<rect class="gm-shad" x="3" y="15" width="9" height="1" fill="#000" opacity=".5"/>
<g class="gm-body">
<g fill="#DE886D">
<rect x="3" y="13" width="1" height="2"/><rect x="5" y="13" width="1" height="2"/>
<rect x="9" y="13" width="1" height="2"/><rect x="11" y="13" width="1" height="2"/>
</g>
<rect x="2" y="6" width="11" height="7" fill="#DE886D"/>
<!-- screen glow on face -->
<rect class="gm-glow" x="2" y="6" width="11" height="5" fill="#4ad6ff" rx="1"/>
<g class="gm-al"><rect x="0" y="9" width="2" height="2" fill="#DE886D"/></g>
<g class="gm-ar"><rect x="13" y="9" width="2" height="2" fill="#DE886D"/></g>
<g class="gm-eye" fill="#000"><rect x="4" y="8" width="1" height="2"/><rect x="10" y="8" width="1" height="2"/></g>
<!-- controller (foreground, held in front) -->
<g>
<rect x="2.6" y="10.4" width="9.8" height="2.8" rx="1.3" fill="#2b2b34"/>
<rect x="2.6" y="10.4" width="9.8" height=".9" rx="1.3" fill="#3a3a46"/>
<!-- d-pad -->
<rect x="4" y="11.4" width="1.8" height=".7" fill="#555"/>
<rect x="4.55" y="10.85" width=".7" height="1.8" fill="#555"/>
<!-- buttons -->
<circle class="gm-ba" cx="9.4" cy="11.3" r=".7" fill="#ff5555"/>
<circle class="gm-bb" cx="10.8" cy="12" r=".7" fill="#ffd14a"/>
</g>
</g>
</svg>`,
  'singing': `<svg xmlns="http://www.w3.org/2000/svg" viewBox="-15 -25 45 45">
<defs><style>
.sg-body{transform-origin:7.5px 13px;animation:sg-sway 1.4s infinite ease-in-out;}
.sg-shad{transform-origin:7.5px 15.5px;animation:sg-shadow 1.4s infinite ease-in-out;}
.sg-eye {transform-origin:7.5px 9px;animation:sg-blink 2.8s infinite;}
.sg-mouth{transform-origin:7.5px 11.5px;animation:sg-sing .5s infinite alternate ease-in-out;}
.sg-al  {transform-origin:2px 10px;animation:sg-wave 1.4s infinite ease-in-out;}
.sg-mic {transform-origin:11.5px 12px;animation:sg-michold 1.4s infinite ease-in-out;}
.sg-note{opacity:0;animation:sg-note var(--d,2s) var(--delay,0s) infinite ease-out;}
@keyframes sg-sway{0%,100%{transform:rotate(-3deg);}50%{transform:rotate(3deg);}}
@keyframes sg-shadow{0%,100%{transform:scaleX(1);opacity:.5;}50%{transform:scaleX(.92);opacity:.42;}}
@keyframes sg-blink{0%,44%,56%,100%{transform:scaleY(1);}50%{transform:scaleY(.1);}}
@keyframes sg-sing{0%{transform:scaleY(.45) scaleX(.9);}100%{transform:scaleY(1.15) scaleX(1.05);}}
@keyframes sg-wave{0%,100%{transform:rotate(42deg);}50%{transform:rotate(78deg) translateY(-1px);}}
@keyframes sg-michold{0%,100%{transform:rotate(-3deg);}50%{transform:rotate(3deg);}}
@keyframes sg-note{0%{opacity:0;transform:translate(0,0) rotate(0);}15%{opacity:1;}80%{opacity:.85;}100%{opacity:0;transform:translate(var(--tx,-5px),-18px) rotate(var(--r,-18deg));}}
</style></defs>

<!-- notes -->
<g>
<g class="sg-note" style="--delay:0s;--d:2s;--tx:-6px;--r:-25deg" transform="translate(0,-1)" fill="#ff7ab3"><ellipse cx="0" cy="2" rx="1.1" ry=".85"/><rect x="1" y="-2" width=".7" height="4"/><rect x="1" y="-2" width="2.2" height=".8"/></g>
<g class="sg-note" style="--delay:-.8s;--d:2.3s;--tx:-4px;--r:18deg" transform="translate(11,-2)" fill="#ff9ec8"><ellipse cx="0" cy="1.6" rx=".9" ry=".7"/><rect x=".8" y="-1.8" width=".6" height="3.6"/></g>
<g class="sg-note" style="--delay:-1.4s;--d:2.1s;--tx:-7px;--r:-12deg" transform="translate(5,-3)" fill="#ff5aa0"><ellipse cx="0" cy="1.6" rx="1" ry=".75"/><rect x=".9" y="-1.8" width=".6" height="3.6"/><rect x=".9" y="-1.8" width="1.8" height=".7"/></g>
</g>

<rect class="sg-shad" x="3" y="15" width="9" height="1" fill="#000" opacity=".5"/>
<g class="sg-body">
<g fill="#DE886D">
<rect x="3" y="13" width="1" height="2"/><rect x="5" y="13" width="1" height="2"/>
<rect x="9" y="13" width="1" height="2"/><rect x="11" y="13" width="1" height="2"/>
</g>
<rect x="2" y="6" width="11" height="7" fill="#DE886D"/>
<g class="sg-al"><rect x="0" y="9" width="2" height="2" fill="#DE886D"/></g>
<!-- right forearm bent down to grip the mic -->
<rect x="11" y="9" width="2" height="3.6" fill="#DE886D" rx=".5"/>
<g class="sg-eye" fill="#000"><rect x="4" y="8" width="1" height="2"/><rect x="10" y="8" width="1" height="2"/></g>
<!-- open singing mouth -->
<ellipse class="sg-mouth" cx="7" cy="11.2" rx="1.3" ry="1.2" fill="#7a2230"/>
<!-- microphone: handle connects the hand to the ball at the mouth -->
<g class="sg-mic">
<rect x="8.8" y="11.1" width="3.6" height="1" rx=".5" fill="#3a3a42" transform="rotate(24,11.5,12)"/>
<circle cx="8.7" cy="11" r="1.5" fill="#9a9aa2"/>
<circle cx="8.4" cy="10.6" r=".5" fill="#d6d6de"/>
<rect x="7.6" y="10.5" width="2.2" height=".35" fill="#555" transform="rotate(24,8.7,11)"/>
<rect x="7.6" y="11.2" width="2.2" height=".35" fill="#555" transform="rotate(24,8.7,11)"/>
</g>
</g>
</svg>`,
  'reading': `<svg xmlns="http://www.w3.org/2000/svg" viewBox="-15 -25 45 45">
<defs><style>
.rd-body{transform-origin:7.5px 13px;animation:rd-bob 4.2s infinite ease-in-out;}
.rd-shad{transform-origin:7.5px 15.5px;animation:rd-shadow 4.2s infinite ease-in-out;}
.rd-eye {transform-origin:7.5px 9px;animation:rd-scan 4.2s infinite ease-in-out;}
.rd-page{transform-origin:7.5px 11px;animation:rd-flip 4.2s infinite ease-in-out;}
@keyframes rd-bob{0%,100%{transform:translateY(0);}50%{transform:translateY(-.5px);}}
@keyframes rd-shadow{0%,100%{transform:scaleX(1);opacity:.5;}50%{transform:scaleX(.97);opacity:.46;}}
@keyframes rd-scan{
0%,8%{transform:translateX(-.9px) scaleY(1);}
12%{transform:translateX(-.9px) scaleY(.15);}
16%,42%{transform:translateX(-.9px) scaleY(1);}
50%,90%{transform:translateX(.9px) scaleY(1);}
100%{transform:translateX(-.9px) scaleY(1);}
}
@keyframes rd-flip{0%,72%,100%{transform:scaleX(1);}80%{transform:scaleX(.08);}88%{transform:scaleX(1);}}
</style></defs>

<rect class="rd-shad" x="3" y="15" width="9" height="1" fill="#000" opacity=".5"/>
<g class="rd-body">
<g fill="#DE886D">
<rect x="3" y="13" width="1" height="2"/><rect x="5" y="13" width="1" height="2"/>
<rect x="9" y="13" width="1" height="2"/><rect x="11" y="13" width="1" height="2"/>
</g>
<rect x="2" y="6" width="11" height="7" fill="#DE886D"/>
<g class="rd-eye" fill="#000"><rect x="4" y="8" width="1" height="2"/><rect x="10" y="8" width="1" height="2"/></g>
<!-- arms holding book -->
<rect x="-.3" y="9.6" width="2.6" height="2" fill="#DE886D" rx=".4" transform="rotate(28,1,10.6)"/>
<rect x="12.7" y="9.6" width="2.6" height="2" fill="#DE886D" rx=".4" transform="rotate(-28,14,10.6)"/>
<!-- open book (foreground) -->
<g>
<polygon points="1.6,12.4 2.8,9.4 7.5,9.9 7.5,12.6" fill="#8a5a2a"/>
<polygon points="13.4,12.4 12.2,9.4 7.5,9.9 7.5,12.6" fill="#7a4e22"/>
<polygon points="2.2,12.1 3.2,9.7 7.5,10.1 7.5,12.2" fill="#F5E6C8"/>
<g class="rd-page"><polygon points="12.8,12.1 11.8,9.7 7.5,10.1 7.5,12.2" fill="#FBF1D8"/></g>
<g stroke="#c9b48a" stroke-width=".25">
<line x1="3.4" y1="10.6" x2="6.9" y2="10.9"/>
<line x1="3.3" y1="11.3" x2="6.9" y2="11.5"/>
<line x1="8.1" y1="10.9" x2="11.6" y2="10.6"/>
<line x1="8.1" y1="11.5" x2="11.7" y2="11.3"/>
</g>
<rect x="7.2" y="9.7" width=".6" height="2.9" fill="#5e3c1a"/>
</g>
</g>
</svg>`,
  'eating': `<svg xmlns="http://www.w3.org/2000/svg" viewBox="-15 -25 45 45">
<defs><style>
.et-body{transform-origin:7.5px 13px;animation:et-bob 1.8s infinite ease-in-out;}
.et-shad{transform-origin:7.5px 15.5px;animation:et-shadow 1.8s infinite ease-in-out;}
.et-eye {transform-origin:7.5px 9px;animation:et-blink 3.4s infinite;}
.et-mouth{transform-origin:7.5px 11.3px;animation:et-chew .45s infinite alternate ease-in-out;}
.et-arm {transform-origin:13px 10px;animation:et-feed 1.8s infinite ease-in-out;}
.et-steam{opacity:0;animation:et-steam 2s var(--sd,0s) infinite ease-in;}
@keyframes et-bob{0%,100%{transform:translateY(0);}50%{transform:translateY(-.4px);}}
@keyframes et-shadow{0%,100%{transform:scaleX(1);opacity:.5;}50%{transform:scaleX(.97);opacity:.46;}}
@keyframes et-blink{0%,46%,54%,100%{transform:scaleY(1);}50%{transform:scaleY(.1);}}
@keyframes et-chew{0%{transform:scaleY(.5);}100%{transform:scaleY(1);}}
@keyframes et-feed{0%,12%{transform:rotate(-13deg);}48%{transform:rotate(3deg);}82%,100%{transform:rotate(-13deg);}}
@keyframes et-steam{0%{opacity:0;transform:translate(0,0) scaleX(1);}25%{opacity:.7;}100%{opacity:0;transform:translate(var(--tx,1px),-7px) scaleX(.4);}}
</style></defs>

<rect class="et-shad" x="3" y="15" width="9" height="1" fill="#000" opacity=".5"/>
<g class="et-body">
<g fill="#DE886D">
<rect x="3" y="13" width="1" height="2"/><rect x="5" y="13" width="1" height="2"/>
<rect x="9" y="13" width="1" height="2"/><rect x="11" y="13" width="1" height="2"/>
</g>
<rect x="2" y="6" width="11" height="7" fill="#DE886D"/>
<g class="et-eye" fill="#000"><rect x="4" y="8" width="1" height="2"/><rect x="10" y="8" width="1" height="2"/></g>
<rect class="et-mouth" x="6.4" y="10.7" width="2.2" height="1.2" rx=".5" fill="#7a2230"/>
<!-- left arm supports bowl -->
<rect x="-.4" y="10.4" width="2.6" height="2" fill="#DE886D" rx=".4" transform="rotate(34,1,11.4)"/>
<!-- right arm holding chopsticks (pivots at shoulder 13,10) -->
<g class="et-arm">
<rect x="13" y="9" width="2" height="2" fill="#DE886D"/>
<rect x="6.2" y="11.2" width="7.6" height=".5" rx=".25" fill="#C9A227" transform="rotate(-7,13,10)"/>
<rect x="6.2" y="12.3" width="7.6" height=".5" rx=".25" fill="#C9A227" transform="rotate(-7,13,10)"/>
<rect x="5.6" y="11" width="1.5" height="1.5" rx=".5" fill="#E8B04B" transform="rotate(-7,13,10)"/>
</g>
<!-- bowl (foreground) -->
<g>
<g fill="#fff">
<g class="et-steam" style="--sd:0s;--tx:-1px"><rect x="3.6" y="9.6" width=".7" height="2" rx=".35"/></g>
<g class="et-steam" style="--sd:-1s;--tx:1px"><rect x="5.6" y="9.6" width=".7" height="2" rx=".35"/></g>
</g>
<path d="M2 11.6 H9 L8 14 Q5.5 15 3 14 Z" fill="#3f7fd0"/>
<path d="M2 11.6 H9 V12.4 H2 Z" fill="#5a9aea"/>
<ellipse cx="5.5" cy="11.7" rx="3.2" ry="1.1" fill="#FBF6EE"/>
</g>
</g>
</svg>`,
  'exercise': `<svg xmlns="http://www.w3.org/2000/svg" viewBox="-15 -25 45 45">
<defs><style>
.ex-body{transform-origin:7.5px 13px;animation:ex-squat 1s infinite ease-in-out;}
.ex-shad{transform-origin:7.5px 15.5px;animation:ex-shadow 1s infinite ease-in-out;}
.ex-eye {transform-origin:7.5px 9px;animation:ex-eye 1s infinite ease-in-out;}
.ex-al  {transform-origin:2px 10px;animation:ex-curl-l 1s infinite ease-in-out;}
.ex-ar  {transform-origin:13px 10px;animation:ex-curl-r 1s infinite ease-in-out;}
.ex-sweat{opacity:0;animation:ex-sweat 1s var(--sd,0s) infinite ease-out;}
@keyframes ex-squat{0%,100%{transform:translateY(0) scaleY(1);}50%{transform:translateY(1px) scaleY(.93);}}
@keyframes ex-shadow{0%,100%{transform:scaleX(1);opacity:.5;}50%{transform:scaleX(1.06);opacity:.55;}}
@keyframes ex-eye{0%,100%{transform:scaleY(.7);}50%{transform:scaleY(.5);}}
@keyframes ex-curl-l{0%,100%{transform:rotate(12deg);}50%{transform:rotate(74deg);}}
@keyframes ex-curl-r{0%,100%{transform:rotate(-12deg);}50%{transform:rotate(-74deg);}}
@keyframes ex-sweat{0%{opacity:0;transform:translate(0,0);}20%{opacity:1;}100%{opacity:0;transform:translate(var(--tx,3px),6px);}}
</style></defs>

<!-- sweat drops -->
<g fill="#7ec8ff">
<g class="ex-sweat" style="--sd:0s;--tx:4px"><rect x="13" y="4" width="1.2" height="1.6" rx=".6"/></g>
<g class="ex-sweat" style="--sd:-.5s;--tx:-4px"><rect x="0" y="5" width="1.2" height="1.6" rx=".6"/></g>
</g>

<rect class="ex-shad" x="3" y="15" width="9" height="1" fill="#000" opacity=".5"/>
<g class="ex-body">
<g fill="#DE886D">
<rect x="3" y="13" width="1" height="2"/><rect x="5" y="13" width="1" height="2"/>
<rect x="9" y="13" width="1" height="2"/><rect x="11" y="13" width="1" height="2"/>
</g>
<rect x="2" y="6" width="11" height="7" fill="#DE886D"/>
<!-- sweatband -->
<rect x="2" y="6.3" width="11" height="1.3" fill="#ff5555"/>
<rect x="2" y="6.3" width="11" height=".5" fill="#ff8888"/>
<!-- left arm + dumbbell -->
<g class="ex-al">
<rect x="0" y="9" width="2" height="2" fill="#DE886D"/>
<rect x="-1.6" y="9.6" width="5.2" height=".9" fill="#222"/>
<rect x="-1.8" y="8.9" width="1" height="2.3" rx=".2" fill="#3a3a3a"/>
<rect x="2.8" y="8.9" width="1" height="2.3" rx=".2" fill="#3a3a3a"/>
</g>
<!-- right arm + dumbbell -->
<g class="ex-ar">
<rect x="13" y="9" width="2" height="2" fill="#DE886D"/>
<rect x="11.4" y="9.6" width="5.2" height=".9" fill="#222"/>
<rect x="11.2" y="8.9" width="1" height="2.3" rx=".2" fill="#3a3a3a"/>
<rect x="15.8" y="8.9" width="1" height="2.3" rx=".2" fill="#3a3a3a"/>
</g>
<g class="ex-eye" fill="#000"><rect x="4" y="8" width="1" height="2"/><rect x="10" y="8" width="1" height="2"/></g>
</g>
</svg>`,
  'shower': `<svg xmlns="http://www.w3.org/2000/svg" viewBox="-15 -25 45 45">
<defs><style>
.sh-body{transform-origin:7.5px 13px;animation:sh-sway 2.2s infinite ease-in-out;}
.sh-shad{transform-origin:7.5px 15.5px;animation:sh-shadow 2.2s infinite ease-in-out;}
.sh-eye {transform-origin:7.5px 9px;animation:sh-blink 3s infinite;}
.sh-arm {transform-origin:13px 10px;animation:sh-scrub .5s infinite alternate ease-in-out;}
.sh-water{opacity:0;animation:sh-water 1.1s var(--sd,0s) infinite linear;}
.sh-bubble{opacity:0;animation:sh-bubble var(--d,2.4s) var(--sd,0s) infinite ease-out;}
@keyframes sh-sway{0%,100%{transform:rotate(-2deg);}50%{transform:rotate(2deg);}}
@keyframes sh-shadow{0%,100%{transform:scaleX(1);opacity:.5;}50%{transform:scaleX(.95);opacity:.45;}}
@keyframes sh-blink{0%,45%,55%,100%{transform:scaleY(.7);}50%{transform:scaleY(.1);}}
@keyframes sh-scrub{0%{transform:rotate(-26deg) translateX(0);}100%{transform:rotate(-50deg) translateX(-.6px);}}
@keyframes sh-water{0%{opacity:0;transform:translateY(-2px);}15%{opacity:.85;}100%{opacity:0;transform:translateY(18px);}}
@keyframes sh-bubble{0%{opacity:0;transform:translate(0,0) scale(.4);}25%{opacity:.7;}100%{opacity:0;transform:translate(var(--tx,3px),-15px) scale(1.1);}}
</style></defs>

<!-- shower head -->
<g>
<rect x="6.5" y="-23" width="2" height="3" fill="#8a98a0"/>
<path d="M2 -20 H13 L11.5 -18 H3.5 Z" fill="#aab6bd"/>
<rect x="3.5" y="-18.4" width="8" height=".6" fill="#87949b"/>
</g>
<!-- water -->
<g fill="#7ec8ff">
<rect class="sh-water" style="--sd:0s"   x="3.5" y="-17" width=".8" height="2.4" rx=".4"/>
<rect class="sh-water" style="--sd:-.3s" x="6"   y="-17" width=".8" height="2.4" rx=".4"/>
<rect class="sh-water" style="--sd:-.6s" x="8.5" y="-17" width=".8" height="2.4" rx=".4"/>
<rect class="sh-water" style="--sd:-.15s" x="10.8" y="-17" width=".8" height="2.4" rx=".4"/>
<rect class="sh-water" style="--sd:-.45s" x="4.8" y="-17" width=".7" height="2" rx=".35"/>
<rect class="sh-water" style="--sd:-.75s" x="9.6" y="-17" width=".7" height="2" rx=".35"/>
</g>
<!-- soap bubbles -->
<g fill="#cfeeff">
<g class="sh-bubble" style="--d:2.4s;--sd:0s;--tx:4px"><circle cx="13" cy="10" r="1.3" opacity=".6"/><circle cx="12.6" cy="9.6" r=".4" fill="#fff"/></g>
<g class="sh-bubble" style="--d:2.8s;--sd:-1s;--tx:-3px"><circle cx="1" cy="11" r="1" opacity=".6"/><circle cx=".7" cy="10.7" r=".3" fill="#fff"/></g>
<g class="sh-bubble" style="--d:2.2s;--sd:-1.6s;--tx:2px"><circle cx="14" cy="12" r=".8" opacity=".55"/></g>
</g>

<rect class="sh-shad" x="3" y="15" width="9" height="1" fill="#000" opacity=".5"/>
<g class="sh-body">
<g fill="#DE886D">
<rect x="3" y="13" width="1" height="2"/><rect x="5" y="13" width="1" height="2"/>
<rect x="9" y="13" width="1" height="2"/><rect x="11" y="13" width="1" height="2"/>
</g>
<rect x="2" y="6" width="11" height="7" fill="#DE886D"/>
<g class="sh-eye" fill="#000"><rect x="4" y="8" width="1" height="2"/><rect x="10" y="8" width="1" height="2"/></g>
<g class="sh-al"><rect x="0" y="9" width="2" height="2" fill="#DE886D"/></g>
<!-- right arm with sponge -->
<g class="sh-arm">
<rect x="13" y="9" width="2" height="2" fill="#DE886D"/>
<rect x="10.2" y="8.4" width="2.6" height="2.2" rx=".4" fill="#ffd95e"/>
<rect x="10.4" y="8.7" width="2.2" height=".7" fill="#fff" opacity=".5"/>
</g>
<!-- foam on head -->
<g fill="#fff">
<circle cx="4" cy="5" r="1.6"/><circle cx="7.5" cy="4.2" r="2"/><circle cx="11" cy="5" r="1.6"/>
<circle cx="5.8" cy="5.2" r="1.4"/><circle cx="9.2" cy="5.2" r="1.4"/>
</g>
</g>
<!-- rubber duck (foreground) -->
<g transform="translate(9.5,13.6)">
<ellipse cx="1.6" cy="1.6" rx="2" ry="1.4" fill="#FFD22E"/>
<circle cx="3.2" cy=".3" r="1.1" fill="#FFD22E"/>
<rect x="3.9" y=".1" width="1.4" height=".8" rx=".3" fill="#FF9000"/>
<circle cx="3.4" cy="0" r=".25" fill="#000"/>
</g>
</svg>`,
  'sleeping': `<svg xmlns="http://www.w3.org/2000/svg" viewBox="-15 -25 45 45">
<defs><style>
.sl-body{transform-origin:7.5px 13px;animation:sl-breathe 3.6s infinite ease-in-out;}
.sl-shad{transform-origin:7.5px 15.5px;animation:sl-shadow 3.6s infinite ease-in-out;}
.sl-bubble{transform-origin:12px 10px;animation:sl-bub 3.6s infinite ease-in-out;}
.sl-z   {opacity:0;animation:sl-z var(--d,3s) var(--delay,0s) infinite ease-out;}
@keyframes sl-breathe{0%,100%{transform:translateY(0) scaleY(1);}50%{transform:translateY(.5px) scaleY(.96);}}
@keyframes sl-shadow{0%,100%{transform:scaleX(1);opacity:.5;}50%{transform:scaleX(1.03);opacity:.46;}}
@keyframes sl-bub{0%,60%,100%{transform:scale(.2);opacity:0;}30%{transform:scale(1);opacity:.7;}}
@keyframes sl-z{0%{opacity:0;transform:translate(0,0) scale(.6);}20%{opacity:1;}80%{opacity:.8;}100%{opacity:0;transform:translate(var(--tx,6px),-15px) scale(1.3);}}
</style></defs>

<!-- ZZZ -->
<g fill="#8ca0ff" font-family="monospace" font-weight="bold">
<text class="sl-z" style="--delay:0s;--d:3s;--tx:7px"   x="11" y="-2" font-size="3.4">Z</text>
<text class="sl-z" style="--delay:-1s;--d:3s;--tx:6px"  x="13" y="-6" font-size="4.4">Z</text>
<text class="sl-z" style="--delay:-2s;--d:3s;--tx:5px"  x="15" y="-11" font-size="5.6">Z</text>
</g>

<!-- ground shadow under bed -->
<ellipse class="sl-shad" cx="7.5" cy="17.4" rx="13" ry="1.3" fill="#000" opacity=".4"/>
<!-- bed: frame + pillow (behind crab) -->
<g>
<rect x="-6" y="13.4" width="27" height="4.4" rx="1.3" fill="#473b59"/>
<rect x="-6" y="13.4" width="27" height="1.2" rx="1.3" fill="#5d4f73"/>
<rect x="-5" y="11.7" width="25" height="2.6" rx="1.3" fill="#dfe4ff"/>
<!-- pillow behind head -->
<rect x="-2" y="8.6" width="18" height="5" rx="2.4" fill="#eef1ff"/>
<rect x="-2" y="8.6" width="18" height="1.6" rx="2.4" fill="#ffffff"/>
</g>
<g class="sl-body">
<g fill="#DE886D">
<rect x="3" y="13" width="1" height="2"/><rect x="5" y="13" width="1" height="2"/>
<rect x="9" y="13" width="1" height="2"/><rect x="11" y="13" width="1" height="2"/>
</g>
<rect x="2" y="6" width="11" height="7" fill="#DE886D"/>
<rect x="0" y="9" width="2" height="2" fill="#DE886D"/>
<rect x="13" y="9" width="2" height="2" fill="#DE886D"/>
<!-- closed sleeping eyes -->
<g fill="#000"><rect x="3.6" y="8.9" width="2" height=".7" rx=".35"/><rect x="9.4" y="8.9" width="2" height=".7" rx=".35"/></g>
<!-- sleep bubble at nose -->
<circle class="sl-bubble" cx="12.4" cy="9.6" r="1.1" fill="#cfe0ff" opacity=".6"/>
<!-- nightcap (soft droopy, not pointy) -->
<rect x="1.6" y="4.8" width="11.5" height="1.6" fill="#3E5C8A" rx=".4"/>
<rect x="1.6" y="4.8" width="11.5" height=".6" fill="#587CB0"/>
<path d="M2.5 5 Q3 0.8 7 -0.2 Q11.4 -1.2 13 1.6 Q13.7 2.8 12.2 3.2 Q10 1.8 7 2.2 Q4 2.6 2.5 5 Z" fill="#4A6FA5"/>
<path d="M2.5 5 Q3.4 1.8 6.5 1 Q9 .4 10.6 1.6 Q8.5 1.6 6 2.2 Q3.8 2.8 2.5 5 Z" fill="#587CB0" opacity=".5"/>
<circle cx="12.6" cy="2" r="1.6" fill="#fff"/>
</g>
<!-- blanket over lower body (foreground) -->
<g>
<path d="M-5 12.4 Q7.5 10.9 20 12.4 L20 15.6 Q7.5 17 -5 15.6 Z" fill="#3E5C8A"/>
<path d="M-5 12.4 Q7.5 10.9 20 12.4 L20 13.4 Q7.5 11.9 -5 13.4 Z" fill="#6E8FC4"/>
</g>
</svg>`,
  'coffee': `<svg xmlns="http://www.w3.org/2000/svg" viewBox="-15 -25 45 45">
<defs><style>
.cf-body{transform-origin:7.5px 13px;animation:cf-sip 3.4s infinite ease-in-out;}
.cf-shad{transform-origin:7.5px 15.5px;animation:cf-shadow 3.4s infinite ease-in-out;}
.cf-eye {transform-origin:7.5px 9px;animation:cf-blink 3s infinite;}
.cf-steam{opacity:0;animation:cf-steam 2.4s var(--sd,0s) infinite ease-in;}
@keyframes cf-sip{0%,55%,100%{transform:rotate(0) translateY(0);}72%{transform:rotate(-7deg) translateY(-1px);}88%{transform:rotate(0) translateY(0);}}
@keyframes cf-shadow{0%,100%{transform:scaleX(1);opacity:.5;}72%{transform:scaleX(.93);opacity:.44;}}
@keyframes cf-blink{0%,46%,54%,100%{transform:scaleY(1);}50%{transform:scaleY(.1);}}
@keyframes cf-steam{0%{opacity:0;transform:translate(0,0) scaleX(1);}30%{opacity:.6;}100%{opacity:0;transform:translate(var(--tx,1px),-8px) scaleX(.5);}}
</style></defs>

<rect class="cf-shad" x="3" y="15" width="9" height="1" fill="#000" opacity=".5"/>
<g class="cf-body">
<g fill="#DE886D">
<rect x="3" y="13" width="1" height="2"/><rect x="5" y="13" width="1" height="2"/>
<rect x="9" y="13" width="1" height="2"/><rect x="11" y="13" width="1" height="2"/>
</g>
<rect x="2" y="6" width="11" height="7" fill="#DE886D"/>
<g class="cf-eye" fill="#000"><rect x="4" y="8" width="1" height="2"/><rect x="10" y="8" width="1" height="2"/></g>
<rect x="6.4" y="10.8" width="2.2" height="1" rx=".5" fill="#7a2230"/>
<!-- arms cupping mug -->
<rect x="0.4" y="10" width="2" height="2.2" rx=".3" fill="#DE886D" transform="rotate(40,1.4,11)"/>
<rect x="12.6" y="10" width="2" height="2.2" rx=".3" fill="#DE886D" transform="rotate(-40,13.6,11)"/>
<!-- steam -->
<g fill="#fff">
<rect class="cf-steam" style="--sd:0s;--tx:-1px"   x="5.6" y="8.2" width=".7" height="2.4" rx=".35"/>
<rect class="cf-steam" style="--sd:-1.2s;--tx:1px" x="8"   y="8.2" width=".7" height="2.4" rx=".35"/>
</g>
<!-- mug (foreground) -->
<g>
<path d="M11 11 q2.4 .2 2.4 1.6 q0 1.5 -2.4 1.4" fill="none" stroke="#efe9df" stroke-width=".9"/>
<rect x="4" y="10.4" width="7" height="3.6" rx=".7" fill="#efe9df"/>
<rect x="4" y="10.4" width="7" height="1" rx=".7" fill="#fff"/>
<ellipse cx="7.5" cy="10.7" rx="2.9" ry=".8" fill="#5b3a22"/>
</g>
</g>
</svg>`,
  'painting': `<svg xmlns="http://www.w3.org/2000/svg" viewBox="-15 -25 45 45">
<defs><style>
.pt-body{transform-origin:7.5px 13px;animation:pt-bob 2.6s infinite ease-in-out;}
.pt-shad{transform-origin:7.5px 15.5px;animation:pt-shadow 2.6s infinite ease-in-out;}
.pt-eye {transform-origin:7.5px 9px;animation:pt-blink 3.2s infinite;}
.pt-brush{transform-origin:13px 10px;animation:pt-dab 1s infinite alternate ease-in-out;}
.pt-spark{opacity:0;animation:pt-spark 2s var(--sd,0s) infinite ease-out;}
@keyframes pt-bob{0%,100%{transform:translateY(0);}50%{transform:translateY(-.4px);}}
@keyframes pt-shadow{0%,100%{transform:scaleX(1);opacity:.5;}50%{transform:scaleX(.97);opacity:.46;}}
@keyframes pt-blink{0%,47%,53%,100%{transform:scaleY(1);}50%{transform:scaleY(.1);}}
@keyframes pt-dab{0%{transform:rotate(-32deg);}100%{transform:rotate(-6deg);}}
@keyframes pt-spark{0%{opacity:0;transform:translateY(0) scale(.4);}30%{opacity:1;}100%{opacity:0;transform:translateY(-6px) scale(1);}}
</style></defs>

<rect class="pt-shad" x="3" y="15" width="9" height="1" fill="#000" opacity=".5"/>
<g class="pt-body">
<g fill="#DE886D">
<rect x="3" y="13" width="1" height="2"/><rect x="5" y="13" width="1" height="2"/>
<rect x="9" y="13" width="1" height="2"/><rect x="11" y="13" width="1" height="2"/>
</g>
<rect x="2" y="6" width="11" height="7" fill="#DE886D"/>
<g class="pt-eye" fill="#000"><rect x="4" y="8" width="1" height="2"/><rect x="10" y="8" width="1" height="2"/></g>
<!-- left arm holds palette -->
<rect x="0" y="9" width="2" height="2" fill="#DE886D"/>
<g>
<ellipse cx="-1.6" cy="11.6" rx="3.5" ry="2.4" fill="#caa46e"/>
<ellipse cx="-1.4" cy="12" rx="1" ry=".8" fill="#1a1208"/>
<circle cx="-3.4" cy="10.8" r=".7" fill="#ff5a5a"/><circle cx="-1.8" cy="9.9" r=".7" fill="#4ad6ff"/>
<circle cx="-.1" cy="10.4" r=".7" fill="#ffd14a"/><circle cx="-3.2" cy="12.4" r=".7" fill="#5ad17a"/>
</g>
<!-- right arm with brush -->
<g class="pt-brush">
<rect x="13" y="9" width="2" height="2" fill="#DE886D"/>
<rect x="10.1" y="3" width=".8" height="7" rx=".3" fill="#a9743a" transform="rotate(30,10.5,6.5)"/>
<polygon points="8.6,3.6 10.4,2.2 11,3.4 9.4,4.6" fill="#ff5a5a"/>
</g>
<!-- paint sparkles -->
<g>
<rect class="pt-spark" style="--sd:0s"    x="7.6" y="1.6" width="1" height="1" rx=".2" fill="#4ad6ff"/>
<rect class="pt-spark" style="--sd:-.9s"  x="11"  y="2.4" width="1" height="1" rx=".2" fill="#ffd14a"/>
<rect class="pt-spark" style="--sd:-1.4s" x="9.4" y="0.6" width="1" height="1" rx=".2" fill="#ff5a5a"/>
</g>
</g>
</svg>`,
  'photo': `<svg xmlns="http://www.w3.org/2000/svg" viewBox="-15 -25 45 45">
<defs><style>
.ph-body{transform-origin:7.5px 13px;animation:ph-bob 3s infinite ease-in-out;}
.ph-shad{transform-origin:7.5px 15.5px;animation:ph-shadow 3s infinite ease-in-out;}
.ph-flash{animation:ph-flash 2.4s infinite;}
.ph-burst{opacity:0;transform-origin:center;animation:ph-burst 2.4s infinite;}
@keyframes ph-bob{0%,100%{transform:translateY(0);}50%{transform:translateY(-.4px);}}
@keyframes ph-shadow{0%,100%{transform:scaleX(1);opacity:.5;}50%{transform:scaleX(.97);opacity:.46;}}
@keyframes ph-flash{0%,92%,100%{fill:#7a7d86;}95%{fill:#fffbe0;}}
@keyframes ph-burst{0%,90%,100%{opacity:0;transform:scale(.3);}94%{opacity:.85;transform:scale(1);}}
</style></defs>

<rect class="ph-shad" x="3" y="15" width="9" height="1" fill="#000" opacity=".5"/>
<g class="ph-body">
<g fill="#DE886D">
<rect x="3" y="13" width="1" height="2"/><rect x="5" y="13" width="1" height="2"/>
<rect x="9" y="13" width="1" height="2"/><rect x="11" y="13" width="1" height="2"/>
</g>
<rect x="2" y="6" width="11" height="7" fill="#DE886D"/>
<!-- little smile below camera -->
<rect x="6.2" y="11.4" width="2.6" height=".8" rx=".4" fill="#7a2230"/>
<!-- arms gripping camera -->
<rect x="0.6" y="8.8" width="2.4" height="2" rx=".3" fill="#DE886D" transform="rotate(34,1.8,9.8)"/>
<rect x="12" y="8.8" width="2.4" height="2" rx=".3" fill="#DE886D" transform="rotate(-34,13.2,9.8)"/>
<!-- camera (covers upper face) -->
<g>
<rect x="8.4" y="5.6" width="2.4" height="1.6" rx=".3" fill="#3a3a44"/>
<rect x="2.6" y="6.6" width="9" height="4.6" rx=".7" fill="#2b2b34"/>
<rect x="2.6" y="6.6" width="9" height="1" rx=".7" fill="#3a3a46"/>
<circle cx="7" cy="9" r="2" fill="#1a1a20"/>
<circle cx="7" cy="9" r="1.3" fill="#46566b"/>
<circle cx="6.5" cy="8.5" r=".5" fill="#a9c4e0"/>
<rect class="ph-flash" x="3.2" y="7" width="1.6" height="1.1" rx=".25"/>
</g>
<!-- flash burst -->
<g class="ph-burst" fill="#fffbe0">
<polygon points="0.4,4 1.1,5.6 0.4,7.2 -0.3,5.6"/>
<polygon points="-1.4,5.6 0.2,4.9 1.8,5.6 0.2,6.3"/>
</g>
</g>
</svg>`,
  'watering': `<svg xmlns="http://www.w3.org/2000/svg" viewBox="-15 -25 45 45">
<defs><style>
.wt-body{transform-origin:7.5px 13px;animation:wt-bob 2.8s infinite ease-in-out;}
.wt-shad{transform-origin:7.5px 15.5px;animation:wt-shadow 2.8s infinite ease-in-out;}
.wt-eye {transform-origin:7.5px 9px;animation:wt-blink 3.4s infinite;}
.wt-can {transform-origin:13px 10px;animation:wt-tip 2.8s infinite ease-in-out;}
.wt-drop{opacity:0;animation:wt-drop 1s var(--sd,0s) infinite linear;}
.wt-leaf{transform-origin:1px 13px;animation:wt-sway 2.8s infinite ease-in-out;}
@keyframes wt-bob{0%,100%{transform:translateY(0);}50%{transform:translateY(-.4px);}}
@keyframes wt-shadow{0%,100%{transform:scaleX(1);opacity:.5;}50%{transform:scaleX(.97);opacity:.46;}}
@keyframes wt-blink{0%,46%,54%,100%{transform:scaleY(1);}50%{transform:scaleY(.1);}}
@keyframes wt-tip{0%,100%{transform:rotate(-4deg);}50%{transform:rotate(-16deg);}}
@keyframes wt-drop{0%{opacity:0;transform:translateY(-1px);}20%{opacity:.9;}100%{opacity:0;transform:translateY(7px);}}
@keyframes wt-sway{0%,100%{transform:rotate(-3deg);}50%{transform:rotate(3deg);}}
</style></defs>

<rect class="wt-shad" x="3" y="15" width="9" height="1" fill="#000" opacity=".5"/>
<g class="wt-body">
<g fill="#DE886D">
<rect x="3" y="13" width="1" height="2"/><rect x="5" y="13" width="1" height="2"/>
<rect x="9" y="13" width="1" height="2"/><rect x="11" y="13" width="1" height="2"/>
</g>
<rect x="2" y="6" width="11" height="7" fill="#DE886D"/>
<g class="wt-eye" fill="#000"><rect x="4" y="8" width="1" height="2"/><rect x="10" y="8" width="1" height="2"/></g>
<rect x="0" y="9" width="2" height="2" fill="#DE886D"/>
<rect x="13" y="9" width="2" height="2" fill="#DE886D"/>
<!-- right arm tilting watering can over the plant -->
<g class="wt-can">
<rect x="13.6" y="4.4" width="5.2" height="3.8" rx=".8" fill="#6fb3c9"/>
<rect x="13.6" y="4.4" width="5.2" height="1.1" rx=".8" fill="#8fd0e2"/>
<path d="M13.8 7.6 L10.2 6.6 L9.8 7.9 L13.6 8.7 Z" fill="#6fb3c9"/>
<rect x="9.4" y="6.1" width="1.5" height="1.5" rx=".3" fill="#8fd0e2"/>
<path d="M15 4.4 q2.2 -1.8 3.4 .2" fill="none" stroke="#6fb3c9" stroke-width=".8"/>
</g>
</g>
<!-- water droplets falling onto plant -->
<g fill="#7ec8ff">
<rect class="wt-drop" style="--sd:0s"   x="10"  y="7.8" width=".7" height="1.5" rx=".35"/>
<rect class="wt-drop" style="--sd:-.3s" x="10.7" y="8.2" width=".7" height="1.5" rx=".35"/>
<rect class="wt-drop" style="--sd:-.6s" x="9.5" y="8.4" width=".7" height="1.5" rx=".35"/>
</g>
<!-- potted plant (foreground, under the spout) -->
<g>
<g class="wt-leaf" style="transform-origin:10.5px 13px">
<rect x="10.1" y="11" width=".8" height="2.6" fill="#3f9a52"/>
<ellipse cx="8.8" cy="11.8" rx="1.5" ry=".9" fill="#4fb564" transform="rotate(-28,8.8,11.8)"/>
<ellipse cx="12.2" cy="11.6" rx="1.5" ry=".9" fill="#4fb564" transform="rotate(28,12.2,11.6)"/>
<circle cx="10.5" cy="11.1" r="1.2" fill="#ff7eb0"/>
<circle cx="10.5" cy="11.1" r=".5" fill="#ffd14a"/>
</g>
<path d="M7.6 13.4 H13.6 L12.8 16.4 H8.4 Z" fill="#c2693f"/>
<rect x="7.3" y="12.8" width="6.6" height="1.2" rx=".3" fill="#d6794d"/>
</g>
</svg>`,
  'guitar': `<svg xmlns="http://www.w3.org/2000/svg" viewBox="-15 -25 45 45">
<defs><style>
.gt-body{transform-origin:7.5px 13px;animation:gt-bob 1.6s infinite ease-in-out;}
.gt-shad{transform-origin:7.5px 15.5px;animation:gt-shadow 1.6s infinite ease-in-out;}
.gt-eye {transform-origin:7.5px 9px;animation:gt-blink 3s infinite;}
.gt-strum{transform-origin:13px 10px;animation:gt-strum .4s infinite alternate ease-in-out;}
.gt-note{opacity:0;animation:gt-note 2.2s var(--sd,0s) infinite ease-out;}
@keyframes gt-bob{0%,100%{transform:translateY(0) rotate(0);}50%{transform:translateY(-.5px) rotate(-1.5deg);}}
@keyframes gt-shadow{0%,100%{transform:scaleX(1);opacity:.5;}50%{transform:scaleX(.95);opacity:.45;}}
@keyframes gt-blink{0%,46%,54%,100%{transform:scaleY(1);}50%{transform:scaleY(.1);}}
@keyframes gt-strum{0%{transform:rotate(-14deg);}100%{transform:rotate(8deg);}}
@keyframes gt-note{0%{opacity:0;transform:translate(0,0) scale(.5);}25%{opacity:.9;}100%{opacity:0;transform:translate(var(--tx,5px),-13px) scale(1.1);}}
</style></defs>

<rect class="gt-shad" x="3" y="15" width="9" height="1" fill="#000" opacity=".5"/>
<g class="gt-body">
<g fill="#DE886D">
<rect x="3" y="13" width="1" height="2"/><rect x="5" y="13" width="1" height="2"/>
<rect x="9" y="13" width="1" height="2"/><rect x="11" y="13" width="1" height="2"/>
</g>
<rect x="2" y="6" width="11" height="7" fill="#DE886D"/>
<g class="gt-eye" fill="#000"><rect x="4" y="8" width="1" height="2"/><rect x="10" y="8" width="1" height="2"/></g>
<!-- guitar: neck up-left (clears the face), body in the lap -->
<g>
<!-- neck -->
<rect x="-1.6" y="9.65" width="9.6" height="1.5" rx=".3" fill="#6b4420" transform="rotate(46,7.5,10.4)"/>
<g transform="rotate(46,7.5,10.4)" stroke="#caa06a" stroke-width=".3">
<line x1="2.2" y1="9.65" x2="2.2" y2="11.15"/><line x1="4" y1="9.65" x2="4" y2="11.15"/><line x1="5.8" y1="9.65" x2="5.8" y2="11.15"/>
</g>
<!-- headstock + tuning pegs -->
<rect x="-3.7" y="9.1" width="2.6" height="2.5" rx=".4" fill="#4f3014" transform="rotate(46,7.5,10.4)"/>
<g fill="#caa06a" transform="rotate(46,7.5,10.4)"><circle cx="-2.7" cy="9.6" r=".34"/><circle cx="-2.7" cy="11.1" r=".34"/></g>
<!-- body -->
<ellipse cx="9.6" cy="12.8" rx="3.5" ry="3" fill="#b9742f"/>
<ellipse cx="9.6" cy="11.7" rx="2.7" ry="1.5" fill="#cf8a3c" opacity=".75"/>
<circle cx="9" cy="12.4" r="1.15" fill="#3a2410"/>
<rect x="9.8" y="14" width="1.8" height=".7" rx=".15" fill="#5c3517"/>
</g>
<!-- left claw fretting near headstock -->
<rect x="-0.2" y="2.8" width="2.2" height="2" rx=".4" fill="#DE886D"/>
<!-- right claw strums over sound hole -->
<g class="gt-strum"><rect x="8.6" y="11.4" width="2.4" height="2" rx=".4" fill="#DE886D"/></g>
<!-- music notes -->
<g fill="#e0a050" font-family="monospace" font-weight="bold">
<text class="gt-note" style="--sd:0s;--tx:6px"   x="13" y="6" font-size="4">♪</text>
<text class="gt-note" style="--sd:-1.1s;--tx:8px" x="11" y="4" font-size="5">♫</text>
</g>
</g>
</svg>`,
  'coding': `<svg xmlns="http://www.w3.org/2000/svg" viewBox="-15 -25 45 45">
<defs><style>
.cd-body{transform-origin:7.5px 13px;animation:cd-focus 2.4s infinite ease-in-out;}
.cd-shad{transform-origin:7.5px 15.5px;animation:cd-shadow 2.4s infinite ease-in-out;}
.cd-eye {transform-origin:7.5px 9px;animation:cd-blink 2.8s infinite;}
.cd-glow{animation:cd-glow .6s infinite alternate ease-in-out;}
.cd-cur {animation:cd-cur 1s steps(1) infinite;}
.cd-l1  {animation:cd-type 1.8s steps(1) infinite;}
.cd-l2  {animation:cd-type 1.8s -.6s steps(1) infinite;}
.cd-l3  {animation:cd-type 1.8s -1.2s steps(1) infinite;}
@keyframes cd-focus{0%,100%{transform:translateY(0);}50%{transform:translateY(-.3px);}}
@keyframes cd-shadow{0%,100%{transform:scaleX(1);opacity:.5;}50%{transform:scaleX(.98);opacity:.47;}}
@keyframes cd-blink{0%,47%,53%,100%{transform:scaleY(1);}50%{transform:scaleY(.1);}}
@keyframes cd-glow{0%{opacity:.08;}100%{opacity:.2;}}
@keyframes cd-cur{0%,50%{opacity:1;}51%,100%{opacity:0;}}
@keyframes cd-type{0%,100%{transform:scaleX(.5);}50%{transform:scaleX(1);}}
</style></defs>

<rect class="cd-shad" x="3" y="15" width="9" height="1" fill="#000" opacity=".5"/>
<g class="cd-body">
<g fill="#DE886D">
<rect x="3" y="13" width="1" height="2"/><rect x="5" y="13" width="1" height="2"/>
<rect x="9" y="13" width="1" height="2"/><rect x="11" y="13" width="1" height="2"/>
</g>
<rect x="2" y="6" width="11" height="7" fill="#DE886D"/>
<rect class="cd-glow" x="2" y="6" width="11" height="4" rx="1" fill="#4fd6a0"/>
<rect x="0" y="9" width="2" height="2" fill="#DE886D"/>
<rect x="13" y="9" width="2" height="2" fill="#DE886D"/>
<g class="cd-eye" fill="#000"><rect x="4" y="8" width="1" height="2"/><rect x="10" y="8" width="1" height="2"/></g>
<!-- laptop (foreground, screen faces us; eyes peek over the top) -->
<g>
<rect x="0.4" y="9.9" width="14.2" height="5.2" rx=".5" fill="#23272f"/>
<rect x="1.3" y="10.6" width="12.4" height="3.8" rx=".3" fill="#0c1018"/>
<!-- code lines -->
<rect class="cd-l1" style="transform-origin:2.2px 11.3px" x="2.2" y="11" width="4"   height=".7" rx=".2" fill="#ff79c6"/>
<rect             x="6.8" y="11" width="3"   height=".7" rx=".2" fill="#8be9fd"/>
<rect class="cd-l2" style="transform-origin:3px 12.4px"  x="3"   y="12.1" width="5"   height=".7" rx=".2" fill="#50fa7b"/>
<rect             x="8.6" y="12.1" width="2.4" height=".7" rx=".2" fill="#f1fa8c"/>
<rect class="cd-l3" style="transform-origin:2.2px 13.5px" x="2.2" y="13.2" width="3.4" height=".7" rx=".2" fill="#bd93f9"/>
<rect class="cd-cur" x="6" y="13.2" width=".7" height=".8" fill="#fff"/>
<!-- hinge / base -->
<rect x="-.4" y="15" width="15.4" height="1" rx=".4" fill="#2f343d"/>
</g>
</g>
</svg>`,
  'birthday': `<svg xmlns="http://www.w3.org/2000/svg" viewBox="-15 -25 45 45">
<defs><style>
.bd-all {transform-origin:7.5px 15px;animation:bd-hop 1.1s infinite ease-in-out;}
.bd-shad{transform-origin:7.5px 15.5px;animation:bd-shadow 1.1s infinite ease-in-out;}
.bd-eye {transform-origin:7.5px 9px;animation:bd-blink 2.2s infinite;}
.bd-al  {transform-origin:2px 10px;animation:bd-arm-l .55s infinite alternate ease-in-out;}
.bd-ar  {transform-origin:14px 10px;animation:bd-arm-r .55s infinite alternate ease-in-out;}
.bd-hat {transform-origin:7.5px 6px;animation:bd-hatwob 1.1s infinite ease-in-out;}
.bd-flame{transform-origin:7.5px 9.5px;animation:bd-flame .22s infinite alternate ease-in-out;}
.bd-cf  {opacity:0;animation:bd-confetti var(--d,1.3s) var(--delay,0s) infinite ease-in;}
@keyframes bd-hop{
0%,18%,100%{transform:translateY(0) scaleY(1) scaleX(1);}
24%{transform:translateY(.4px) scaleY(.86) scaleX(1.1);}
46%{transform:translateY(-6px) scaleY(1.05) scaleX(.97);}
52%{transform:translateY(-7px) scaleY(1) scaleX(1);}
58%{transform:translateY(-6px) scaleY(1.05) scaleX(.97);}
82%{transform:translateY(.4px) scaleY(.86) scaleX(1.1);}
90%{transform:translateY(0) scaleY(1.03) scaleX(.99);}
}
@keyframes bd-shadow{
0%,18%,100%{transform:scaleX(1);opacity:.5;}
46%,58%{transform:scaleX(.55);opacity:.18;}
82%{transform:scaleX(1.12);opacity:.6;}
}
@keyframes bd-blink{0%,44%,56%,100%{transform:scaleY(1);}50%{transform:scaleY(.1);}}
@keyframes bd-arm-l{0%{transform:rotate(35deg);}100%{transform:rotate(75deg);}}
@keyframes bd-arm-r{0%{transform:rotate(-35deg);}100%{transform:rotate(-75deg);}}
@keyframes bd-hatwob{
0%,18%,100%{transform:rotate(0deg);}
52%{transform:rotate(-7deg);}
82%{transform:rotate(5deg);}
}
@keyframes bd-flame{0%{transform:scaleX(1) scaleY(1);}100%{transform:scaleX(.65) scaleY(1.25) translateX(.1px);}}
@keyframes bd-confetti{
0%{opacity:0;transform:translate(0,0) rotate(0deg);}
12%{opacity:1;}
85%{opacity:.8;}
100%{opacity:0;transform:translate(var(--tx,3px),22px) rotate(var(--r,200deg));}
}
</style></defs>

<!-- confetti behind -->
<g>
<rect class="bd-cf" style="--delay:0s;--d:1.4s;--tx:-6px;--r:220deg"  x="-6" y="-20" width="1.6" height="1.6" fill="#FF4444"/>
<rect class="bd-cf" style="--delay:-.3s;--d:1.1s;--tx:5px;--r:160deg" x="13" y="-22" width="1.6" height="1"   fill="#FFD700"/>
<rect class="bd-cf" style="--delay:-.6s;--d:1.5s;--tx:-3px;--r:280deg"x="3"  y="-23" width="1"   height="1.6" fill="#44AAFF"/>
<rect class="bd-cf" style="--delay:-.9s;--d:1.2s;--tx:7px;--r:90deg"  x="19" y="-19" width="1.6" height="1"   fill="#FF69B4"/>
<rect class="bd-cf" style="--delay:-.2s;--d:1.6s;--tx:-8px;--r:320deg"x="-9" y="-16" width="1"   height="1.6" fill="#44DD88"/>
<rect class="bd-cf" style="--delay:-.7s;--d:1.05s;--tx:4px;--r:180deg"x="9"  y="-24" width="1.6" height="1"   fill="#FF9500"/>
<rect class="bd-cf" style="--delay:-.45s;--d:1.35s;--tx:-5px;--r:240deg"x="16" y="-18" width="1"  height="1"   fill="#CC44FF"/>
<rect class="bd-cf" style="--delay:-.85s;--d:1.15s;--tx:2px;--r:120deg"x="-3" y="-21" width="1.6" height="1.6" fill="#FFD700"/>
</g>

<rect class="bd-shad" x="3" y="15" width="9" height="1" fill="#000" opacity=".5"/>

<g class="bd-all">
<!-- party hat (sits on head, moves with body) -->
<g class="bd-hat">
<rect x="6.5" y="-1.5" width="2" height="2" fill="#fff"/>
<rect x="6"   y=".5" width="3"  height="1" fill="#FF4444"/>
<rect x="5"   y="1.5" width="5"  height="1" fill="#FFD700"/>
<rect x="4"   y="2.5" width="7"  height="1" fill="#FF4444"/>
<rect x="3"   y="3.5"  width="9"  height="1" fill="#FFD700"/>
<rect x="2"   y="4.5"  width="11" height="1.2" fill="#FF4444"/>
<rect x="2"   y="5.5"  width="11" height=".6" fill="#fff" opacity=".55"/>
</g>
<g fill="#DE886D">
<rect x="3" y="13" width="1" height="2"/><rect x="5" y="13" width="1" height="2"/>
<rect x="9" y="13" width="1" height="2"/><rect x="11" y="13" width="1" height="2"/>
</g>
<rect x="2" y="6" width="11" height="7" fill="#DE886D"/>
<g class="bd-al"><rect x="0" y="9" width="2" height="2" fill="#DE886D"/></g>
<g class="bd-ar"><rect x="13" y="9" width="2" height="2" fill="#DE886D"/></g>
<g class="bd-eye" fill="#000"><rect x="4" y="8" width="1" height="2"/><rect x="10" y="8" width="1" height="2"/></g>
</g>

<!-- cake (foreground, in front of feet) -->
<g transform="translate(2.5,13.5)">
<rect x="-1" y="3.2" width="11" height=".8" fill="#bbb"/>            <!-- plate -->
<rect x="0" y="0" width="9" height="3.4" fill="#F48FB1"/>
<rect x="0" y="-.6" width="9" height="1" fill="#fff"/>
<rect x="1" y="-.6" width="1" height="1.5" fill="#fff"/>
<rect x="4" y="-.6" width="1" height="1.7" fill="#fff"/>
<rect x="7" y="-.6" width="1" height="1.4" fill="#fff"/>
<rect x="0" y="1.6" width="9" height=".5" fill="#fff" opacity=".4"/>
<rect x="4" y="-4" width="1" height="3.4" fill="#FFD700"/>            <!-- candle -->
<g class="bd-flame">
<rect x="4" y="-6" width="1" height="2" fill="#FF6B00"/>
<rect x="4.2" y="-6.5" width=".6" height="1" fill="#FFD700"/>
</g>
</g>
</svg>`,
  'spring': `<svg xmlns="http://www.w3.org/2000/svg" viewBox="-15 -25 45 45">
<defs><style>
.sp-body{transform-origin:7.5px 13px;animation:sp-bow 3.2s infinite ease-in-out;}
.sp-shad{transform-origin:7.5px 15.5px;animation:sp-shadow 3.2s infinite ease-in-out;}
.sp-eye {transform-origin:7.5px 9px;animation:sp-blink 3.2s infinite;}
.sp-al  {transform-origin:2px 10px;animation:sp-arm-l 3.2s infinite ease-in-out;}
.sp-ar  {transform-origin:14px 10px;animation:sp-arm-r 3.2s infinite ease-in-out;}
.sp-lanl{transform-origin:-8px -22px;animation:sp-lan .9s infinite alternate ease-in-out;}
.sp-lanr{transform-origin:23px -22px;animation:sp-lan .9s infinite alternate-reverse ease-in-out;}
.sp-fu  {transform-origin:18px -3px;animation:sp-fupulse 2.4s infinite ease-in-out;}
.sp-coin{opacity:0;animation:sp-coinfall var(--d,1.5s) var(--delay,0s) infinite ease-in;}
@keyframes sp-bow{
0%,22%,100%{transform:rotate(0deg) translateY(0);}
42%,62%{transform:rotate(-16deg) translate(-1px,1.2px);}
80%{transform:rotate(-4deg) translateX(-.4px);}
}
@keyframes sp-shadow{
0%,22%,100%{transform:scaleX(1);opacity:.5;}
52%{transform:scaleX(.78) translateX(-1px);opacity:.35;}
}
@keyframes sp-blink{0%,36%,64%,100%{transform:translate(-.5px,.5px) scaleY(.72);}50%{transform:translate(-.5px,.5px) scaleY(.1);}}
@keyframes sp-arm-l{0%,22%,100%{transform:rotate(0deg);}42%,62%{transform:rotate(58deg) translate(1px,-1.2px);}}
@keyframes sp-arm-r{0%,22%,100%{transform:rotate(0deg);}42%,62%{transform:rotate(-58deg) translate(-1px,-1.2px);}}
@keyframes sp-lan{0%{transform:rotate(-7deg);}100%{transform:rotate(7deg);}}
@keyframes sp-fupulse{0%,100%{opacity:.85;transform:scale(1) rotate(0deg);}50%{opacity:1;transform:scale(1.06) rotate(0deg);}}
@keyframes sp-coinfall{
0%{opacity:0;transform:translate(0,0) rotate(0deg);}
14%{opacity:1;}
88%{opacity:.8;}
100%{opacity:0;transform:translate(var(--tx,2px),20px) rotate(360deg);}
}
</style></defs>

<line x1="-8" y1="-25" x2="-8" y2="-22" stroke="#7a0000" stroke-width=".5"/>
<line x1="23" y1="-25" x2="23" y2="-22" stroke="#7a0000" stroke-width=".5"/>

<!-- 灯笼 -->
<g class="sp-lanl" transform="translate(-8,-22)">
<rect x="-2.2" y="0" width="4.4" height=".6" fill="#FFC83D"/>
<rect x="-2.6" y=".6" width="5.2" height="5.4" fill="#CC0000" rx="1.2"/>
<rect x="-1.6" y=".8" width="1.6" height="5" fill="#E03030" opacity=".5" rx=".8"/>
<rect x="-1.2" y="2" width="2.4" height=".5" fill="#FFC83D"/>
<rect x="-.4" y="2.5" width="1" height="1.6" fill="#FFC83D"/>
<rect x="-2.2" y="6" width="4.4" height=".6" fill="#FFC83D"/>
<rect x="-1.4" y="6.6" width=".5" height="2.4" fill="#FFC83D"/>
<rect x="-.25" y="6.6" width=".5" height="2.8" fill="#FFC83D"/>
<rect x="0.9" y="6.6" width=".5" height="2.4" fill="#FFC83D"/>
</g>
<g class="sp-lanr" transform="translate(23,-22)">
<rect x="-2.2" y="0" width="4.4" height=".6" fill="#FFC83D"/>
<rect x="-2.6" y=".6" width="5.2" height="5.4" fill="#CC0000" rx="1.2"/>
<rect x="-1.6" y=".8" width="1.6" height="5" fill="#E03030" opacity=".5" rx=".8"/>
<rect x="-1.2" y="2" width="2.4" height=".5" fill="#FFC83D"/>
<rect x="-.4" y="2.5" width="1" height="1.6" fill="#FFC83D"/>
<rect x="-2.2" y="6" width="4.4" height=".6" fill="#FFC83D"/>
<rect x="-1.4" y="6.6" width=".5" height="2.4" fill="#FFC83D"/>
<rect x="-.25" y="6.6" width=".5" height="2.8" fill="#FFC83D"/>
<rect x="0.9" y="6.6" width=".5" height="2.4" fill="#FFC83D"/>
</g>

<!-- 福 on red diamond -->
<g class="sp-fu" transform="translate(18,-3)">
<rect x="-4" y="-4" width="8" height="8" fill="#CC0000" transform="rotate(45)"/>
<rect x="-3" y="-3" width="6" height="6" fill="#E81818" transform="rotate(45)" opacity=".6"/>
<g fill="#FFD700">
<rect x="-2.8" y="-2.6" width="5.6" height=".8"/>
<rect x="-.4" y="-1.8" width="1" height="4"/>
<rect x="-2.2" y="-1" width="4.8" height=".7"/>
<rect x="-2.2" y="-.3" width="1.8" height="1.8"/>
<rect x=".6" y="-.3" width="1.8" height="1.8"/>
<rect x="-2.2" y="1.5" width="4.8" height=".8"/>
</g>
</g>

<!-- gold coins -->
<g>
<rect class="sp-coin" style="--delay:0s;--d:1.6s;--tx:-3px"  x="-11" y="-15" width="2" height="2" rx="1" fill="#FFD700"/>
<rect class="sp-coin" style="--delay:-.5s;--d:1.4s;--tx:2px"  x="-13" y="-10" width="1.6" height="1.6" rx=".8" fill="#FFC107"/>
<rect class="sp-coin" style="--delay:-1s;--d:1.7s;--tx:-2px"  x="-9" y="-18" width="1.6" height="1.6" rx=".8" fill="#FFEB3B"/>
</g>

<rect class="sp-shad" x="3" y="15" width="9" height="1" fill="#000" opacity=".5"/>
<g class="sp-body">
<g fill="#DE886D">
<rect x="3" y="13" width="1" height="2"/><rect x="5" y="13" width="1" height="2"/>
<rect x="9" y="13" width="1" height="2"/><rect x="11" y="13" width="1" height="2"/>
</g>
<rect x="2" y="6" width="11" height="7" fill="#DE886D"/>
<rect x="2" y="10" width="11" height="2" fill="#CC0000"/>
<rect x="2" y="10" width="11" height=".7" fill="#FF3838"/>
<g class="sp-al"><rect x="0" y="9" width="2" height="2" fill="#DE886D"/></g>
<g class="sp-ar"><rect x="13" y="9" width="2" height="2" fill="#DE886D"/></g>
<g class="sp-eye" fill="#000"><rect x="4" y="8" width="1" height="2"/><rect x="10" y="8" width="1" height="2"/></g>
</g>
</svg>`,
  'mid-autumn': `<svg xmlns="http://www.w3.org/2000/svg" viewBox="-15 -25 45 45">
<defs><style>
.ma-body{transform-origin:7.5px 13px;animation:ma-look 6.5s infinite ease-in-out;}
.ma-shad{transform-origin:7.5px 15.5px;animation:ma-shadow 6.5s infinite ease-in-out;}
.ma-eye {transform-origin:7.5px 9px;animation:ma-eye 6.5s infinite ease-in-out;}
.ma-moon{transform-origin:7.5px -18px;animation:ma-moon 8s infinite ease-in-out;}
.ma-rabbit{transform-origin:7.5px -18px;animation:ma-rabbit 4s infinite ease-in-out;}
.ma-star{animation:ma-star var(--d,2s) var(--sd,0s) infinite ease-in-out;}
@keyframes ma-look{0%,28%,100%{transform:rotate(0deg) translateY(0);}40%,82%{transform:rotate(-9deg) translate(-.6px,-.5px);}}
@keyframes ma-shadow{0%,28%,100%{opacity:.5;transform:scaleX(1);}60%{opacity:.35;transform:scaleX(.86) translateX(-.4px);}}
@keyframes ma-eye{0%,28%,100%{transform:translate(0,0) scaleY(1);}33%{transform:scaleY(.1);}36%,82%{transform:translate(-.6px,-.9px) scaleY(.82);}}
@keyframes ma-moon{0%,100%{transform:translateY(0);}50%{transform:translateY(-1.5px);}}
@keyframes ma-rabbit{0%,100%{transform:translateY(0);}50%{transform:translateY(-.6px);}}
@keyframes ma-star{0%,100%{opacity:.3;transform:scale(.7);}50%{opacity:1;transform:scale(1.2);}}
</style></defs>

<g class="ma-moon">
<circle cx="7.5" cy="-17" r="8" fill="#FFF0A0"/>
<circle cx="7.5" cy="-17" r="8.6" fill="none" stroke="#FFF0A0" stroke-width=".9" opacity=".25"/>
<circle cx="4.5" cy="-19.5" r="1.3" fill="#F0DC6A" opacity=".45"/>
<circle cx="10.5" cy="-15" r=".9" fill="#F0DC6A" opacity=".4"/>
<!-- jade rabbit silhouette -->
<g class="ma-rabbit" fill="#E8CF6A" opacity=".7">
<ellipse cx="7.5" cy="-14.5" rx="2" ry="1.4"/>
<circle cx="6.2" cy="-16" r="1.1"/>
<rect x="5.4" y="-18.5" width=".7" height="2.2" rx=".35" transform="rotate(-12,5.7,-17.4)"/>
<rect x="6.4" y="-18.6" width=".7" height="2.2" rx=".35" transform="rotate(8,6.7,-17.5)"/>
</g>
</g>

<rect class="ma-star" style="--d:1.8s;--sd:0s"   x="-12" y="-23" width="1" height="1" fill="#FFF8DC" rx=".2"/>
<rect class="ma-star" style="--d:2.4s;--sd:-.6s" x="21" y="-22" width=".8" height=".8" fill="#FFF8DC" rx=".2"/>
<rect class="ma-star" style="--d:1.5s;--sd:-1s"  x="-5" y="-24" width=".6" height=".6" fill="#FFF8DC" rx=".1"/>
<rect class="ma-star" style="--d:3s;--sd:-.4s"   x="24" y="-15" width=".8" height=".8" fill="#FFF8DC" rx=".2"/>
<rect class="ma-star" style="--d:2s;--sd:-.9s"   x="-13" y="-13" width=".6" height=".6" fill="#FFF8DC" rx=".1"/>

<rect class="ma-shad" x="3" y="15" width="9" height="1" fill="#000" opacity=".5"/>
<g class="ma-body">
<g fill="#DE886D">
<rect x="3" y="13" width="1" height="2"/><rect x="5" y="13" width="1" height="2"/>
<rect x="9" y="13" width="1" height="2"/><rect x="11" y="13" width="1" height="2"/>
</g>
<rect x="2" y="6" width="11" height="7" fill="#DE886D"/>
<rect x="0" y="9" width="2" height="2" fill="#DE886D"/>
<!-- right arm holds a mooncake up -->
<rect x="13" y="7" width="2" height="2" fill="#DE886D"/>
<g transform="translate(13.5,3.5)">
<rect x="0" y="0" width="4" height="3.2" fill="#C8860A" rx=".4"/>
<rect x=".4" y=".4" width="3.2" height="2.4" fill="#D4950F" rx=".3"/>
<rect x="1" y=".9" width="2" height=".4" fill="#A06808"/>
<rect x="1.8" y="1.3" width=".4" height="1.2" fill="#A06808"/>
</g>
<g class="ma-eye" fill="#000"><rect x="4" y="8" width="1" height="2"/><rect x="10" y="8" width="1" height="2"/></g>
</g>
</svg>`,
  'dragon-boat': `<svg xmlns="http://www.w3.org/2000/svg" viewBox="-15 -25 45 45">
<defs><style>
.db-boat{transform-origin:7.5px 12px;animation:db-bob 1.6s infinite ease-in-out;}
.db-body{transform-origin:7.5px 10px;animation:db-row .7s infinite ease-in-out;}
.db-eye {transform-origin:7.5px 9px;animation:db-eye 1.4s infinite;}
.db-al  {transform-origin:2px 10px;animation:db-arm-l .7s infinite ease-in-out;}
.db-ar  {transform-origin:14px 10px;animation:db-arm-r .7s infinite ease-in-out;}
.db-wave{animation:db-wave 1.1s var(--wd,0s) infinite linear;}
.db-zz  {transform-origin:50% 50%;animation:db-zbob 2.2s infinite ease-in-out;}
@keyframes db-bob{0%,100%{transform:translateY(0) rotate(-1.5deg);}50%{transform:translateY(-1px) rotate(1.5deg);}}
@keyframes db-row{0%,100%{transform:rotate(-3deg);}50%{transform:rotate(3deg);}}
@keyframes db-eye{0%,42%,58%,100%{transform:scaleY(1);}50%{transform:scaleY(.1);}}
@keyframes db-arm-l{0%,100%{transform:rotate(-48deg) translateY(-.5px);}50%{transform:rotate(12deg) translateY(.4px);}}
@keyframes db-arm-r{0%,100%{transform:rotate(48deg) translateY(-.5px);}50%{transform:rotate(-12deg) translateY(.4px);}}
@keyframes db-wave{0%{transform:translateX(0) scaleY(1);}50%{transform:translateX(-3px) scaleY(1.4);}100%{transform:translateX(-6px) scaleY(1);}}
@keyframes db-zbob{0%,100%{transform:translateY(0) rotate(-6deg);}50%{transform:translateY(-2px) rotate(6deg);}}
</style></defs>

<!-- 粽子 floating -->
<g class="db-zz" transform="translate(-11,-4)">
<polygon points="3.5,0 6.5,2 6.5,7.5 3.5,9.5 .5,7.5 .5,2" fill="#2D7A2D"/>
<polygon points="3.5,0 6.5,2 3.5,2.2" fill="#3D9A3D"/>
<polygon points="3.5,0 .5,2 3.5,2.2" fill="#225C22"/>
<rect x="3.1" y="-1" width=".8" height="2" fill="#8B5A2B"/>
<rect x="1.6" y="1.2" width="4" height=".6" fill="#8B5A2B"/>
<rect x="1.6" y="4" width="4" height=".4" fill="#1A5A1A" opacity=".6"/>
<rect x="1.6" y="6.2" width="4" height=".4" fill="#1A5A1A" opacity=".6"/>
</g>

<g class="db-boat">
<!-- water under boat -->
<g opacity=".75">
<rect class="db-wave" style="--wd:0s"   x="-6" y="15" width="42" height="1.4" fill="#1A7A3A" rx=".7"/>
<rect class="db-wave" style="--wd:-.4s" x="-6" y="15.5" width="42" height=".6" fill="#4ECB7B" opacity=".5" rx=".3"/>
</g>
<!-- boat hull -->
<path d="M-7 11 Q-9 14 -5 14 H17 Q21 14 19 11 Z" fill="#7a3b12"/>
<path d="M-6 11 H18 V12.4 H-6 Z" fill="#9a5424"/>
<rect x="-6" y="11" width="24" height=".5" fill="#c8893f"/>
<!-- dragon head prow (left) -->
<g transform="translate(-13,7)">
<rect x="0" y="0" width="5" height="4" fill="#CC2200" rx=".4"/>
<rect x="1" y="-2" width=".9" height="2.2" fill="#CC2200"/>
<rect x="2.6" y="-2.4" width=".7" height="1.8" fill="#CC2200"/>
<rect x="3.6" y=".8" width=".9" height=".9" fill="#FFD700" rx=".2"/>
<rect x="3.8" y="1" width=".4" height=".4" fill="#000"/>
<rect x=".3" y="1.6" width="3.5" height=".5" fill="#AA1800" opacity=".5"/>
<rect x="4.6" y="1.5" width="1.3" height="2.2" fill="#CC2200"/>
<rect x="4.6" y="1.6" width=".5" height=".7" fill="#fff"/>
<rect x="5.1" y="2.6" width=".5" height=".7" fill="#fff"/>
</g>
<!-- dragon tail (right) -->
<g transform="translate(18,8)">
<polygon points="0,0 4,-1.5 3,3 0,3" fill="#CC2200"/>
<rect x="2.5" y="-1" width="1.5" height=".6" fill="#AA1800"/>
</g>

<!-- paddles -->
<g class="db-al"><rect x="-2" y="8" width=".6" height="6" fill="#8B5A2B"/><rect x="-3.2" y="13" width="2.6" height="1.5" fill="#1A5A8A" rx=".2"/></g>
<g class="db-ar"><rect x="16.4" y="8" width=".6" height="6" fill="#8B5A2B"/><rect x="16.6" y="13" width="2.6" height="1.5" fill="#1A5A8A" rx=".2"/></g>

<!-- crab rower -->
<g class="db-body">
<rect x="2" y="4" width="11" height="2.4" fill="#1A7A3A"/>            <!-- 头巾 -->
<rect x="2" y="5" width="11" height=".7" fill="#FFD700" opacity=".7"/>
<rect x="13" y="4" width="2" height="1" fill="#1A7A3A"/>
<rect x="14" y="5" width="1" height="3" fill="#1A7A3A"/>
<rect x="2" y="6" width="11" height="6" fill="#DE886D"/>
<g class="db-al"><rect x="0" y="9" width="2" height="2" fill="#DE886D"/></g>
<g class="db-ar"><rect x="13" y="9" width="2" height="2" fill="#DE886D"/></g>
<g class="db-eye" fill="#000"><rect x="4" y="8" width="1" height="2"/><rect x="10" y="8" width="1" height="2"/></g>
</g>
</g>
</svg>`,
  'christmas': `<svg xmlns="http://www.w3.org/2000/svg" viewBox="-15 -25 45 45">
<defs><style>
.xm-body{transform-origin:7.5px 13px;animation:xm-sway 2.6s infinite ease-in-out;}
.xm-shad{transform-origin:7.5px 15.5px;animation:xm-shadow 2.6s infinite ease-in-out;}
.xm-eye {transform-origin:7.5px 9px;animation:xm-blink 3s infinite;}
.xm-pom {transform-origin:9px -2px;animation:xm-pom 2.6s infinite ease-in-out;}
.xm-snow{opacity:0;animation:xm-snow var(--d,3s) var(--delay,0s) infinite linear;}
.xm-star{transform-origin:center;animation:xm-twinkle 1.6s infinite ease-in-out;}
@keyframes xm-sway{0%,100%{transform:rotate(-2deg);}50%{transform:rotate(2deg);}}
@keyframes xm-shadow{0%,100%{transform:scaleX(1);opacity:.5;}50%{transform:scaleX(1.04);opacity:.45;}}
@keyframes xm-blink{0%,45%,55%,100%{transform:scaleY(1);}50%{transform:scaleY(.1);}}
@keyframes xm-pom{0%,100%{transform:rotate(0deg) translateX(0);}50%{transform:rotate(10deg) translateX(.6px);}}
@keyframes xm-snow{0%{opacity:0;transform:translate(0,-2px);}12%{opacity:1;}88%{opacity:.9;}100%{opacity:0;transform:translate(var(--tx,-3px),26px);}}
@keyframes xm-twinkle{0%,100%{opacity:.5;transform:scale(.8);}50%{opacity:1;transform:scale(1.15);}}
</style></defs>

<!-- snow -->
<g fill="#fff">
<rect class="xm-snow" style="--delay:0s;--d:3.2s;--tx:-3px"  x="-10" y="-23" width="1.2" height="1.2" rx=".6"/>
<rect class="xm-snow" style="--delay:-.8s;--d:2.8s;--tx:2px"  x="-2" y="-24" width="1" height="1" rx=".5"/>
<rect class="xm-snow" style="--delay:-1.5s;--d:3.5s;--tx:-2px" x="6" y="-23" width="1.4" height="1.4" rx=".7"/>
<rect class="xm-snow" style="--delay:-.4s;--d:3s;--tx:3px"     x="14" y="-24" width="1" height="1" rx=".5"/>
<rect class="xm-snow" style="--delay:-2s;--d:3.3s;--tx:-1px"   x="20" y="-22" width="1.2" height="1.2" rx=".6"/>
<rect class="xm-snow" style="--delay:-1.2s;--d:2.6s;--tx:2px"  x="-13" y="-21" width="1" height="1" rx=".5"/>
<rect class="xm-snow" style="--delay:-2.4s;--d:3.4s;--tx:-3px" x="23" y="-20" width="1.2" height="1.2" rx=".6"/>
</g>

<!-- christmas tree (left) -->
<g transform="translate(-13,4)">
<polygon points="3,-2 5.5,2 .5,2" fill="#2E7D32"/>
<polygon points="3,0 6,4 0,4" fill="#388E3C"/>
<polygon points="3,2 6.5,7 -.5,7" fill="#43A047"/>
<rect x="2.4" y="7" width="1.2" height="2" fill="#6D4C41"/>
<g class="xm-star" style="transform-origin:3px -2px"><rect x="2.4" y="-3.4" width="1.2" height="1.2" fill="#FFD700" rx=".2"/></g>
<circle cx="1.8" cy="3" r=".5" fill="#FF5252"/>
<circle cx="4.2" cy="2" r=".5" fill="#FFD700"/>
<circle cx="3" cy="5.5" r=".5" fill="#42A5F5"/>
</g>

<rect class="xm-shad" x="3" y="15" width="9" height="1" fill="#000" opacity=".5"/>
<g class="xm-body">
<g fill="#DE886D">
<rect x="3" y="13" width="1" height="2"/><rect x="5" y="13" width="1" height="2"/>
<rect x="9" y="13" width="1" height="2"/><rect x="11" y="13" width="1" height="2"/>
</g>
<!-- santa hat -->
<rect x="2" y="3" width="10" height="2" fill="#CC0000"/>
<rect x="3" y="1" width="8" height="2" fill="#D81B1B"/>
<rect x="5" y="-.5" width="5" height="2" fill="#E53535"/>
<g class="xm-pom"><rect x="8" y="-2" width="3" height="2" fill="#fff" rx=".5"/></g>
<rect x="2" y="4.6" width="10" height="1.6" fill="#fff"/>            <!-- white trim -->
<rect x="2" y="6" width="11" height="7" fill="#DE886D"/>
<!-- green+red scarf -->
<rect x="2" y="10.5" width="11" height="1.8" fill="#1B7A3A"/>
<rect x="2" y="10.5" width="11" height=".6" fill="#34C75A"/>
<rect x="0" y="9" width="2" height="2" fill="#DE886D"/>
<rect x="13" y="9" width="2" height="2" fill="#DE886D"/>
<g class="xm-eye" fill="#000"><rect x="4" y="8" width="1" height="2"/><rect x="10" y="8" width="1" height="2"/></g>
</g>
</svg>`,
  'halloween': `<svg xmlns="http://www.w3.org/2000/svg" viewBox="-15 -25 45 45">
<defs><style>
.hw-body{transform-origin:7.5px 13px;animation:hw-float 2.4s infinite ease-in-out;}
.hw-shad{transform-origin:7.5px 15.5px;animation:hw-shadow 2.4s infinite ease-in-out;}
.hw-eye {transform-origin:7.5px 9px;animation:hw-eyeglow 2s infinite ease-in-out;}
.hw-hat {transform-origin:7.5px 5.5px;animation:hw-hat 2.4s infinite ease-in-out;}
.hw-ghost{animation:hw-ghost 3s infinite ease-in-out;}
.hw-bat {animation:hw-batfly 4s var(--bd2,0s) infinite linear;}
.hw-wing{transform-origin:center;animation:hw-flap .25s infinite alternate ease-in-out;}
.hw-pump{animation:hw-pumpglow 1.5s infinite ease-in-out;}
@keyframes hw-float{0%,100%{transform:translateY(0) rotate(-1deg);}50%{transform:translateY(-2px) rotate(1deg);}}
@keyframes hw-shadow{0%,100%{transform:scaleX(1);opacity:.45;}50%{transform:scaleX(.86);opacity:.3;}}
@keyframes hw-eyeglow{0%,100%{transform:scaleY(1);opacity:.85;}50%{transform:scaleY(1);opacity:1;}}
@keyframes hw-hat{0%,100%{transform:rotate(0deg);}50%{transform:rotate(-5deg);}}
@keyframes hw-ghost{0%,100%{opacity:.5;transform:translate(0,0);}50%{opacity:.9;transform:translate(2px,-3px);}}
@keyframes hw-batfly{0%{transform:translate(-16px,0);}50%{transform:translate(20px,-4px);}100%{transform:translate(-16px,0);}}
@keyframes hw-flap{0%{transform:scaleX(1);}100%{transform:scaleX(.4);}}
@keyframes hw-pumpglow{0%,100%{filter:brightness(1);}50%{filter:brightness(1.25);}}
</style></defs>

<!-- bats -->
<g fill="#1a1a1a">
<g class="hw-bat" style="--bd2:0s"><g transform="translate(0,-20)"><rect x="-.6" y="-.6" width="1.2" height="1.2" rx=".3"/><g class="hw-wing"><polygon points="-.6,0 -3,-1.2 -2.4,1 -.6,.6"/><polygon points=".6,0 3,-1.2 2.4,1 .6,.6"/></g></g></g>
<g class="hw-bat" style="--bd2:-2s"><g transform="translate(0,-15)" style="scale:.7"><rect x="-.6" y="-.6" width="1.2" height="1.2" rx=".3"/><g class="hw-wing"><polygon points="-.6,0 -3,-1.2 -2.4,1 -.6,.6"/><polygon points=".6,0 3,-1.2 2.4,1 .6,.6"/></g></g></g>
</g>

<!-- ghost -->
<g class="hw-ghost" transform="translate(18,-4)">
<path d="M0 0 Q0 -4 3 -4 Q6 -4 6 0 V4 L5 3 L4 4 L3 3 L2 4 L1 3 L0 4 Z" fill="#E8E8F0" opacity=".85"/>
<rect x="1.6" y="-1.6" width="1" height="1.4" fill="#333"/>
<rect x="3.6" y="-1.6" width="1" height="1.4" fill="#333"/>
<ellipse cx="3" cy="1.4" rx=".7" ry="1" fill="#333"/>
</g>

<rect class="hw-shad" x="3" y="15" width="9" height="1" fill="#000" opacity=".45"/>

<!-- jack-o-lantern (foreground left) -->
<g class="hw-pump" transform="translate(-13,9)">
<rect x="3" y="-2" width="1" height="1.5" fill="#3A7D2C"/>            <!-- stem -->
<ellipse cx="3.5" cy="3" rx="4" ry="3.4" fill="#E8731A"/>
<ellipse cx="1.6" cy="3" rx="1.4" ry="3.2" fill="#FF8C2E" opacity=".5"/>
<ellipse cx="5.4" cy="3" rx="1.4" ry="3.2" fill="#C85E12" opacity=".5"/>
<polygon points="1.5,2 3,2 2.2,3.2" fill="#FFD54F"/>           <!-- eye -->
<polygon points="5.5,2 4,2 4.8,3.2" fill="#FFD54F"/>
<polygon points="2,4.2 3,5 4,4.2 5,5 2.5,5.2" fill="#FFD54F"/>  <!-- mouth -->
</g>

<g class="hw-body">
<g fill="#DE886D">
<rect x="3" y="13" width="1" height="2"/><rect x="5" y="13" width="1" height="2"/>
<rect x="9" y="13" width="1" height="2"/><rect x="11" y="13" width="1" height="2"/>
</g>
<!-- witch hat -->
<g class="hw-hat">
<polygon points="7.5,-2.5 5,4.5 10,4.5" fill="#3A1A5A"/>
<rect x="2" y="4.5" width="11" height="1.4" fill="#3A1A5A"/>
<rect x="5.6" y="2.9" width="3.5" height="1.6" fill="#FFC107"/>  <!-- band -->
<rect x="6.4" y="3.1" width="1.8" height="1.2" fill="#3A1A5A"/>
</g>
<rect x="2" y="6" width="11" height="7" fill="#DE886D"/>
<rect x="0" y="9" width="2" height="2" fill="#DE886D"/>
<rect x="13" y="9" width="2" height="2" fill="#DE886D"/>
<!-- glowing eyes -->
<g class="hw-eye" fill="#FF7A00"><rect x="4" y="8" width="1" height="2"/><rect x="10" y="8" width="1" height="2"/></g>
</g>
</svg>`,
  'new-year': `<svg xmlns="http://www.w3.org/2000/svg" viewBox="-15 -25 45 45">
<defs><style>
.ny-body{transform-origin:7.5px 13px;animation:ny-cheer 1.8s infinite ease-in-out;}
.ny-shad{transform-origin:7.5px 15.5px;animation:ny-shadow 1.8s infinite ease-in-out;}
.ny-eye {transform-origin:7.5px 9px;animation:ny-eye 1.8s infinite;}
.ny-al  {transform-origin:2px 10px;animation:ny-arm-l 1.8s infinite ease-in-out;}
.ny-ar  {transform-origin:14px 10px;animation:ny-arm-r 1.8s infinite ease-in-out;}
.fw1 .fwp{animation:ny-burst 2.4s 0s infinite ease-out;}
.fw2 .fwp{animation:ny-burst 2.4s -.9s infinite ease-out;}
.fw3 .fwp{animation:ny-burst 2.4s -1.6s infinite ease-out;}
.ny-year{animation:ny-yearpulse 2s infinite ease-in-out;}
@keyframes ny-cheer{0%,100%{transform:translateY(0);}50%{transform:translateY(-1.5px);}}
@keyframes ny-shadow{0%,100%{transform:scaleX(1);opacity:.5;}50%{transform:scaleX(.94);opacity:.42;}}
@keyframes ny-eye{0%,42%,58%,100%{transform:scaleY(1);}50%{transform:scaleY(.1);}}
@keyframes ny-arm-l{0%,100%{transform:rotate(50deg);}50%{transform:rotate(70deg) translateY(-1px);}}
@keyframes ny-arm-r{0%,100%{transform:rotate(-50deg);}50%{transform:rotate(-70deg) translateY(-1px);}}
@keyframes ny-burst{
0%{opacity:0;transform:scale(.1);}
15%{opacity:1;transform:scale(.3);}
55%{opacity:1;transform:scale(1);}
80%{opacity:.4;transform:scale(1.15);}
100%{opacity:0;transform:scale(1.25);}
}
@keyframes ny-yearpulse{0%,100%{opacity:.8;transform:scale(1);}50%{opacity:1;transform:scale(1.05);}}
</style></defs>

<!-- fireworks (radial pixels from a center) -->
<g class="fw1" transform="translate(-7,-16)" fill="#FFD700">
<g class="fwp"><rect x="-.5" y="-6" width="1" height="2.4"/><rect x="-.5" y="3.6" width="1" height="2.4"/><rect x="-6" y="-.5" width="2.4" height="1"/><rect x="3.6" y="-.5" width="2.4" height="1"/><rect x="-4.4" y="-4.4" width="1.8" height="1.8"/><rect x="2.6" y="-4.4" width="1.8" height="1.8"/><rect x="-4.4" y="2.6" width="1.8" height="1.8"/><rect x="2.6" y="2.6" width="1.8" height="1.8"/></g>
</g>
<g class="fw2" transform="translate(7,-19)" fill="#FF5252">
<g class="fwp"><rect x="-.5" y="-5" width="1" height="2"/><rect x="-.5" y="3" width="1" height="2"/><rect x="-5" y="-.5" width="2" height="1"/><rect x="3" y="-.5" width="2" height="1"/><rect x="-3.6" y="-3.6" width="1.5" height="1.5"/><rect x="2.1" y="-3.6" width="1.5" height="1.5"/><rect x="-3.6" y="2.1" width="1.5" height="1.5"/><rect x="2.1" y="2.1" width="1.5" height="1.5"/></g>
</g>
<g class="fw3" transform="translate(19,-14)" fill="#44CCFF">
<g class="fwp"><rect x="-.5" y="-4.5" width="1" height="1.8"/><rect x="-.5" y="2.7" width="1" height="1.8"/><rect x="-4.5" y="-.5" width="1.8" height="1"/><rect x="2.7" y="-.5" width="1.8" height="1"/><rect x="-3.2" y="-3.2" width="1.3" height="1.3"/><rect x="1.9" y="-3.2" width="1.3" height="1.3"/><rect x="-3.2" y="1.9" width="1.3" height="1.3"/><rect x="1.9" y="1.9" width="1.3" height="1.3"/></g>
</g>

<!-- 2026 pixel text -->
<g class="ny-year" fill="#FFE066" transform="translate(-6,-23)">
<text x="0" y="0" font-family="monospace" font-weight="bold" font-size="4" fill="#FFE066">2026</text>
</g>

<rect class="ny-shad" x="3" y="15" width="9" height="1" fill="#000" opacity=".5"/>
<g class="ny-body">
<g fill="#DE886D">
<rect x="3" y="13" width="1" height="2"/><rect x="5" y="13" width="1" height="2"/>
<rect x="9" y="13" width="1" height="2"/><rect x="11" y="13" width="1" height="2"/>
</g>
<rect x="2" y="6" width="11" height="7" fill="#DE886D"/>
<g class="ny-al"><rect x="0" y="9" width="2" height="2" fill="#DE886D"/></g>
<g class="ny-ar"><rect x="13" y="9" width="2" height="2" fill="#DE886D"/></g>
<g class="ny-eye" fill="#000"><rect x="4" y="8" width="1" height="2"/><rect x="10" y="8" width="1" height="2"/></g>
<!-- open smile -->
<rect x="6" y="11" width="3" height="1" fill="#000" rx=".5"/>
</g>
</svg>`,
  'lantern': `<svg xmlns="http://www.w3.org/2000/svg" viewBox="-15 -25 45 45">
<defs><style>
.lf-body{transform-origin:7.5px 13px;animation:lf-walk 2.4s infinite ease-in-out;}
.lf-shad{transform-origin:7.5px 15.5px;animation:lf-shadow 2.4s infinite ease-in-out;}
.lf-eye {transform-origin:7.5px 9px;animation:lf-blink 3s infinite;}
.lf-arm {transform-origin:14px 9px;animation:lf-armhold 2.4s infinite ease-in-out;}
.lf-lan {transform-origin:18px -6px;animation:lf-lanswing 2.4s infinite ease-in-out;}
.lf-glow{animation:lf-glowpulse 2s infinite ease-in-out;}
.lf-steam{opacity:0;animation:lf-steam 2.5s var(--sd2,0s) infinite ease-in;}
@keyframes lf-walk{0%,100%{transform:translateY(0) rotate(-1.5deg);}50%{transform:translateY(-.8px) rotate(1.5deg);}}
@keyframes lf-shadow{0%,100%{transform:scaleX(1);opacity:.5;}50%{transform:scaleX(.92);opacity:.42;}}
@keyframes lf-blink{0%,45%,55%,100%{transform:scaleY(1);}50%{transform:scaleY(.1);}}
@keyframes lf-armhold{0%,100%{transform:rotate(-58deg);}50%{transform:rotate(-64deg);}}
@keyframes lf-lanswing{0%,100%{transform:rotate(4deg);}50%{transform:rotate(-4deg);}}
@keyframes lf-glowpulse{0%,100%{opacity:.85;}50%{opacity:1;}}
@keyframes lf-steam{0%{opacity:0;transform:translate(0,0) scaleX(1);}20%{opacity:.7;}100%{opacity:0;transform:translate(var(--tx,1px),-7px) scaleX(.4);}}
</style></defs>

<!-- warm glow halo -->
<circle class="lf-glow" cx="18" cy="-2" r="9" fill="#FF9500" opacity=".12"/>

<rect class="lf-shad" x="3" y="15" width="9" height="1" fill="#000" opacity=".5"/>

<!-- bowl of tangyuan (foreground left) -->
<g transform="translate(-13,9)">
<g fill="#fff">
<g class="lf-steam" style="--sd2:0s;--tx:-1px"><rect x="2" y="-1" width=".8" height="2" rx=".4"/></g>
<g class="lf-steam" style="--sd2:-1.2s;--tx:1px"><rect x="4" y="-1" width=".8" height="2" rx=".4"/></g>
</g>
<path d="M0 2 H8 L7 6 Q4 7.5 1 6 Z" fill="#4FC3F7"/>            <!-- bowl -->
<path d="M0 2 H8 V3 H0 Z" fill="#81D4FA"/>
<circle cx="2.5" cy="2.4" r="1.3" fill="#FFF8F0"/>             <!-- 汤圆 -->
<circle cx="5.2" cy="2.4" r="1.3" fill="#FFF8F0"/>
<circle cx="3.9" cy="3.4" r="1.3" fill="#FFFBF5"/>
<circle cx="2.2" cy="2" r=".4" fill="#fff"/>
<circle cx="4.9" cy="2" r=".4" fill="#fff"/>
</g>

<g class="lf-body">
<g fill="#DE886D">
<rect x="3" y="13" width="1" height="2"/><rect x="5" y="13" width="1" height="2"/>
<rect x="9" y="13" width="1" height="2"/><rect x="11" y="13" width="1" height="2"/>
</g>
<rect x="2" y="6" width="11" height="7" fill="#DE886D"/>
<rect x="0" y="9" width="2" height="2" fill="#DE886D"/>
<!-- right arm holds lantern pole -->
<g class="lf-arm"><rect x="13" y="8" width="2" height="2" fill="#DE886D"/></g>
<g class="lf-eye" fill="#000"><rect x="4" y="8" width="1" height="2"/><rect x="10" y="8" width="1" height="2"/></g>
</g>

<!-- lantern on pole (swings) -->
<g class="lf-lan">
<rect x="14" y="-3" width=".6" height="6" fill="#8B5A2B" transform="rotate(28,14,3)"/>
<g transform="translate(18,-6)">
<rect x="-2" y="0" width="4" height=".6" fill="#FFC83D"/>
<rect x="-2.4" y=".6" width="4.8" height="5" fill="#E03030" rx="1.1"/>
<g class="lf-glow"><rect x="-1.4" y="1" width="3.2" height="4" fill="#FFB347" rx=".8" opacity=".6"/></g>
<rect x="-2" y="5.6" width="4" height=".6" fill="#FFC83D"/>
<rect x="-1.2" y="6.2" width=".4" height="2" fill="#FFC83D"/>
<rect x="-.2" y="6.2" width=".4" height="2.4" fill="#FFC83D"/>
<rect x=".8" y="6.2" width=".4" height="2" fill="#FFC83D"/>
</g>
</g>
</svg>`,
  'valentine': `<svg xmlns="http://www.w3.org/2000/svg" viewBox="-15 -25 45 45">
<defs><style>
.vd-body{transform-origin:7.5px 13px;animation:vd-sway 2.8s infinite ease-in-out;}
.vd-shad{transform-origin:7.5px 15.5px;animation:vd-shadow 2.8s infinite ease-in-out;}
.vd-heart{transform-origin:7.5px 9px;animation:vd-heartbeat .8s infinite ease-in-out;}
.vd-blush{animation:vd-blush 2.8s infinite ease-in-out;}
.vd-rise{opacity:0;animation:vd-rise var(--d,2.6s) var(--delay,0s) infinite ease-out;}
@keyframes vd-sway{0%,100%{transform:rotate(-2deg);}50%{transform:rotate(2deg);}}
@keyframes vd-shadow{0%,100%{transform:scaleX(1);opacity:.5;}50%{transform:scaleX(1.03);opacity:.45;}}
@keyframes vd-heartbeat{0%,100%{transform:scale(1);}25%{transform:scale(1.2);}40%{transform:scale(1);}60%{transform:scale(1.15);}}
@keyframes vd-blush{0%,100%{opacity:.6;}50%{opacity:.95;}}
@keyframes vd-rise{0%{opacity:0;transform:translate(0,0) scale(.5) rotate(0deg);}15%{opacity:1;transform:scale(1);}80%{opacity:.7;}100%{opacity:0;transform:translate(var(--tx,2px),-22px) scale(1.1) rotate(var(--r,15deg));}}
</style></defs>

<!-- rising hearts -->
<g fill="#FF4081">
<g class="vd-rise" style="--delay:0s;--d:2.8s;--tx:-3px;--r:-12deg" transform="translate(-8,8)"><rect x="0" y="0" width="1.4" height="1.4"/><rect x="2" y="0" width="1.4" height="1.4"/><rect x="0" y="1" width="3.4" height="1.4"/><rect x=".8" y="2.2" width="1.8" height="1"/><rect x="1.4" y="3" width=".6" height=".8"/></g>
<g class="vd-rise" style="--delay:-.9s;--d:2.4s;--tx:4px;--r:18deg" transform="translate(15,9)" fill="#FF6EA5"><rect x="0" y="0" width="1.1" height="1.1"/><rect x="1.6" y="0" width="1.1" height="1.1"/><rect x="0" y=".8" width="2.7" height="1.1"/><rect x=".6" y="1.8" width="1.5" height=".8"/><rect x="1.1" y="2.5" width=".5" height=".6"/></g>
<g class="vd-rise" style="--delay:-1.6s;--d:3s;--tx:-2px;--r:-20deg" transform="translate(4,10)" fill="#FF80AB"><rect x="0" y="0" width="1.2" height="1.2"/><rect x="1.7" y="0" width="1.2" height="1.2"/><rect x="0" y=".9" width="2.9" height="1.2"/><rect x=".7" y="2" width="1.5" height=".9"/><rect x="1.2" y="2.8" width=".5" height=".7"/></g>
<g class="vd-rise" style="--delay:-2.1s;--d:2.5s;--tx:5px;--r:10deg" transform="translate(20,7)" fill="#FF4081"><rect x="0" y="0" width="1" height="1"/><rect x="1.4" y="0" width="1" height="1"/><rect x="0" y=".7" width="2.4" height="1"/><rect x=".5" y="1.6" width="1.4" height=".7"/><rect x="1" y="2.2" width=".4" height=".5"/></g>
</g>

<rect class="vd-shad" x="3" y="15" width="9" height="1" fill="#000" opacity=".5"/>
<g class="vd-body">
<g fill="#DE886D">
<rect x="3" y="13" width="1" height="2"/><rect x="5" y="13" width="1" height="2"/>
<rect x="9" y="13" width="1" height="2"/><rect x="11" y="13" width="1" height="2"/>
</g>
<rect x="2" y="6" width="11" height="7" fill="#DE886D"/>
<rect x="0" y="9" width="2" height="2" fill="#DE886D"/>
<!-- right arm holds a rose -->
<rect x="13" y="8" width="2" height="2" fill="#DE886D"/>
<g transform="translate(14,2)">
<rect x="0" y="3" width=".6" height="4" fill="#2E7D32"/>
<rect x="-1" y="4.5" width="1.2" height=".6" fill="#388E3C" transform="rotate(-30,-.4,4.8)"/>
<rect x="-1.5" y="0" width="3.2" height="3" fill="#E91E63" rx=".6"/>
<rect x="-.8" y=".6" width="1.6" height="1.6" fill="#FF5C8D" rx=".3"/>
</g>
<!-- blush cheeks -->
<g class="vd-blush" fill="#FF7AA8"><rect x="3" y="10" width="1.6" height="1" rx=".5"/><rect x="10.4" y="10" width="1.6" height="1" rx=".5"/></g>
<!-- heart eyes -->
<g class="vd-heart" fill="#FF1744">
<g transform="translate(3.4,8)"><rect x="0" y="0" width=".8" height=".8"/><rect x="1.2" y="0" width=".8" height=".8"/><rect x="0" y=".6" width="2" height=".9"/><rect x=".5" y="1.4" width="1" height=".7"/></g>
<g transform="translate(9.4,8)"><rect x="0" y="0" width=".8" height=".8"/><rect x="1.2" y="0" width=".8" height=".8"/><rect x="0" y=".6" width="2" height=".9"/><rect x=".5" y="1.4" width="1" height=".7"/></g>
</g>
</g>
</svg>`,
  'qixi': `<svg xmlns="http://www.w3.org/2000/svg" viewBox="-15 -25 45 45">
<defs><style>
.qx-body{transform-origin:7.5px 13px;animation:qx-look 5s infinite ease-in-out;}
.qx-shad{transform-origin:7.5px 15.5px;animation:qx-shadow 5s infinite ease-in-out;}
.qx-eye {transform-origin:7.5px 9px;animation:qx-eye 5s infinite ease-in-out;}
.qx-bstar{animation:qx-bstar var(--d,2s) var(--sd,0s) infinite ease-in-out;}
.qx-big {animation:qx-bigstar 2.5s var(--bd3,0s) infinite ease-in-out;}
.qx-mag {animation:qx-magfly 6s infinite ease-in-out;}
.qx-wing{transform-origin:center;animation:qx-flap .3s infinite alternate ease-in-out;}
.qx-heart{transform-origin:7.5px -18px;animation:qx-heartpulse 1.5s infinite ease-in-out;}
@keyframes qx-look{0%,30%,100%{transform:rotate(0deg) translateY(0);}45%,85%{transform:rotate(-7deg) translate(-.5px,-.4px);}}
@keyframes qx-shadow{0%,30%,100%{opacity:.5;transform:scaleX(1);}60%{opacity:.35;transform:scaleX(.88);}}
@keyframes qx-eye{0%,30%,100%{transform:translate(0,0) scaleY(1);}35%{transform:scaleY(.1);}38%,85%{transform:translate(-.5px,-.8px) scaleY(.82);}}
@keyframes qx-bstar{0%,100%{opacity:.3;transform:scale(.6);}50%{opacity:.9;transform:scale(1);}}
@keyframes qx-bigstar{0%,100%{opacity:.7;transform:scale(.9);}50%{opacity:1;transform:scale(1.2);}}
@keyframes qx-magfly{0%,100%{transform:translate(0,0);}50%{transform:translate(3px,-2px);}}
@keyframes qx-flap{0%{transform:scaleX(1);}100%{transform:scaleX(.5);}}
@keyframes qx-heartpulse{0%,100%{opacity:.85;transform:scale(1);}50%{opacity:1;transform:scale(1.12);}}
</style></defs>

<!-- magpie bridge: arc of small stars -->
<g fill="#C5CEFF">
<rect class="qx-bstar" style="--d:1.6s;--sd:0s"   x="-11" y="-12" width=".8" height=".8" rx=".2"/>
<rect class="qx-bstar" style="--d:1.8s;--sd:-.2s" x="-8" y="-15" width=".8" height=".8" rx=".2"/>
<rect class="qx-bstar" style="--d:2s;--sd:-.4s"   x="-4" y="-17.5" width=".8" height=".8" rx=".2"/>
<rect class="qx-bstar" style="--d:1.7s;--sd:-.6s" x="1" y="-19" width=".8" height=".8" rx=".2"/>
<rect class="qx-bstar" style="--d:1.9s;--sd:-.8s" x="7" y="-19.5" width=".8" height=".8" rx=".2"/>
<rect class="qx-bstar" style="--d:2.1s;--sd:-1s"  x="13" y="-19" width=".8" height=".8" rx=".2"/>
<rect class="qx-bstar" style="--d:1.8s;--sd:-1.2s"x="18" y="-17.5" width=".8" height=".8" rx=".2"/>
<rect class="qx-bstar" style="--d:2s;--sd:-1.4s"  x="22" y="-15" width=".8" height=".8" rx=".2"/>
<rect class="qx-bstar" style="--d:1.7s;--sd:-1.6s"x="25" y="-12" width=".8" height=".8" rx=".2"/>
</g>

<!-- 牛郎织女 two big stars on either side -->
<g class="qx-big" style="--bd3:0s" transform="translate(-11,-8)" fill="#FFE066">
<rect x="-.5" y="-2" width="1" height="4"/><rect x="-2" y="-.5" width="4" height="1"/>
</g>
<g class="qx-big" style="--bd3:-1.2s" transform="translate(25,-8)" fill="#FFB3D1">
<rect x="-.5" y="-2" width="1" height="4"/><rect x="-2" y="-.5" width="4" height="1"/>
</g>

<!-- magpie -->
<g class="qx-mag" transform="translate(16,-13)" fill="#222">
<ellipse cx="0" cy="0" rx="1.4" ry="1" />
<rect x="1" y="-.4" width="1.6" height=".8" rx=".3"/>
<g class="qx-wing"><polygon points="-1,-.4 -3,-1.4 -2.4,.6"/></g>
<rect x="-2.4" y="-.2" width="2" height=".5" fill="#222"/>
</g>

<!-- floating heart above -->
<g class="qx-heart" transform="translate(6,-22)" fill="#FF6B9D">
<rect x="0" y="0" width="1.2" height="1.2"/><rect x="1.8" y="0" width="1.2" height="1.2"/>
<rect x="0" y=".9" width="3" height="1.2"/><rect x=".7" y="2" width="1.6" height=".9"/><rect x="1.2" y="2.7" width=".6" height=".6"/>
</g>

<rect class="qx-shad" x="3" y="15" width="9" height="1" fill="#000" opacity=".5"/>
<g class="qx-body">
<g fill="#DE886D">
<rect x="3" y="13" width="1" height="2"/><rect x="5" y="13" width="1" height="2"/>
<rect x="9" y="13" width="1" height="2"/><rect x="11" y="13" width="1" height="2"/>
</g>
<rect x="2" y="6" width="11" height="7" fill="#DE886D"/>
<rect x="0" y="9" width="2" height="2" fill="#DE886D"/>
<rect x="13" y="9" width="2" height="2" fill="#DE886D"/>
<g class="qx-eye" fill="#000"><rect x="4" y="8" width="1" height="2"/><rect x="10" y="8" width="1" height="2"/></g>
</g>
</svg>`,
};

/** Desk-pet palette override — body/eyes only; props & FX stay original. */
export const CLAWD_BODY = '#FFFFFF';
export const CLAWD_EYES = '#3D8BFF';

/** Upstream crab shell color in clawd-emotes-skill SVGs. */
const UPSTREAM_BODY = '#DE886D';

export function getClawdSvg(id: ClawdEmoteId): string {
  let svg = SVG[id];
  // Shell / feet / arms
  svg = svg.replaceAll(UPSTREAM_BODY, CLAWD_BODY);
  // Named eye groups (incl. halloween's orange pupils)
  svg = svg.replace(
    /class="([^"]*-eye)" fill="#[0-9A-Fa-f]{3,8}"/g,
    `class="$1" fill="${CLAWD_EYES}"`,
  );
  // Sleeping uses closed-eye bars without the *-eye class
  svg = svg.replace(
    /(<!-- closed sleeping eyes -->\s*<g fill=)"#[0-9A-Fa-f]{3,8}"/g,
    `$1"${CLAWD_EYES}"`,
  );
  return svg;
}

export function isClawdEmoteId(v: string): v is ClawdEmoteId {
  return Object.prototype.hasOwnProperty.call(SVG, v);
}
