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
}

const InAppBrowser = registerPlugin<InAppBrowserPlugin>('InAppBrowser');
export default InAppBrowser;
