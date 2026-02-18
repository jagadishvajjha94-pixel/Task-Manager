import React, { createContext, useContext, useState, useEffect } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';

const USER_KEY = '@rcetask_user';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      try {
        const raw = await AsyncStorage.getItem(USER_KEY);
        if (raw) {
          const u = JSON.parse(raw);
          if (u && u.id && u.role) setUser(u);
        }
      } catch (_) {}
      setLoading(false);
    })();
  }, []);

  const signIn = async (u) => {
    setUser(u);
    await AsyncStorage.setItem(USER_KEY, JSON.stringify(u));
  };

  const signOut = async () => {
    setUser(null);
    await AsyncStorage.removeItem(USER_KEY);
  };

  return (
    <AuthContext.Provider value={{ user, loading, signIn, signOut }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
