import { useLiveQuery } from 'dexie-react-hooks';
import { getSettings } from '../db';
import ConsultCurtainBg from './ConsultCurtainBg';
import { CONSULT } from '../lib/consult-theme';

/**
 * Shared consult-room backdrop. Default = waving white/lavender curtains;
 * when the user picks a custom wallpaper, that image covers the page instead.
 */
export default function ConsultBackdrop() {
  const settings = useLiveQuery(() => getSettings(), [], null);
  const wallpaper = settings?.consultWallpaper ?? null;

  if (wallpaper) {
    return (
      <div
        aria-hidden
        style={{
          position: 'absolute',
          inset: 0,
          zIndex: 0,
          pointerEvents: 'none',
          backgroundColor: CONSULT.bg,
          backgroundImage: `url(${wallpaper})`,
          backgroundSize: 'cover',
          backgroundPosition: 'center',
          backgroundRepeat: 'no-repeat',
        }}
      />
    );
  }

  return <ConsultCurtainBg />;
}
