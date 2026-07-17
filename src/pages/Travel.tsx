import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useLiveQuery } from 'dexie-react-hooks';
import { ChevronLeft, MapPin, Plane, Eye } from 'lucide-react';
import { db, getSettings, saveSettings } from '../db';
import {
  formatTripPush,
  mergeTravelCfg,
  travelTick,
} from '../lib/travel';
import { markEvent, markHeldSeen } from '../lib/travel/store';

/**
 * 阳台 — where held pushes and returned gifts land.
 * Quiet by design: the daemon drops things here; push is only a knock.
 */
export default function TravelPage() {
  const settings = useLiveQuery(() => getSettings(), [], null);
  const trips = useLiveQuery(
    () => db.travelTrips.orderBy('createdAt').reverse().limit(40).toArray(),
    [],
    [],
  );
  const held = useLiveQuery(
    () =>
      db.travelHeldPushes
        .orderBy('createdAt')
        .reverse()
        .filter((h) => !h.seen)
        .limit(20)
        .toArray(),
    [],
    [],
  );
  const events = useLiveQuery(
    () => db.travelEvents.orderBy('createdAt').reverse().limit(30).toArray(),
    [],
    [],
  );

  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const cfg = mergeTravelCfg(settings?.travelDaemon);

  async function toggleEnabled() {
    await saveSettings({
      travelDaemon: { ...cfg, enabled: !cfg.enabled },
    });
  }

  async function forceGo() {
    setBusy(true);
    setErr(null);
    try {
      // Ensure enabled so force path has endpoint resolution context.
      if (!cfg.enabled) {
        await saveSettings({
          travelDaemon: { ...cfg, enabled: true },
        });
      }
      const trip = await travelTick({ force: true });
      if (!trip) setErr('这一轮没有成行（可能已有出行在跑，或 endpoint 未配）');
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  async function clearHeld() {
    if (!held?.length) return;
    await markHeldSeen(held.map((h) => h.id));
  }

  async function acceptInvite(tripId: string) {
    await markEvent('invite_accepted', '用户在阳台点了「去」', {}, tripId);
    await db.travelTrips.update(tripId, { memoryLabel: 'shared' });
  }

  return (
    <div className="flex h-full w-full flex-col">
      <header className="topbar flex items-center gap-3 px-3 py-3 md:px-6">
        <Link
          to="/home"
          className="inline-flex items-center gap-1 rounded-lg px-2 py-1 text-sm text-ink-500 transition hover:bg-lavender-50"
        >
          <ChevronLeft size={16} />
          玄関
        </Link>
        <h2 className="serif-title text-lg">阳台</h2>
        <span className="ml-auto text-[11px] tracking-widest text-ink-400">
          TRAVEL DAEMON
        </span>
      </header>

      <div className="flex-1 overflow-y-auto px-3 py-5 md:px-6">
        <div className="mx-auto flex max-w-2xl flex-col gap-6">
          {/* Atmosphere strip */}
          <section
            className="relative overflow-hidden rounded-2xl px-5 py-6"
            style={{
              background:
                'linear-gradient(135deg, rgba(186,210,220,0.55) 0%, rgba(232,220,236,0.7) 45%, rgba(255,236,210,0.5) 100%)',
            }}
          >
            <div
              className="pointer-events-none absolute inset-0 opacity-40"
              style={{
                backgroundImage:
                  'radial-gradient(circle at 20% 30%, rgba(255,255,255,0.5) 0%, transparent 40%), radial-gradient(circle at 80% 70%, rgba(160,190,200,0.35) 0%, transparent 45%)',
              }}
            />
            <p
              className="relative text-[13px] leading-relaxed text-[#4a5560]"
              style={{ fontFamily: 'var(--font-serif)' }}
            >
              东西会先落在这里。推送只是偶尔敲一下门。
            </p>
            <div className="relative mt-4 flex flex-wrap items-center gap-3">
              <label className="flex items-center gap-2 text-sm text-[#3d4650]">
                <input
                  type="checkbox"
                  checked={cfg.enabled}
                  onChange={() => void toggleEnabled()}
                  className="h-4 w-4 accent-lavender-400"
                />
                启用出行 daemon
              </label>
              <button
                type="button"
                disabled={busy}
                onClick={() => void forceGo()}
                className="inline-flex items-center gap-1.5 rounded-lg bg-[#3d4650]/90 px-3 py-1.5 text-xs text-white transition hover:bg-[#3d4650] disabled:opacity-50"
              >
                <Plane size={13} />
                {busy ? '在路上…' : '现在出门'}
              </button>
              <Link
                to="/settings"
                className="text-xs text-[#5a6570] underline-offset-2 hover:underline"
              >
                详细设置
              </Link>
            </div>
            {err && (
              <p className="relative mt-3 text-xs text-rose-700">{err}</p>
            )}
          </section>

          {/* Held pushes */}
          {held && held.length > 0 && (
            <section>
              <div className="mb-2 flex items-center justify-between">
                <h3 className="flex items-center gap-1.5 text-sm font-medium text-ink-800">
                  <Eye size={14} className="text-lavender-600" />
                  搁在阳台的消息
                </h3>
                <button
                  type="button"
                  onClick={() => void clearHeld()}
                  className="text-xs text-ink-400 hover:text-ink-700"
                >
                  标为已读
                </button>
              </div>
              <ul className="flex flex-col gap-2">
                {held.map((h) => (
                  <li
                    key={h.id}
                    className="rounded-xl border border-lavender-100 bg-white/60 px-4 py-3 text-sm text-ink-800"
                  >
                    <p>{h.text}</p>
                    <p className="mt-1 text-[11px] text-ink-400">{h.reason}</p>
                  </li>
                ))}
              </ul>
            </section>
          )}

          {/* Trips */}
          <section>
            <h3 className="mb-2 flex items-center gap-1.5 text-sm font-medium text-ink-800">
              <MapPin size={14} className="text-lavender-600" />
              带回的东西
            </h3>
            {!trips?.length && (
              <p className="text-sm text-ink-400">还没有出行记录。</p>
            )}
            <ul className="flex flex-col gap-4">
              {trips?.map((t) => (
                <li
                  key={t.id}
                  className="overflow-hidden rounded-2xl border border-lavender-100 bg-white/70"
                >
                  {t.imageUrl ? (
                    <a
                      href={t.imageUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="block max-h-56 overflow-hidden bg-[#e8eef2]"
                    >
                      <img
                        src={t.imageUrl}
                        alt={t.location}
                        className="h-56 w-full object-cover transition duration-700 hover:scale-[1.02]"
                        loading="lazy"
                        referrerPolicy="no-referrer"
                      />
                    </a>
                  ) : (
                    <div className="flex h-24 items-center justify-center bg-gradient-to-br from-[#e8eef2] to-[#f3eef8] text-xs text-ink-400">
                      {t.status === 'running'
                        ? '还在路上…'
                        : t.status === 'error'
                          ? '这次没带回来图'
                          : '无图'}
                    </div>
                  )}
                  <div className="px-4 py-3">
                    <div className="flex flex-wrap items-baseline gap-2">
                      <span
                        className="text-base text-ink-900"
                        style={{ fontFamily: 'var(--font-serif)' }}
                      >
                        {t.location || '（未命名）'}
                      </span>
                      <span className="text-[11px] text-ink-400">{t.era}</span>
                      <span
                        className={`ml-auto rounded px-1.5 py-0.5 text-[10px] ${
                          t.memoryLabel === 'shared'
                            ? 'bg-lavender-100 text-lavender-800'
                            : 'bg-ink-50 text-ink-500'
                        }`}
                      >
                        {t.memoryLabel === 'shared' ? '一起' : '独自'}
                      </span>
                    </div>
                    {t.feeling && (
                      <p className="mt-1 text-xs text-ink-500">{t.feeling}</p>
                    )}
                    {t.monologue && (
                      <p className="mt-2 text-sm leading-relaxed text-ink-700">
                        {t.monologue}
                      </p>
                    )}
                    {t.gift && (
                      <p className="mt-2 text-sm text-ink-800">
                        带回：<span className="font-medium">{t.gift}</span>
                      </p>
                    )}
                    {t.imageSource && (
                      <p className="mt-1 text-[10px] leading-snug text-ink-400">
                        {t.imageSource}
                      </p>
                    )}
                    {t.message && (
                      <p className="mt-2 border-l-2 border-lavender-200 pl-2 text-sm text-ink-600">
                        {formatTripPush(t)}
                      </p>
                    )}
                    {t.invite && t.status === 'completed' && (
                      <button
                        type="button"
                        onClick={() => void acceptInvite(t.id)}
                        className="mt-3 rounded-lg border border-[#3d4650]/30 px-3 py-1.5 text-xs text-[#3d4650] transition hover:bg-[#3d4650]/5"
                      >
                        去
                      </button>
                    )}
                    {t.status === 'error' && (
                      <p className="mt-2 text-xs text-rose-600">
                        {t.errorMessage}
                      </p>
                    )}
                    <p className="mt-2 text-[10px] text-ink-300">
                      signed · {t.model} ·{' '}
                      {new Date(t.createdAt).toLocaleString('zh-CN')}
                    </p>
                  </div>
                </li>
              ))}
            </ul>
          </section>

          {/* Observability */}
          <section className="pb-10">
            <h3 className="mb-2 text-sm font-medium text-ink-800">决策痕迹</h3>
            <p className="mb-2 text-[11px] text-ink-400">
              每一次不去、不推，都会留下有原因的标记。
            </p>
            <ul className="flex flex-col gap-1.5 font-mono text-[11px] text-ink-500">
              {events?.map((e) => (
                <li key={e.id} className="flex gap-2">
                  <span className="shrink-0 text-ink-300">
                    {new Date(e.createdAt).toLocaleTimeString('zh-CN', {
                      hour12: false,
                    })}
                  </span>
                  <span className="shrink-0 text-lavender-700">{e.kind}</span>
                  <span className="min-w-0 break-words">{e.reason}</span>
                </li>
              ))}
              {!events?.length && (
                <li className="text-ink-300">尚无标记</li>
              )}
            </ul>
          </section>
        </div>
      </div>
    </div>
  );
}
