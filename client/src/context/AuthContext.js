import React, { createContext, useContext, useState, useEffect } from 'react';
import axios from 'axios';

const AuthContext = createContext();

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [token, setToken] = useState(localStorage.getItem('mrs_token') || null);
  const [loading, setLoading] = useState(true);
  const [awsStatus, setAwsStatus] = useState(null);
  const [isAuthModalOpen, setIsAuthModalOpen] = useState(false);
  const [authModalTab, setAuthModalTab] = useState('demo'); // 'demo' | 'login' | 'register'

  // Configure Axios default auth header whenever token changes
  useEffect(() => {
    if (token) {
      axios.defaults.headers.common['Authorization'] = `Bearer ${token}`;
      localStorage.setItem('mrs_token', token);
    } else {
      delete axios.defaults.headers.common['Authorization'];
      localStorage.removeItem('mrs_token');
    }
  }, [token]);

  // Fetch AWS Status & current user on initial load
  useEffect(() => {
    let isMounted = true;

    async function initAuth() {
      // 1. Fetch AWS cloud status
      try {
        const awsRes = await axios.get('/api/aws/status');
        if (isMounted && awsRes.data) {
          setAwsStatus(awsRes.data);
        }
      } catch (err) {
        console.error('Failed to fetch AWS status:', err);
      }

      // 2. Fetch logged in user if token exists
      const savedToken = localStorage.getItem('mrs_token');
      if (savedToken) {
        try {
          axios.defaults.headers.common['Authorization'] = `Bearer ${savedToken}`;
          const res = await axios.get('/api/auth/me');
          if (isMounted && res.data && res.data.user) {
            setUser(res.data.user);
          }
        } catch (err) {
          console.warn('Session expired or invalid token:', err);
          if (isMounted) {
            setToken(null);
            setUser(null);
            localStorage.removeItem('mrs_token');
          }
        }
      }

      if (isMounted) {
        setLoading(false);
      }
    }

    initAuth();

    return () => {
      isMounted = false;
    };
  }, []);

  const login = async (identifier, password) => {
    const res = await axios.post('/api/auth/login', { identifier, password });
    if (res.data && res.data.token) {
      setToken(res.data.token);
      setUser(res.data.user);
      setIsAuthModalOpen(false);
      return res.data.user;
    }
    throw new Error(res.data?.error || 'Login failed');
  };

  const register = async (userData) => {
    const res = await axios.post('/api/auth/register', userData);
    if (res.data && res.data.token) {
      setToken(res.data.token);
      setUser(res.data.user);
      setIsAuthModalOpen(false);
      return res.data.user;
    }
    throw new Error(res.data?.error || 'Registration failed');
  };

  const loginDemo = async () => {
    const res = await axios.post('/api/auth/demo-login');
    if (res.data && res.data.token) {
      setToken(res.data.token);
      setUser(res.data.user);
      setIsAuthModalOpen(false);
      return res.data.user;
    }
    throw new Error('Demo login failed');
  };

  const logout = () => {
    setToken(null);
    setUser(null);
    localStorage.removeItem('mrs_token');
    delete axios.defaults.headers.common['Authorization'];
  };

  const updateProfile = async (profileData) => {
    const res = await axios.put('/api/user/profile', profileData);
    if (res.data && res.data.user) {
      setUser(res.data.user);
      return res.data.user;
    }
    throw new Error('Failed to update profile');
  };

  const refreshAwsStatus = async () => {
    try {
      const res = await axios.get('/api/aws/status');
      if (res.data) setAwsStatus(res.data);
      return res.data;
    } catch (e) {
      console.error('AWS status refresh failed', e);
    }
  };

  const openAuthModal = (tab = 'login') => {
    setAuthModalTab(tab);
    setIsAuthModalOpen(true);
  };

  const closeAuthModal = () => {
    setIsAuthModalOpen(false);
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        token,
        loading,
        isAuthenticated: !!user,
        awsStatus,
        login,
        register,
        loginDemo,
        logout,
        updateProfile,
        refreshAwsStatus,
        isAuthModalOpen,
        authModalTab,
        openAuthModal,
        closeAuthModal,
        setAuthModalTab,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => useContext(AuthContext);
export default AuthContext;
