import { readFile } from 'node:fs/promises';
import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { skills } from './reader-ai.js';

export function readingSkillProvider() {
  const name = 'dsh-linguista';
  const definitions = skills.map(({ name: skillName, description }) => {
    const path = fileURLToPath(new URL('../skills/' + skillName + '/SKILL.md', import.meta.url));
    return { name: skillName, description, path, provider: name, source: 'bundled',
      invocation: { userInvocable: true, modelInvocable: true }, resourceBase: { kind: 'directory', path: dirname(path) } };
  });
  return {
    name,
    list: async () => definitions.map(skill => ({ ...skill, rank: 600, locator: skill.name })),
    async get(selected, options) {
      const skill = definitions.find(item => item.name === selected.name);
      if (!skill) throw Error('未知的 Linguista 阅读技能。');
      const raw = await readFile(skill.path, { encoding: 'utf8', signal: options?.signal });
      return { ...skill, content: raw.replace(/^---\r?\n[\s\S]*?\r?\n---\s*/, '') };
    },
  };
}
