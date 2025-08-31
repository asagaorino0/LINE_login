// Simple authentication system for demo purposes
export interface User {
  id: string;
  email: string;
  name?: string;
}

// Check if user is authenticated (simple localStorage check)
export const isAuthenticated = (): boolean => {
  if (typeof window === 'undefined') return false;
  return localStorage.getItem('auth_user') !== null;
};

// Get current user
export const getCurrentUser = (): User | null => {
  if (typeof window === 'undefined') return null;
  const userData = localStorage.getItem('auth_user');
  return userData ? JSON.parse(userData) : null;
};

// Sign in user
export const signIn = (email: string): User => {
  const user: User = {
    id: Math.random().toString(36).substr(2, 9),
    email,
    name: email.split('@')[0]
  };
  localStorage.setItem('auth_user', JSON.stringify(user));
  return user;
};

// Sign out user
export const signOut = (): void => {
  localStorage.removeItem('auth_user');
  window.location.href = '/';
};

// Custom hook for authentication
export const useAuth = () => {
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const checkAuth = () => {
      const currentUser = getCurrentUser();
      setUser(currentUser);
      setIsLoading(false);
    };

    checkAuth();

    // Listen for storage changes (for multiple tabs)
    const handleStorageChange = (e: StorageEvent) => {
      if (e.key === 'auth_user') {
        checkAuth();
      }
    };

    window.addEventListener('storage', handleStorageChange);
    return () => window.removeEventListener('storage', handleStorageChange);
  }, []);

  return {
    user,
    isLoading,
    isAuthenticated: user !== null
  };
};

import { useState, useEffect } from 'react';