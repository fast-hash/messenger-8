import { create } from 'zustand';
import * as authApi from '../api/authApi';
import * as usersApi from '../api/usersApi';

export const useAuthStore = create((set) => ({
  user: null,
  loading: true,
  dndEnabled: false,
  dndUntil: null,
  async fetchCurrentUser() {
    try {
      const { user } = await usersApi.currentUser();
      set({ user, loading: false, dndEnabled: user.dndEnabled || false, dndUntil: user.dndUntil || null });
    } catch (error) {
      set({ user: null, loading: false, dndEnabled: false, dndUntil: null });
    }
  },
  async login(credentials) {
    const { user } = await authApi.login(credentials);
    set({ user, dndEnabled: user.dndEnabled || false, dndUntil: user.dndUntil || null });
  },
  async register(payload) {
    const { user } = await authApi.register(payload);
    set({ user, dndEnabled: user.dndEnabled || false, dndUntil: user.dndUntil || null });
  },
  async logout() {
    await authApi.logout();
    set({ user: null, dndEnabled: false, dndUntil: null });
  },
  async updatePreferences(preferences) {
    const { user } = await usersApi.updatePreferences(preferences);
    set({ user, dndEnabled: user.dndEnabled || false, dndUntil: user.dndUntil || null });
  },
}));
