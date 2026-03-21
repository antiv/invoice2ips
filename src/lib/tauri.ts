import { getCurrentWindow } from '@tauri-apps/api/window';

/**
 * Checks if the application is running within a Tauri environment.
 */
export const isTauri = (): boolean => {
  return typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window;
};

/**
 * Minimizes the current window if running in Tauri.
 */
export const minimizeWindow = async () => {
  if (isTauri()) {
    const window = getCurrentWindow();
    await window.minimize();
  }
};

/**
 * Maximizes or restores the current window if running in Tauri.
 */
export const toggleMaximize = async () => {
  if (isTauri()) {
    const window = getCurrentWindow();
    await window.toggleMaximize();
  }
};

/**
 * Closes the current window if running in Tauri.
 */
export const closeWindow = async () => {
  if (isTauri()) {
    const window = getCurrentWindow();
    await window.close();
  }
};
