import { registerPlugin, type PluginListenerHandle } from '@capacitor/core';

/**
 * ShareIntent — receives files / text shared into the app from the
 * Android share sheet. Both surfaces (cold-start initial share + warm
 * 'shareReceived' event) are exposed so the consumer (Books page) can
 * handle either case.
 */

export interface SharedFile {
  /** Display name from ContentResolver (best effort). */
  name: string;
  /** MIME type as Android reported it. */
  mimeType: string;
  size: number;
  /** Base64-encoded payload (no data: prefix). */
  data: string;
}

export interface SharePayload {
  files?: SharedFile[];
  text?: string;
}

export interface ShareIntentPlugin {
  getInitialShare(): Promise<{ share: SharePayload | null }>;
  addListener(
    event: 'shareReceived',
    cb: (data: SharePayload) => void,
  ): Promise<PluginListenerHandle>;
}

const ShareIntent = registerPlugin<ShareIntentPlugin>('ShareIntent');
export default ShareIntent;
