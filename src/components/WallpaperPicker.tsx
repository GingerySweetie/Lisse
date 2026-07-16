import { useRef, useState } from 'react';
import { ImageIcon, RotateCcw } from 'lucide-react';
import { resizeImageToBase64 } from '../lib/attachments';

interface Props {
  value?: string | null;
  onChange: (next: string | null) => void;
  disabled?: boolean;
}

/** Pick a chat wallpaper from the system photo library, or restore the
 *  default lavender + wisteria background. Stores a resized data URL. */
export default function WallpaperPicker({ value, onChange, disabled }: Props) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const hasCustom = Boolean(value);

  async function onFile(file: File | undefined) {
    if (!file || !file.type.startsWith('image/')) return;
    setBusy(true);
    try {
      // Wallpaper fills the stream area — keep payload smaller than chat
      // attachments so IndexedDB settings stay snappy.
      const { data, mimeType } = await resizeImageToBase64(file, 1600, 0.82);
      onChange(`data:${mimeType};base64,${data}`);
    } catch (e) {
      console.error('[wallpaper] 读取图片失败:', e);
    } finally {
      setBusy(false);
      if (inputRef.current) inputRef.current.value = '';
    }
  }

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        style={{ display: 'none' }}
        onChange={(e) => void onFile(e.target.files?.[0])}
      />
      <button
        type="button"
        disabled={disabled || busy}
        onClick={() => inputRef.current?.click()}
        aria-label="从相册选择壁纸"
        title="从相册选择壁纸"
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: 6,
          padding: '5px 10px',
          borderRadius: 10,
          border: '1px solid hsla(270, 25%, 78%, 0.45)',
          background: hasCustom
            ? 'hsla(270, 35%, 88%, 0.55)'
            : 'hsla(270, 30%, 96%, 0.7)',
          color: 'hsla(268, 28%, 38%, 0.85)',
          fontSize: 11,
          letterSpacing: '0.04em',
          cursor: disabled || busy ? 'not-allowed' : 'pointer',
          opacity: disabled || busy ? 0.55 : 1,
          fontFamily: 'var(--font-serif)',
        }}
      >
        <ImageIcon size={12} strokeWidth={1.5} />
        <span>{busy ? '处理中…' : hasCustom ? '更换壁纸' : '选择壁纸'}</span>
      </button>
      {hasCustom && (
        <button
          type="button"
          disabled={disabled || busy}
          onClick={() => onChange(null)}
          aria-label="恢复默认背景"
          title="恢复默认背景"
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 4,
            padding: '5px 8px',
            borderRadius: 10,
            border: '1px solid hsla(270, 20%, 78%, 0.35)',
            background: 'transparent',
            color: 'hsla(268, 22%, 48%, 0.75)',
            fontSize: 11,
            letterSpacing: '0.04em',
            cursor: disabled || busy ? 'not-allowed' : 'pointer',
            opacity: disabled || busy ? 0.55 : 1,
            fontFamily: 'var(--font-serif)',
          }}
        >
          <RotateCcw size={11} strokeWidth={1.5} />
          <span>默认</span>
        </button>
      )}
    </div>
  );
}
