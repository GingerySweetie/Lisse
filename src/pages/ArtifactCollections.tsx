import { useMemo, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Check, Download, FolderOpen, Plus, Trash2, X } from 'lucide-react';
import JSZip from 'jszip';
import ArtifactCard, { downloadArtifact } from '../components/ArtifactCard';
import ConsultBackdrop from '../components/ConsultBackdrop';
import { db } from '../db';
import {
  createCollection,
  deleteCollection,
  removeSavedArtifact,
  renameCollection,
} from '../lib/artifact-collections';
import { CONSULT } from '../lib/consult-theme';
import { saveFile } from '../lib/save-file';
import type { Artifact, ArtifactCollection, SavedArtifact } from '../types';

/**
 * Custom artifact collections browser — create shelves, open one, prune items.
 * Styled to match the consult room's deeper purple / white daylight wash.
 */

export default function ArtifactCollectionsPage() {
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const openId = params.get('c');

  const collections = useLiveQuery(
    () => db.artifactCollections.orderBy('updatedAt').reverse().toArray(),
    [],
    [],
  );
  const allSaved = useLiveQuery(() => db.savedArtifacts.toArray(), [], []);

  const counts = useMemo(() => {
    const m = new Map<string, number>();
    for (const s of allSaved ?? []) {
      m.set(s.collectionId, (m.get(s.collectionId) ?? 0) + 1);
    }
    return m;
  }, [allSaved]);

  const openCollection = collections?.find((c) => c.id === openId) ?? null;
  const items = useMemo(() => {
    if (!openId || !allSaved) return [];
    return allSaved
      .filter((s) => s.collectionId === openId)
      .sort((a, b) => b.createdAt - a.createdAt);
  }, [openId, allSaved]);

  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState('');
  const [renaming, setRenaming] = useState(false);
  const [renameValue, setRenameValue] = useState('');

  async function handleCreate() {
    const name = newName.trim();
    if (!name) return;
    const row = await createCollection({ name });
    setNewName('');
    setCreating(false);
    setParams({ c: row.id });
  }

  async function handleRename() {
    if (!openCollection) return;
    const name = renameValue.trim();
    if (!name) return;
    await renameCollection(openCollection.id, name);
    setRenaming(false);
  }

  async function handleDeleteCollection() {
    if (!openCollection) return;
    if (!confirm(`删除合集「${openCollection.name}」？里面的产物也会一起移除。`))
      return;
    await deleteCollection(openCollection.id);
    setParams({});
  }

  return (
    <div
      style={{
        width: '100%',
        height: '100%',
        position: 'relative',
        overflow: 'hidden',
        background: CONSULT.bg,
        fontFamily: CONSULT.fontBody,
        color: CONSULT.text,
        display: 'flex',
        flexDirection: 'column',
      }}
    >
      <ConsultBackdrop />

      <header
        style={{
          position: 'relative',
          zIndex: 2,
          display: 'flex',
          alignItems: 'center',
          gap: 10,
          padding: '12px 16px',
          paddingTop: 'calc(12px + env(safe-area-inset-top, 0px))',
          borderBottom: `1px solid ${CONSULT.border}`,
          background: 'rgba(250, 248, 252, 0.85)',
          backdropFilter: 'blur(12px)',
          flexShrink: 0,
        }}
      >
        <button
          type="button"
          onClick={() => {
            if (openCollection) setParams({});
            else navigate('/consult');
          }}
          style={{
            background: 'none',
            border: 'none',
            cursor: 'pointer',
            color: CONSULT.muted,
            fontSize: 15,
            padding: '4px 4px 4px 0',
          }}
          aria-label="返回"
        >
          ←
        </button>
        <div style={{ flex: 1, minWidth: 0 }}>
          {openCollection ? (
            renaming ? (
              <input
                autoFocus
                value={renameValue}
                onChange={(e) => setRenameValue(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') void handleRename();
                  if (e.key === 'Escape') setRenaming(false);
                }}
                onBlur={() => void handleRename()}
                style={{
                  width: '100%',
                  background: CONSULT.surfaceSolid,
                  border: `1px solid ${CONSULT.borderStrong}`,
                  borderRadius: 6,
                  padding: '4px 8px',
                  fontSize: 14,
                  color: CONSULT.text,
                  outline: 'none',
                }}
              />
            ) : (
              <button
                type="button"
                onClick={() => {
                  setRenameValue(openCollection.name);
                  setRenaming(true);
                }}
                style={{
                  background: 'none',
                  border: 'none',
                  cursor: 'pointer',
                  padding: 0,
                  textAlign: 'left',
                }}
              >
                <div
                  style={{
                    fontFamily: CONSULT.fontDisplay,
                    fontSize: 18,
                    letterSpacing: '0.1em',
                    color: CONSULT.accent,
                  }}
                >
                  {openCollection.name}
                </div>
                <div style={{ fontSize: 10.5, color: CONSULT.faint, marginTop: 2 }}>
                  点标题可改名 · {items.length} 件
                </div>
              </button>
            )
          ) : (
            <>
              <div
                style={{
                  fontFamily: CONSULT.fontDisplay,
                  fontSize: 18,
                  letterSpacing: '0.14em',
                  color: CONSULT.accent,
                }}
              >
                产物合集
              </div>
              <div style={{ fontSize: 10.5, color: CONSULT.faint, marginTop: 2 }}>
                自定义书架 · 收纳会谈产物
              </div>
            </>
          )}
        </div>
        {openCollection ? (
          <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
            {items.length > 0 && (
              <button
                type="button"
                onClick={() => void downloadCollectionZip(openCollection, items)}
                style={{
                  background: 'none',
                  border: `1px solid ${CONSULT.border}`,
                  borderRadius: 8,
                  width: 32,
                  height: 32,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  color: CONSULT.muted,
                  cursor: 'pointer',
                }}
                aria-label="下载合集"
                title="打包下载全部产物"
              >
                <Download size={14} />
              </button>
            )}
            <button
              type="button"
              onClick={() => void handleDeleteCollection()}
              style={{
                background: 'none',
                border: `1px solid ${CONSULT.border}`,
                borderRadius: 8,
                width: 32,
                height: 32,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: CONSULT.muted,
                cursor: 'pointer',
              }}
              aria-label="删除合集"
            >
              <Trash2 size={14} />
            </button>
          </div>
        ) : (
          <button
            type="button"
            onClick={() => setCreating(true)}
            style={{
              background: CONSULT.accent,
              border: 'none',
              borderRadius: 8,
              padding: '7px 12px',
              color: '#faf8fc',
              fontSize: 12,
              letterSpacing: '0.06em',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: 5,
            }}
          >
            <Plus size={14} />
            新建
          </button>
        )}
      </header>

      <div
        style={{
          flex: 1,
          overflowY: 'auto',
          position: 'relative',
          zIndex: 2,
          padding: '20px 16px 40px',
        }}
      >
        <div style={{ maxWidth: 520, margin: '0 auto' }}>
          {openCollection ? (
            <CollectionItems
              items={items}
              collectionName={openCollection.name}
              onRemove={(id) => removeSavedArtifact(id)}
            />
          ) : (
            <CollectionList
              collections={collections ?? []}
              counts={counts}
              onOpen={(id) => setParams({ c: id })}
            />
          )}
        </div>
      </div>

      {creating && (
        <CreateCollectionModal
          name={newName}
          onChange={setNewName}
          onClose={() => {
            setCreating(false);
            setNewName('');
          }}
          onConfirm={() => void handleCreate()}
        />
      )}
    </div>
  );
}

function CollectionList({
  collections,
  counts,
  onOpen,
}: {
  collections: ArtifactCollection[];
  counts: Map<string, number>;
  onOpen: (id: string) => void;
}) {
  if (collections.length === 0) {
    return (
      <div
        style={{
          textAlign: 'center',
          padding: '48px 16px',
          color: CONSULT.muted,
          fontSize: 13,
          lineHeight: 1.8,
        }}
      >
        还没有合集。
        <br />
        在会谈里生成产物后，点「收入合集」即可新建。
      </div>
    );
  }

  return (
    <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'flex', flexDirection: 'column', gap: 10 }}>
      {collections.map((c) => (
        <li key={c.id}>
          <button
            type="button"
            onClick={() => onOpen(c.id)}
            style={{
              width: '100%',
              display: 'flex',
              alignItems: 'center',
              gap: 12,
              padding: '14px 14px',
              background: CONSULT.surface,
              border: `1px solid ${CONSULT.border}`,
              borderRadius: 2,
              cursor: 'pointer',
              textAlign: 'left',
              boxShadow: CONSULT.shadow,
            }}
          >
            <span
              style={{
                width: 10,
                height: 10,
                borderRadius: '50%',
                background: c.color ?? CONSULT.accent,
                flexShrink: 0,
              }}
            />
            <span style={{ flex: 1, minWidth: 0 }}>
              <span
                style={{
                  display: 'block',
                  fontSize: 14,
                  color: CONSULT.text,
                  letterSpacing: '0.04em',
                }}
              >
                {c.name}
              </span>
              {c.note && (
                <span
                  style={{
                    display: 'block',
                    fontSize: 11,
                    color: CONSULT.faint,
                    marginTop: 3,
                  }}
                >
                  {c.note}
                </span>
              )}
            </span>
            <span
              style={{
                fontSize: 11,
                color: CONSULT.faint,
                display: 'flex',
                alignItems: 'center',
                gap: 4,
              }}
            >
              <FolderOpen size={12} />
              {counts.get(c.id) ?? 0}
            </span>
          </button>
        </li>
      ))}
    </ul>
  );
}

async function downloadCollectionZip(
  collection: ArtifactCollection,
  items: SavedArtifact[],
) {
  if (items.length === 0) return;
  if (items.length === 1) {
    downloadArtifact({
      id: items[0].artifactId,
      name: items[0].name,
      content: items[0].content,
      mimeType: items[0].mimeType,
    });
    return;
  }
  const zip = new JSZip();
  const used = new Set<string>();
  for (const s of items) {
    let name = s.name.replace(/[\\/:*?"<>|\n\r\t]/g, '_').trim() || '产物';
    if (used.has(name)) {
      const i = name.lastIndexOf('.');
      const base = i > 0 ? name.slice(0, i) : name;
      const ext = i > 0 ? name.slice(i) : '';
      let n = 2;
      while (used.has(`${base}-${n}${ext}`)) n++;
      name = `${base}-${n}${ext}`;
    }
    used.add(name);
    zip.file(name, s.content);
  }
  const blob = await zip.generateAsync({ type: 'blob' });
  const safe = collection.name.replace(/[\\/:*?"<>|\n\r\t]/g, '_').slice(0, 40);
  await saveFile(blob, `${safe || '产物合集'}.zip`);
}

function CollectionItems({
  items,
  collectionName,
  onRemove,
}: {
  items: SavedArtifact[];
  collectionName: string;
  onRemove: (id: string) => void;
}) {
  const [selectMode, setSelectMode] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState(false);

  if (items.length === 0) {
    return (
      <div
        style={{
          textAlign: 'center',
          padding: '40px 12px',
          color: CONSULT.muted,
          fontSize: 13,
        }}
      >
        这个合集还是空的。
      </div>
    );
  }

  const allSelected = items.length > 0 && items.every((s) => selected.has(s.id));

  function toggle(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function exitSelect() {
    setSelectMode(false);
    setSelected(new Set());
  }

  async function handleDownloadSelected() {
    if (selected.size === 0 || busy) return;
    setBusy(true);
    try {
      const picked = items.filter((s) => selected.has(s.id));
      await downloadCollectionZip(
        { id: '', name: collectionName, createdAt: 0, updatedAt: 0 },
        picked,
      );
      exitSelect();
    } finally {
      setBusy(false);
    }
  }

  async function handleRemoveSelected() {
    if (selected.size === 0 || busy) return;
    if (!confirm(`从合集移出选中的 ${selected.size} 件产物？`)) return;
    setBusy(true);
    try {
      for (const id of selected) await onRemove(id);
      exitSelect();
    } finally {
      setBusy(false);
    }
  }

  return (
    <div>
      <div
        style={{
          display: 'flex',
          justifyContent: 'flex-end',
          marginBottom: 10,
          gap: 8,
        }}
      >
        {!selectMode ? (
          <button
            type="button"
            onClick={() => setSelectMode(true)}
            style={{
              background: 'none',
              border: 'none',
              cursor: 'pointer',
              color: CONSULT.muted,
              fontSize: 12,
              letterSpacing: '0.04em',
            }}
          >
            选择
          </button>
        ) : (
          <button
            type="button"
            onClick={exitSelect}
            style={{
              background: 'none',
              border: 'none',
              cursor: 'pointer',
              color: CONSULT.muted,
              fontSize: 12,
            }}
          >
            取消
          </button>
        )}
      </div>

      <ul
        style={{
          listStyle: 'none',
          margin: 0,
          padding: 0,
          display: 'flex',
          flexDirection: 'column',
          gap: 12,
        }}
      >
        {items.map((s) => {
          const artifact: Artifact = {
            id: s.artifactId,
            name: s.name,
            content: s.content,
            mimeType: s.mimeType,
          };
          const checked = selected.has(s.id);
          return (
            <li key={s.id} style={{ position: 'relative' }}>
              {selectMode && (
                <button
                  type="button"
                  onClick={() => toggle(s.id)}
                  style={{
                    position: 'absolute',
                    top: 10,
                    left: 10,
                    zIndex: 2,
                    width: 20,
                    height: 20,
                    borderRadius: 5,
                    border: `1.5px solid ${
                      checked ? CONSULT.accent : CONSULT.borderStrong
                    }`,
                    background: checked ? CONSULT.accent : 'rgba(255,255,255,0.9)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    color: '#fff',
                    cursor: 'pointer',
                    padding: 0,
                  }}
                  aria-label={checked ? '取消选择' : '选择'}
                >
                  {checked && <Check size={12} strokeWidth={2.5} />}
                </button>
              )}
              <div
                style={{
                  opacity: selectMode && !checked ? 0.72 : 1,
                  paddingLeft: selectMode ? 8 : 0,
                }}
              >
                <ArtifactCard artifact={artifact} hideCollect />
              </div>
              {!selectMode && (
                <button
                  type="button"
                  onClick={() => onRemove(s.id)}
                  style={{
                    position: 'absolute',
                    top: 8,
                    right: 8,
                    background: 'rgba(255,255,255,0.9)',
                    border: `1px solid ${CONSULT.border}`,
                    borderRadius: 6,
                    width: 28,
                    height: 28,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    color: CONSULT.muted,
                    cursor: 'pointer',
                  }}
                  aria-label="移出合集"
                  title="移出合集"
                >
                  <Trash2 size={12} />
                </button>
              )}
            </li>
          );
        })}
      </ul>

      {selectMode && (
        <div
          style={{
            position: 'sticky',
            bottom: 0,
            marginTop: 16,
            padding: '12px 0 calc(8px + env(safe-area-inset-bottom, 0px))',
            background:
              'linear-gradient(to top, rgba(255,255,255,0.96) 70%, transparent)',
            display: 'flex',
            flexDirection: 'column',
            gap: 8,
          }}
        >
          <button
            type="button"
            onClick={() =>
              setSelected(allSelected ? new Set() : new Set(items.map((s) => s.id)))
            }
            style={{
              background: 'none',
              border: 'none',
              cursor: 'pointer',
              color: CONSULT.muted,
              fontSize: 12,
            }}
          >
            {allSelected ? '取消全选' : `全选（${items.length}）`}
          </button>
          <div style={{ display: 'flex', gap: 8 }}>
            <button
              type="button"
              disabled={selected.size === 0 || busy}
              onClick={() => void handleDownloadSelected()}
              style={{
                flex: 1,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 6,
                border: 'none',
                borderRadius: 10,
                padding: '10px',
                fontSize: 12.5,
                cursor: selected.size === 0 || busy ? 'default' : 'pointer',
                opacity: selected.size === 0 || busy ? 0.4 : 1,
                background: 'rgba(205, 210, 235, 0.45)',
                color: CONSULT.text,
              }}
            >
              <Download size={14} />
              下载{selected.size > 0 ? ` ${selected.size}` : ''}
            </button>
            <button
              type="button"
              disabled={selected.size === 0 || busy}
              onClick={() => void handleRemoveSelected()}
              style={{
                flex: 1,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 6,
                border: 'none',
                borderRadius: 10,
                padding: '10px',
                fontSize: 12.5,
                cursor: selected.size === 0 || busy ? 'default' : 'pointer',
                opacity: selected.size === 0 || busy ? 0.4 : 1,
                background: 'rgba(244, 220, 224, 0.65)',
                color: '#b44a5a',
              }}
            >
              <Trash2 size={14} />
              移出{selected.size > 0 ? ` ${selected.size}` : ''}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function CreateCollectionModal({
  name,
  onChange,
  onClose,
  onConfirm,
}: {
  name: string;
  onChange: (v: string) => void;
  onClose: () => void;
  onConfirm: () => void;
}) {
  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 400,
        background: 'rgba(40, 28, 55, 0.28)',
        backdropFilter: 'blur(2px)',
        display: 'flex',
        alignItems: 'flex-end',
        justifyContent: 'center',
      }}
      onClick={onClose}
      role="presentation"
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          width: '100%',
          maxWidth: 420,
          background: CONSULT.surfaceSolid,
          borderRadius: '16px 16px 0 0',
          padding: '20px 18px calc(20px + env(safe-area-inset-bottom, 0px))',
          boxShadow: '0 -8px 32px rgba(74, 58, 106, 0.12)',
        }}
        role="dialog"
        aria-label="新建合集"
      >
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            marginBottom: 14,
          }}
        >
          <div
            style={{
              fontFamily: CONSULT.fontDisplay,
              fontSize: 18,
              letterSpacing: '0.1em',
              color: CONSULT.accent,
            }}
          >
            新建合集
          </div>
          <button
            type="button"
            onClick={onClose}
            style={{
              background: 'none',
              border: 'none',
              cursor: 'pointer',
              color: CONSULT.muted,
              padding: 4,
            }}
          >
            <X size={16} />
          </button>
        </div>
        <input
          autoFocus
          value={name}
          onChange={(e) => onChange(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') onConfirm();
          }}
          placeholder="例如：本周梦境 / 移情笔记"
          style={{
            width: '100%',
            boxSizing: 'border-box',
            background: CONSULT.bg,
            border: `1px solid ${CONSULT.borderStrong}`,
            borderRadius: 8,
            padding: '11px 12px',
            fontSize: 14,
            color: CONSULT.text,
            outline: 'none',
            marginBottom: 14,
          }}
        />
        <button
          type="button"
          onClick={onConfirm}
          disabled={!name.trim()}
          style={{
            width: '100%',
            background: name.trim() ? CONSULT.accent : CONSULT.accentSoft,
            color: name.trim() ? '#faf8fc' : CONSULT.muted,
            border: 'none',
            borderRadius: 8,
            padding: '12px',
            fontSize: 13,
            letterSpacing: '0.1em',
            cursor: name.trim() ? 'pointer' : 'default',
          }}
        >
          创建
        </button>
      </div>
    </div>
  );
}
