export const preferenceKey = 'linguista-plugin-settings-v1';
export const defaultPreferences = Object.freeze({ aiEnabled: true, theme: 'auto', browser: 'plugin', sidebar: true });
export function normalizePreferences(value, legacyTheme) {
  const input = value && typeof value === 'object' ? value : {};
  return {
    aiEnabled: typeof input.aiEnabled === 'boolean' ? input.aiEnabled : true,
    theme: ['auto', 'light', 'dark'].includes(input.theme) ? input.theme : ['light', 'dark'].includes(legacyTheme) ? legacyTheme : 'auto',
    browser: ['plugin', 'system'].includes(input.browser) ? input.browser : 'plugin',
    sidebar: typeof input.sidebar === 'boolean' ? input.sidebar : true,
  };
}
