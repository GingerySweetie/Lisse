import { afterkiss } from '../afterkiss';
import { getSettings } from '../../db';
import type { Tool, ToolContext } from './index';

/**
 * Toy (AfterKiss / 触手) tools — expose channel intensity control to the
 * chat model when the user has "启动玩具" turned on in chat settings.
 *
 * Channels are 0–100: thrust (抽插), vibe (棒身震动), clit (阴蒂).
 */

export async function toyTools(_: ToolContext): Promise<Tool[]> {
  const settings = await getSettings();
  if (!settings.toyControlEnabled) return [];
  return [controlToyTool()];
}

function controlToyTool(): Tool {
  return {
    def: {
      name: 'control_toy',
      description:
        '控制已启动的玩具（AfterKiss）三路力度。数值 0–100；省略的通道保持当前值。stop=true 时三路归零。适合根据对话氛围主动调节；不要每句都狂调，有感觉变化时再用。',
      parameters: {
        type: 'object',
        properties: {
          thrust: {
            type: 'number',
            description: '抽插力度 0–100。省略则保持当前。',
          },
          vibe: {
            type: 'number',
            description: '棒身震动 0–100。省略则保持当前。',
          },
          clit: {
            type: 'number',
            description: '阴蒂刺激 0–100。省略则保持当前。',
          },
          stop: {
            type: 'boolean',
            description: 'true 时急停：三路全部归零。',
          },
        },
      },
    },
    handler: async (input: unknown) => {
      const args = (input ?? {}) as {
        thrust?: number;
        vibe?: number;
        clit?: number;
        stop?: boolean;
      };

      if (args.stop) {
        await afterkiss.emergencyStop();
        const ch = afterkiss.getChannels();
        return { ok: true, stopped: true, ...ch };
      }

      const cur = afterkiss.getChannels();
      const thrust =
        typeof args.thrust === 'number' && Number.isFinite(args.thrust)
          ? args.thrust
          : cur.thrust;
      const vibe =
        typeof args.vibe === 'number' && Number.isFinite(args.vibe)
          ? args.vibe
          : cur.vibe;
      const clit =
        typeof args.clit === 'number' && Number.isFinite(args.clit)
          ? args.clit
          : cur.clit;

      if (!afterkiss.getState().connected) {
        // Still update local channel state so the message indicator reflects
        // intent; the write is a no-op until the device reconnects.
        afterkiss.rememberChannels(thrust, vibe, clit);
        return {
          ok: false,
          error: '玩具未连接。力度已记住，连接后请手动发送或再调一次。',
          thrust,
          vibe,
          clit,
          connected: false,
        };
      }

      await afterkiss.setChannels(thrust, vibe, clit);
      return { ok: true, thrust, vibe, clit, connected: true };
    },
  };
}
