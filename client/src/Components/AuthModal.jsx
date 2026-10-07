import React, { useState } from 'react';
import { useAuth } from '../context/AuthContext';

const AVAILABLE_GENRES = [
  'Action', 'Sci-Fi', 'Drama', 'Thriller', 'Comedy', 
  'Horror', 'Animation', 'Adventure', 'Romance', 'Mystery'
];

const AuthModal = () => {
  const {
    isAuthModalOpen,
    closeAuthModal,
    authModalTab,
    setAuthModalTab,
    login,
    register,
    loginDemo
  } = useAuth();

  // Form states
  const [identifier, setIdentifier] = useState('');
  const [password, setPassword] = useState('');
  const [username, setUsername] = useState('');
  const [email, setEmail] = useState('');
  const [fullName, setFullName] = useState('');
  const [selectedGenres, setSelectedGenres] = useState(['Action', 'Sci-Fi']);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  if (!isAuthModalOpen) return null;

  const toggleGenre = (genre) => {
    if (selectedGenres.includes(genre)) {
      if (selectedGenres.length > 1) {
        setSelectedGenres(selectedGenres.filter(g => g !== genre));
      }
    } else {
      setSelectedGenres([...selectedGenres, genre]);
    }
  };

  const handleLoginSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      await login(identifier, password);
    } catch (err) {
      setError(err.message || 'Login failed. Please check your credentials.');
    } finally {
      setLoading(false);
    }
  };

  const handleRegisterSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      await register({
        username,
        email,
        password,
        fullName: fullName || username,
        favoriteGenres: selectedGenres
      });
    } catch (err) {
      setError(err.message || 'Registration failed.');
    } finally {
      setLoading(false);
    }
  };

  const handleDemoClick = async () => {
    setError('');
    setLoading(true);
    try {
      await loginDemo();
    } catch (err) {
      setError('Demo login failed. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="auth-modal-backdrop" onClick={closeAuthModal}>
      <div className="auth-modal-container" onClick={(e) => e.stopPropagation()}>
        <button className="auth-modal-close" onClick={closeAuthModal} aria-label="Close modal">
          &times;
        </button>

        <div className="auth-modal-header">
          <div className="auth-modal-badge">
            <i className="fa fa-cloud" aria-hidden="true" style={{ marginRight: '6px' }}></i>
            AWS Powered Profile & Recommendations
          </div>
          <h3>Welcome to CineMatch</h3>
          <p>Create your custom cinephile profile, sync watchlists to DynamoDB, and get tailored AI recommendations.</p>
        </div>

        <div className="auth-modal-tabs">
          <button
            className={`auth-tab-btn ${authModalTab === 'demo' ? 'active' : ''}`}
            onClick={() => { setAuthModalTab('demo'); setError(''); }}
          >
            <i className="fa fa-bolt" aria-hidden="true"></i> 1-Click Demo
          </button>
          <button
            className={`auth-tab-btn ${authModalTab === 'login' ? 'active' : ''}`}
            onClick={() => { setAuthModalTab('login'); setError(''); }}
          >
            Sign In
          </button>
          <button
            className={`auth-tab-btn ${authModalTab === 'register' ? 'active' : ''}`}
            onClick={() => { setAuthModalTab('register'); setError(''); }}
          >
            New Profile
          </button>
        </div>

        {error && <div className="auth-error-banner">{error}</div>}

        {/* TAB 1: 1-CLICK DEMO USER */}
        {authModalTab === 'demo' && (
          <div className="auth-demo-section">
            <div className="demo-user-card">
              <img
                src="https://images.unsplash.com/photo-1534528741775-53994a69daeb?auto=format&fit=crop&w=400&q=80"
                alt="Alex Rivera"
                className="demo-avatar"
              />
              <div className="demo-info">
                <h4>Alex Rivera</h4>
                <p>Curated Cinephile Profile</p>
                <div className="demo-tags">
                  <span>Sci-Fi</span>
                  <span>Action</span>
                  <span>Thriller</span>
                </div>
              </div>
            </div>

            <ul className="demo-features-list">
              <li><i className="fa fa-check-circle"></i> Pre-loaded DynamoDB Watchlist (Inception, Interstellar, Dune)</li>
              <li><i className="fa fa-check-circle"></i> Pre-rated 10/10 Movies with custom reviews</li>
              <li><i className="fa fa-check-circle"></i> Instant personalized ML recommendations calculated on launch</li>
              <li><i className="fa fa-check-circle"></i> Test AWS S3 avatar upload & DynamoDB edits without typing</li>
            </ul>

            <button
              className="auth-primary-btn demo-launch-btn"
              onClick={handleDemoClick}
              disabled={loading}
            >
              {loading ? 'Launching Demo Profile...' : 'Instant Launch Demo Profile \u2192'}
            </button>
          </div>
        )}

        {/* TAB 2: SIGN IN */}
        {authModalTab === 'login' && (
          <form className="auth-form" onSubmit={handleLoginSubmit}>
            <div className="auth-input-group">
              <label>Username or Email</label>
              <input
                type="text"
                required
                value={identifier}
                onChange={(e) => setIdentifier(e.target.value)}
                placeholder="e.g. cinephile99 or user@example.com"
              />
            </div>

            <div className="auth-input-group">
              <label>Password</label>
              <input
                type="password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Enter your password"
              />
            </div>

            <button type="submit" className="auth-primary-btn" disabled={loading}>
              {loading ? 'Signing In...' : 'Sign In to Profile'}
            </button>

            <p className="auth-footer-prompt">
              Don't have a profile yet?{' '}
              <span onClick={() => setAuthModalTab('register')}>Create one now</span>
            </p>
          </form>
        )}

        {/* TAB 3: REGISTER */}
        {authModalTab === 'register' && (
          <form className="auth-form" onSubmit={handleRegisterSubmit}>
            <div className="auth-input-group">
              <label>Full Name</label>
              <input
                type="text"
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                placeholder="e.g. Jordan Miller"
              />
            </div>

            <div className="auth-input-group">
              <label>Username</label>
              <input
                type="text"
                required
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                placeholder="e.g. JordanCine"
              />
            </div>

            <div className="auth-input-group">
              <label>Email Address</label>
              <input
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="e.g. jordan@example.com"
              />
            </div>

            <div className="auth-input-group">
              <label>Password</label>
              <input
                type="password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Create a secure password"
              />
            </div>

            <div className="auth-input-group">
              <label>Select Your Favorite Genres (Feeds AI Recommendations)</label>
              <div className="genre-pill-selector">
                {AVAILABLE_GENRES.map((g) => {
                  const selected = selectedGenres.includes(g);
                  return (
                    <button
                      type="button"
                      key={g}
                      className={`genre-pill ${selected ? 'selected' : ''}`}
                      onClick={() => toggleGenre(g)}
                    >
                      {g} {selected ? '\u2713' : '+'}
                    </button>
                  );
                })}
              </div>
            </div>

            <button type="submit" className="auth-primary-btn" disabled={loading}>
              {loading ? 'Creating AWS Profile...' : 'Create Profile & Sync to AWS'}
            </button>

            <p className="auth-footer-prompt">
              Already have an account?{' '}
              <span onClick={() => setAuthModalTab('login')}>Sign In</span>
            </p>
          </form>
        )}
      </div>
    </div>
  );
};

export default AuthModal;
