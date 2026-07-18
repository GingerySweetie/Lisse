import { db, getSettings, saveSettings } from '../db';
import type { AppSettings, Endpoint, Persona, WritingStyle } from '../types';
import { downloadText } from './export';

/** Settings fields restored with a config bundle so defaults land in the right UI. */
export type ConfigSettingsSlice = Pick<
  AppSettings,
  'defaultEndpointId' | 'defaultModel' | 'defaultPersonaId' | 'defaultStyleId'
>;

export interface ConfigBundle {
  __lisse: 'config';
  version: 1;
  exportedAt: number;
  endpoints?: Endpoint[];
  personas?: Persona[];
  writingStyles?: WritingStyle[];
  settings?: ConfigSettingsSlice;
}

export interface ConfigExportOptions {
  includeEndpoints?: boolean;
  includePersonas?: boolean;
  includeWritingStyles?: boolean;
  /** Restore default endpoint / persona / style ids on import. */
  includeDefaults?: boolean;
}

export interface ImportConfigResult {
  endpointsAdded: number;
  personasAdded: number;
  writingStylesAdded: number;
  settingsApplied: boolean;
}

function pickDefaults(settings: AppSettings): ConfigSettingsSlice {
  return {
    defaultEndpointId: settings.defaultEndpointId,
    defaultModel: settings.defaultModel,
    defaultPersonaId: settings.defaultPersonaId,
    defaultStyleId: settings.defaultStyleId,
  };
}

export async function exportConfigBundle(
  opts: ConfigExportOptions,
): Promise<{ content: string; filename: string; mime: string }> {
  const includeEndpoints = !!opts.includeEndpoints;
  const includePersonas = !!opts.includePersonas;
  const includeWritingStyles = !!opts.includeWritingStyles;
  const includeDefaults = !!opts.includeDefaults;

  if (
    !includeEndpoints &&
    !includePersonas &&
    !includeWritingStyles &&
    !includeDefaults
  ) {
    throw new Error('请至少勾选一项再导出');
  }

  const [endpoints, personas, writingStyles, settings] = await Promise.all([
    includeEndpoints ? db.endpoints.toArray() : Promise.resolve(undefined),
    includePersonas ? db.personas.toArray() : Promise.resolve(undefined),
    includeWritingStyles
      ? db.writingStyles.toArray()
      : Promise.resolve(undefined),
    includeDefaults ? getSettings() : Promise.resolve(undefined),
  ]);

  const exportedAt = Date.now();
  const bundle: ConfigBundle = {
    __lisse: 'config',
    version: 1,
    exportedAt,
    ...(endpoints ? { endpoints } : {}),
    ...(personas ? { personas } : {}),
    ...(writingStyles ? { writingStyles } : {}),
    ...(settings ? { settings: pickDefaults(settings) } : {}),
  };

  const parts: string[] = [];
  if (includePersonas) parts.push('personas');
  if (includeWritingStyles) parts.push('styles');
  if (includeEndpoints) parts.push('endpoints');
  if (includeDefaults) parts.push('defaults');
  const tag = parts.join('-') || 'config';

  return {
    content: JSON.stringify(bundle, null, 2),
    filename: `lisse-config-${tag}-${formatDateTag(exportedAt)}.json`,
    mime: 'application/json;charset=utf-8',
  };
}

export async function downloadConfigBundle(
  opts: ConfigExportOptions,
): Promise<void> {
  const r = await exportConfigBundle(opts);
  await downloadText(r.content, r.filename, r.mime);
}

export async function importConfigBundle(
  fileText: string,
  opts?: { mode?: 'merge' | 'replace' },
): Promise<ImportConfigResult> {
  let raw: unknown;
  try {
    raw = JSON.parse(fileText);
  } catch (err) {
    throw new Error(
      `不是合法 JSON：${err instanceof Error ? err.message : String(err)}`,
      { cause: err },
    );
  }
  if (
    !raw ||
    typeof raw !== 'object' ||
    (raw as Record<string, unknown>).__lisse !== 'config'
  ) {
    throw new Error(
      '不是 Lisse/Wisteria 的配置导出文件（找不到 __lisse: "config" 字段）',
    );
  }

  const bundle = raw as ConfigBundle;
  const mode = opts?.mode ?? 'merge';
  const hasEndpoints = Array.isArray(bundle.endpoints);
  const hasPersonas = Array.isArray(bundle.personas);
  const hasStyles = Array.isArray(bundle.writingStyles);

  if (!hasEndpoints && !hasPersonas && !hasStyles && !bundle.settings) {
    throw new Error('配置文件为空：没有 endpoints / 人格 / 风格 / 默认设置');
  }

  if (mode === 'replace') {
    await db.transaction(
      'rw',
      [db.endpoints, db.personas, db.writingStyles],
      async () => {
        if (hasEndpoints) await db.endpoints.clear();
        if (hasPersonas) await db.personas.clear();
        if (hasStyles) await db.writingStyles.clear();
      },
    );
  }

  const result: ImportConfigResult = {
    endpointsAdded: 0,
    personasAdded: 0,
    writingStylesAdded: 0,
    settingsApplied: false,
  };

  await db.transaction(
    'rw',
    [db.endpoints, db.personas, db.writingStyles],
    async () => {
      if (hasEndpoints && bundle.endpoints?.length) {
        await db.endpoints.bulkPut(bundle.endpoints);
        result.endpointsAdded = bundle.endpoints.length;
      }
      if (hasPersonas && bundle.personas?.length) {
        await db.personas.bulkPut(bundle.personas);
        result.personasAdded = bundle.personas.length;
      }
      if (hasStyles && bundle.writingStyles?.length) {
        await db.writingStyles.bulkPut(bundle.writingStyles);
        result.writingStylesAdded = bundle.writingStyles.length;
      }
    },
  );

  if (bundle.settings) {
    const patch: Partial<AppSettings> = {};
    if ('defaultEndpointId' in bundle.settings) {
      patch.defaultEndpointId = bundle.settings.defaultEndpointId ?? null;
    }
    if ('defaultModel' in bundle.settings) {
      patch.defaultModel = bundle.settings.defaultModel ?? null;
    }
    if ('defaultPersonaId' in bundle.settings) {
      patch.defaultPersonaId = bundle.settings.defaultPersonaId ?? null;
    }
    if ('defaultStyleId' in bundle.settings) {
      patch.defaultStyleId = bundle.settings.defaultStyleId ?? null;
    }
    if (Object.keys(patch).length > 0) {
      await saveSettings(patch);
      result.settingsApplied = true;
    }
  }

  return result;
}

function formatDateTag(ts: number): string {
  const d = new Date(ts);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}`;
}
