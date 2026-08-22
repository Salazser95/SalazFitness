import { create } from 'zustand'
import { hasSession, login as apiLogin, logout as apiLogout } from './api'

type AuthState = {
  authenticated: boolean
  username: string | null
  loading: boolean
  error: string | null
  signIn: (username: string, password: string) => Promise<boolean>
  signOut: () => void
  expire: () => void
}

export const useAuth = create<AuthState>((set) => ({
  authenticated: hasSession(),
  username: localStorage.getItem('salaz.username'),
  loading: false,
  error: null,

  signIn: async (username, password) => {
    set({ loading: true, error: null })
    try {
      const res = await apiLogin(username, password)
      localStorage.setItem('salaz.username', res.username)
      set({ authenticated: true, username: res.username, loading: false })
      return true
    } catch (e) {
      set({
        loading: false,
        error: e instanceof Error ? e.message : 'No se ha podido entrar',
      })
      return false
    }
  },

  signOut: () => {
    apiLogout()
    localStorage.removeItem('salaz.username')
    set({ authenticated: false, username: null })
  },

  expire: () => {
    localStorage.removeItem('salaz.username')
    set({ authenticated: false, username: null, error: 'La sesion ha caducado' })
  },
}))
