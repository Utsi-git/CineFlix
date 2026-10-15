import React, { useState, useEffect, useRef } from 'react';
import { Link, useHistory } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import axios from '../services/api';
import movie_list from "../movies_list";

const OMDB_BASE_URL = "https://www.omdbapi.com/";
const OMDB_API_KEY = process.env.REACT_APP_OMDB_API_KEY || process.env.REACT_APP_API_KEY;

const Navbar = () => {
  const { user, isAuthenticated, logout, openAuthModal, loginDemo, awsStatus } = useAuth();
  const [dropdownOpen, setDropdownOpen] = useState(false);
  
  // Search state
  const [searchQuery, setSearchQuery] = useState('');
  const [searchFocused, setSearchFocused] = useState(false);
  const [suggestions, setSuggestions] = useState([]);
  const debounceTimer = useRef(null);
  
  const history = useHistory();

  useEffect(() => {
    if (!searchQuery || searchQuery.trim().length < 2) {
      setSuggestions([]);
      return;
    }

    const query = searchQuery.trim().toLowerCase();

    // 1. Local matches
    const localMatches = movie_list
      .filter((movie) => movie.toString().toLowerCase().includes(query))
      .slice(0, 4)
      .map(title => ({ Title: title, Year: "", Poster: "", Source: "local" }));

    setSuggestions(localMatches);

    // 2. Real-time OMDb API search with debounce
    if (debounceTimer.current) clearTimeout(debounceTimer.current);

    debounceTimer.current = setTimeout(async () => {
      try {
        const res = await axios.get(OMDB_BASE_URL, {
          params: { s: searchQuery.trim(), type: "movie", apikey: OMDB_API_KEY }
        });

        if (res.data && res.data.Response === "True" && res.data.Search) {
          const omdbMatches = res.data.Search.slice(0, 8).map(m => ({
            Title: m.Title,
            Year: m.Year,
            Poster: m.Poster && m.Poster !== "N/A" ? m.Poster : "",
            Source: "omdb"
          }));

          const seen = new Set();
          const merged = [];
          for (const item of [...omdbMatches, ...localMatches]) {
            const key = item.Title.toLowerCase();
            if (!seen.has(key)) {
              seen.add(key);
              merged.push(item);
            }
          }
          setSuggestions(merged.slice(0, 8));
        }
      } catch (err) {
        console.error("OMDb search autocomplete error:", err);
      }
    }, 250);

    return () => {
      if (debounceTimer.current) clearTimeout(debounceTimer.current);
    };
  }, [searchQuery]);

  const handleLogout = () => {
    logout();
    setDropdownOpen(false);
    history.push('/');
  };

  const handleSearch = (e) => {
    e.preventDefault();
    if (searchQuery.trim()) {
      history.push({ pathname: '/recommend', state: { MovieName: searchQuery.trim() } });
      setSearchQuery('');
      setSuggestions([]);
      setSearchFocused(false);
    }
  };
  
  const handleSelectSuggestion = (title) => {
    setSearchQuery('');
    setSuggestions([]);
    setSearchFocused(false);
    history.push({ pathname: '/recommend', state: { MovieName: title } });
  };

  const isAwsLive = awsStatus?.isLiveAWS;
  const fallbackThumb = "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='32' height='48' viewBox='0 0 32 48'%3E%3Crect width='32' height='48' fill='%23e2e8f0'/%3E%3C/svg%3E";

  return (
    <nav className="flix-navbar">
      <div className="flix-navbar-inner">

        {/* ── Logo ──────────────────────────────────────────── */}
        <Link className="flix-brand" to="/" id="nav-brand">
          <span className="flix-brand-icon">🎬</span>
          <span className="flix-brand-name">CineMatch<span className="flix-brand-ai"> AI</span></span>
        </Link>

        {/* ── Center Nav + Search ──────────────────────────── */}
        <div className="flix-nav-center">
          <div className={`flix-search-bar ${searchFocused ? 'focused' : ''}`}>
            <form onSubmit={handleSearch} className="flix-search-form">
              <input
                id="nav-search-input"
                type="text"
                placeholder="Search movies..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                onFocus={() => setSearchFocused(true)}
                onBlur={() => setTimeout(() => setSearchFocused(false), 200)}
                className="flix-search-input"
                autoComplete="off"
              />
              <button type="submit" className="flix-search-icon-btn" id="nav-search-btn" aria-label="Search">
                🔍
              </button>
            </form>
            
            {/* ── Autocomplete Dropdown ──────────────────────── */}
            {searchFocused && suggestions.length > 0 && (
              <div className="flix-search-autocomplete">
                {suggestions.map((item, index) => (
                  <button
                    key={index}
                    className="flix-autocomplete-item"
                    onMouseDown={(e) => {
                      e.preventDefault();
                      handleSelectSuggestion(item.Title);
                    }}
                  >
                    <div className="flix-autocomplete-left">
                      {item.Poster ? (
                        <img src={item.Poster} alt="" className="flix-autocomplete-thumb" onError={(e) => { e.target.onerror = null; e.target.src = fallbackThumb; }} />
                      ) : (
                        <div className="flix-autocomplete-thumb placeholder"><i className="fa fa-film"></i></div>
                      )}
                      <span className="flix-autocomplete-title">{item.Title}</span>
                    </div>
                    <div className="flix-autocomplete-right">
                      {item.Source === "omdb" && <span className="flix-source-tag">Live OMDb</span>}
                      {item.Year && <span className="flix-autocomplete-year">{item.Year}</span>}
                    </div>
                  </button>
                ))}
              </div>
            )}
          </div>

          <div className="flix-center-links">
            <Link to="/profile?tab=watchlist" className="flix-nav-link" id="nav-watchlist">
              <span>🔖</span> Watchlist
            </Link>
            <Link to="/profile?tab=recommendations" className="flix-nav-link" id="nav-recs">
              <span>✨</span> For You
            </Link>
          </div>
        </div>

        {/* ── Right: Auth ─────────────────────────────────── */}
        <div className="flix-navbar-right">

          {isAuthenticated && user ? (
            <div className="flix-user-menu">
              <button
                className="flix-user-trigger"
                id="nav-user-trigger"
                onClick={() => setDropdownOpen(!dropdownOpen)}
                aria-expanded={dropdownOpen}
              >
                <img
                  src={user.avatarUrl || `https://ui-avatars.com/api/?name=${encodeURIComponent(user.username)}&background=6366f1&color=fff&rounded=true`}
                  alt={user.username}
                  className="flix-user-avatar"
                />
                <span className="flix-user-name">{user.username}</span>
                <span className="flix-caret">{dropdownOpen ? '▲' : '▼'}</span>
              </button>

              {dropdownOpen && (
                <div className="flix-dropdown" onClick={() => setDropdownOpen(false)}>
                  <div className="flix-dropdown-header">
                    <p className="flix-dropdown-name">{user.fullName || user.username}</p>
                    <p className="flix-dropdown-email">{user.email}</p>
                  </div>
                  <div className="flix-dropdown-divider" />
                  <Link to="/profile" className="flix-dropdown-item" id="dd-profile">👤 My Profile</Link>
                  <Link to="/profile?tab=watchlist" className="flix-dropdown-item" id="dd-watchlist">🔖 Watchlist</Link>
                  <Link to="/profile?tab=ratings" className="flix-dropdown-item" id="dd-ratings">⭐ My Ratings</Link>
                  <Link to="/profile?tab=recommendations" className="flix-dropdown-item" id="dd-recs">✨ For You (AI)</Link>
                  <div className="flix-dropdown-divider" />
                  <button className="flix-dropdown-item flix-logout" id="dd-logout" onClick={handleLogout}>
                    🚪 Log Out
                  </button>
                </div>
              )}
            </div>
          ) : (
            <div className="flix-auth-btns">
              <button
                className="flix-demo-btn"
                id="nav-demo-btn"
                onClick={() => loginDemo()}
                title="Try demo account instantly"
              >
                ⚡ Demo
              </button>
              <button
                className="flix-signin-btn"
                id="nav-signin-btn"
                onClick={() => openAuthModal('login')}
              >
                Sign In
              </button>
            </div>
          )}
        </div>

      </div>
    </nav>
  );
};

export default Navbar;
