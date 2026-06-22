// Each theme defines all CSS custom properties applied to :root
export const themes = {
  'nachtblau': {
    label: 'Nachtblau', dark: true,
    bg: '#0f1923', sidebarBg: '#131e2b', panelBg: '#1a2638',
    border: '#243447', accent: '#4a9eff', accentDim: '#1a3a6a',
    text: '#d8e4f0', muted: '#5a7080', hover: '#1e3048',
    success: '#2ecc71', danger: '#e74c3c', inputBg: '#0a111a',
  },
  'mitternacht': {
    label: 'Mitternacht', dark: true,
    bg: '#080b0f', sidebarBg: '#0d1117', panelBg: '#161b22',
    border: '#21262d', accent: '#58a6ff', accentDim: '#1a2d4a',
    text: '#e6edf3', muted: '#484f58', hover: '#1c2128',
    success: '#3fb950', danger: '#f85149', inputBg: '#040608',
  },
  'dracula': {
    label: 'Dracula', dark: true,
    bg: '#1e1f29', sidebarBg: '#21222c', panelBg: '#282a36',
    border: '#44475a', accent: '#bd93f9', accentDim: '#3d2568',
    text: '#f8f8f2', muted: '#6272a4', hover: '#373a4d',
    success: '#50fa7b', danger: '#ff5555', inputBg: '#181921',
  },
  'nord': {
    label: 'Nord', dark: true,
    bg: '#242933', sidebarBg: '#2e3440', panelBg: '#3b4252',
    border: '#434c5e', accent: '#88c0d0', accentDim: '#1e3a44',
    text: '#eceff4', muted: '#616e88', hover: '#303847',
    success: '#a3be8c', danger: '#bf616a', inputBg: '#1e2430',
  },
  'gruvbox': {
    label: 'Gruvbox', dark: true,
    bg: '#1d2021', sidebarBg: '#282828', panelBg: '#32302f',
    border: '#504945', accent: '#fabd2f', accentDim: '#3c3000',
    text: '#ebdbb2', muted: '#928374', hover: '#3c3836',
    success: '#b8bb26', danger: '#fb4934', inputBg: '#161819',
  },
  'tokyo-night': {
    label: 'Tokyo Night', dark: true,
    bg: '#1a1b2e', sidebarBg: '#16213e', panelBg: '#0f3460',
    border: '#1f3a70', accent: '#e94560', accentDim: '#3a0a1a',
    text: '#a8d8ea', muted: '#4a7090', hover: '#1a3a6a',
    success: '#9ece6a', danger: '#f7768e', inputBg: '#10111e',
  },
  'catppuccin-mocha': {
    label: 'Catppuccin', dark: true,
    bg: '#1e1e2e', sidebarBg: '#181825', panelBg: '#313244',
    border: '#45475a', accent: '#cba6f7', accentDim: '#3a2060',
    text: '#cdd6f4', muted: '#585b70', hover: '#2a2a3e',
    success: '#a6e3a1', danger: '#f38ba8', inputBg: '#11111b',
  },
  'one-dark': {
    label: 'One Dark', dark: true,
    bg: '#1e2127', sidebarBg: '#21252b', panelBg: '#282c34',
    border: '#3e4451', accent: '#61afef', accentDim: '#1a3050',
    text: '#abb2bf', muted: '#5c6370', hover: '#2c313c',
    success: '#98c379', danger: '#e06c75', inputBg: '#181a1f',
  },
  'solarized-dark': {
    label: 'Solarized Dunkel', dark: true,
    bg: '#00212b', sidebarBg: '#002b36', panelBg: '#073642',
    border: '#0a4555', accent: '#268bd2', accentDim: '#083050',
    text: '#93a1a1', muted: '#586e75', hover: '#073642',
    success: '#859900', danger: '#dc322f', inputBg: '#001018',
  },
  'matrix': {
    label: 'Matrix', dark: true,
    bg: '#000a00', sidebarBg: '#001500', panelBg: '#002200',
    border: '#003a00', accent: '#00ff41', accentDim: '#003000',
    text: '#00cc33', muted: '#006600', hover: '#002800',
    success: '#00ff41', danger: '#ff2200', inputBg: '#000500',
  },
  'bernstein': {
    label: 'Bernstein', dark: true,
    bg: '#0a0700', sidebarBg: '#140d00', panelBg: '#1e1500',
    border: '#3a2800', accent: '#ffaa00', accentDim: '#382000',
    text: '#ffd070', muted: '#7a5800', hover: '#2a1c00',
    success: '#80ff00', danger: '#ff3300', inputBg: '#060400',
  },
  'cyberpunk': {
    label: 'Cyberpunk', dark: true,
    bg: '#080010', sidebarBg: '#10001e', panelBg: '#18002e',
    border: '#380055', accent: '#ff0090', accentDim: '#3a0028',
    text: '#ffee00', muted: '#660066', hover: '#200040',
    success: '#00ff90', danger: '#ff2200', inputBg: '#040008',
  },
  'sonnenuntergang': {
    label: 'Sonnenuntergang', dark: true,
    bg: '#180a04', sidebarBg: '#251008', panelBg: '#351808',
    border: '#5a2a10', accent: '#ff6b35', accentDim: '#401808',
    text: '#ffe8d0', muted: '#8a5038', hover: '#401a08',
    success: '#88cc60', danger: '#ff3030', inputBg: '#100602',
  },
  'wald': {
    label: 'Wald', dark: true,
    bg: '#091208', sidebarBg: '#0e1a0c', panelBg: '#162210',
    border: '#2a4020', accent: '#5fb869', accentDim: '#183018',
    text: '#d0e8c0', muted: '#4a6a40', hover: '#1c2e18',
    success: '#70cc50', danger: '#cc4040', inputBg: '#060c05',
  },
  'lavendel': {
    label: 'Lavendel', dark: true,
    bg: '#0e0a18', sidebarBg: '#140f22', panelBg: '#1c1530',
    border: '#332650', accent: '#c084fc', accentDim: '#381860',
    text: '#ede9fe', muted: '#6a5a8a', hover: '#221838',
    success: '#86efac', danger: '#f87171', inputBg: '#08060f',
  },
  'papier': {
    label: 'Papier', dark: false,
    bg: '#f8f9fa', sidebarBg: '#f0f2f5', panelBg: '#ffffff',
    border: '#dee2e6', accent: '#2563eb', accentDim: '#dbeafe',
    text: '#1a1a2e', muted: '#6c757d', hover: '#e9ecef',
    success: '#198754', danger: '#dc3545', inputBg: '#ffffff',
  },
  'sandstein': {
    label: 'Sandstein', dark: false,
    bg: '#f5f0e8', sidebarBg: '#ede5d8', panelBg: '#faf7f2',
    border: '#c8b8a0', accent: '#8b6420', accentDim: '#edd8a0',
    text: '#2a1e10', muted: '#7a6850', hover: '#e8e0d0',
    success: '#4a7c4e', danger: '#b53a2a', inputBg: '#faf7f2',
  },
  'solarized-light': {
    label: 'Solarized Hell', dark: false,
    bg: '#fdf6e3', sidebarBg: '#eee8d5', panelBg: '#fffcf0',
    border: '#ccc4a0', accent: '#268bd2', accentDim: '#c0d8f0',
    text: '#586e75', muted: '#93a1a1', hover: '#e8e0cc',
    success: '#859900', danger: '#dc322f', inputBg: '#fffcf0',
  },
  'github-light': {
    label: 'GitHub Hell', dark: false,
    bg: '#ffffff', sidebarBg: '#f6f8fa', panelBg: '#ffffff',
    border: '#d0d7de', accent: '#0969da', accentDim: '#ddf4ff',
    text: '#1f2328', muted: '#656d76', hover: '#f3f4f6',
    success: '#1a7f37', danger: '#cf222e', inputBg: '#f6f8fa',
  },
  'catppuccin-latte': {
    label: 'Catppuccin Latte', dark: false,
    bg: '#eff1f5', sidebarBg: '#e6e9ef', panelBg: '#ffffff',
    border: '#bcc0cc', accent: '#7287fd', accentDim: '#e0e4fc',
    text: '#4c4f69', muted: '#8c8fa1', hover: '#dce0e8',
    success: '#40a02b', danger: '#d20f39', inputBg: '#ffffff',
  },
};

export const themeNames = Object.keys(themes);
export const defaultTheme = 'nachtblau';

export function applyTheme(name) {
  const t = themes[name] || themes[defaultTheme];
  const r = document.documentElement;
  r.style.setProperty('--bg',          t.bg);
  r.style.setProperty('--sidebar-bg',  t.sidebarBg);
  r.style.setProperty('--panel-bg',    t.panelBg);
  r.style.setProperty('--border',      t.border);
  r.style.setProperty('--accent',      t.accent);
  r.style.setProperty('--accent-dim',  t.accentDim);
  r.style.setProperty('--text',        t.text);
  r.style.setProperty('--muted',       t.muted);
  r.style.setProperty('--hover',       t.hover);
  r.style.setProperty('--success',     t.success);
  r.style.setProperty('--danger',      t.danger);
  r.style.setProperty('--input-bg',    t.inputBg);
  // Force dark/light color-scheme so browser inputs follow the theme
  r.style.setProperty('color-scheme',  t.dark ? 'dark' : 'light');
  document.documentElement.setAttribute('data-theme', t.dark ? 'dark' : 'light');
  localStorage.setItem('oberlicht-theme', name);
}
