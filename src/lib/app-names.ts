/**
 * Friendly-name overrides for packages whose PackageManager label is
 * either missing (Android 11+ visibility quirks) or unhelpful (system
 * UIs that read as bare ids). Applied AFTER native returns the label —
 * only kicks in when the label still looks like a package name.
 */
const OVERRIDES: Record<string, string> = {
  'com.android.chrome': 'Chrome',
  'com.twitter.android': 'X',
  'tv.danmaku.bili': '哔哩哔哩',
  'tv.danmaku.bilibilihd': '哔哩哔哩 HD',
  'com.tencent.mobileqq': 'QQ',
  'com.tencent.mm': '微信',
  'com.eg.android.AlipayGphone': '支付宝',
  'com.github.metacubex.clash.alpha': 'Clash',
  'com.github.kr328.clash': 'Clash',
  'com.zhiliaoapp.musically': 'TikTok',
  'com.ss.android.ugc.aweme': '抖音',
  'com.smile.gifmaker': '快手',
  'com.taobao.taobao': '淘宝',
  'com.jingdong.app.mall': '京东',
  'com.xunmeng.pinduoduo': '拼多多',
  'com.netease.cloudmusic': '网易云音乐',
  'com.tencent.qqmusic': 'QQ 音乐',
  'com.spotify.music': 'Spotify',
  'com.netflix.mediaclient': 'Netflix',
  'com.google.android.youtube': 'YouTube',
  'com.google.android.apps.youtube.music': 'YouTube Music',
  'com.google.android.gm': 'Gmail',
  'com.android.vending': 'Google Play',
  'com.google.android.googlequicksearchbox': 'Google',
  'com.discord': 'Discord',
  'com.tencent.weread': '微信读书',
  'md.obsidian': 'Obsidian',
  'org.koreader.launcher': 'KOReader',
  'com.amazon.kindle': 'Kindle',
  'com.amazon.kindle.cn': 'Kindle 中国',
  'com.duokan.reader': '多看阅读',
  'com.douban.book.reader': '豆瓣阅读',
  'com.douban.frodo': '豆瓣',
  'com.zhihu.android': '知乎',
  'com.zhihu.zhuanlan': '知乎专栏',
  'org.mozilla.firefox': 'Firefox',
  'com.microsoft.emmx': 'Edge',
  'com.brave.browser': 'Brave',
  'com.duckduckgo.mobile.android': 'DuckDuckGo',
  'us.zoom.videomeetings': 'Zoom',
  'com.tencent.tim': 'TIM',
  'com.tencent.androidqqmail': 'QQ 邮箱',
  'com.alibaba.android.rimet': '钉钉',
  'com.tencent.wework': '企业微信',
  'com.tencent.weishi': '微视',
  'com.kuaishou.nebula': '快手极速版',
  'com.sina.weibo': '微博',
  'com.tencent.news': '腾讯新闻',
  'com.ss.android.article.news': '今日头条',
  'com.baidu.searchbox': '百度',
  'com.baidu.netdisk': '百度网盘',
  'com.alibaba.aliyun': '阿里云',
  'com.alipay.android.phone': '支付宝',
};

/** Normalize an app name: prefer override, else trim. If the input is
 *  still a dot-segmented package id, return its last segment titled. */
export function friendlyAppName(packageName: string, label?: string): string {
  const override = OVERRIDES[packageName];
  if (override) return override;
  if (label && label.length > 0 && !label.includes('.')) return label;
  // Fall back to titled last segment.
  const tail = packageName.split('.').pop() || packageName;
  return tail.charAt(0).toUpperCase() + tail.slice(1);
}
