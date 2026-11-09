import { fileURLToPath } from 'node:url';
import { createHandler } from './http.mjs';
import { readingSkillProvider } from './skills.mjs';
import { createReaderContext } from './reader-context.mjs';

export const name = 'linguista';
export const inject = ['webServer', 'skills', 'systemPrompt'];

export function apply(ctx) {
  const directory = fileURLToPath(new URL('../web/', import.meta.url));
  const reading = createReaderContext();
  ctx.effect(() => ctx.webServer.register({
    kind: 'prefix', path: '/linguista', handler: createHandler(directory, { reading }),
  }));
  ctx.effect(() => ctx.skills.registerProvider(readingSkillProvider));
  ctx.effect(() => ctx.systemPrompt.section({ name: 'linguista-reading-skill', order: 650, interpolate: false, text: reading.instructions }));
  ctx.effect(() => ctx.systemPrompt.context({ name: 'linguista-reading-material', order: 650, interpolate: false, required: true, text: reading.material }));
}
