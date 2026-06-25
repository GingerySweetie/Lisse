import { registerPlugin } from '@capacitor/core';

/**
 * In-app browser bridge. Native side spawns a separate Activity with
 * a WebView and full JS evaluation; React side only ever calls open()
 * with the bundle of context it needs.
 */

export interface AutoInjectRule {
  /** Substring matched (case-insensitive) against the current URL. */
  pattern: string;
  /** JS code to evaluate when the URL contains pattern. */
  code: string;
}

export interface SavedScript {
  name: string;
  code: string;
}

export interface InAppBrowserPlugin {
  /** Open a URL in the in-app browser activity. Subsequent calls while
   *  the activity is already running route the new URL into the
   *  existing WebView (singleTask launch mode). */
  open(args: {
    url: string;
    userAgent?: string;
    autoInjects?: AutoInjectRule[];
    savedScripts?: SavedScript[];
  }): Promise<{ ok: boolean }>;

  /** 直通 android.webkit.CookieManager.getInstance().getCookie(url)
   *  读 cookie. 兜底 CapacitorCookies 在某些 OEM WebView 上读不到
   *  内置浏览器 Activity 写入的 jar 的问题 — 进程级单例无论谁写
   *  的都看得到。
   *
   *  返回原 cookie header 字符串 + 解析好的 name → value 映射. */
  getCookies(args: {
    url: string;
  }): Promise<{ cookieString: string; cookies: Record<string, string> }>;
}

const InAppBrowser = registerPlugin<InAppBrowserPlugin>('InAppBrowser');
export default InAppBrowser;
