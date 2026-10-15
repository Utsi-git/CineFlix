import React, { useState, useEffect } from 'react';
import { useLocation, Link } from 'react-router-dom';
import axios from '../services/api';
import { useAuth } from '../context/AuthContext';
import Spinner from './Spinner';

const AVAILABLE_GENRES = [
  'Action', 'Sci-Fi', 'Drama', 'Thriller', 'Comedy', 
  'Horror', 'Animation', 'Adventure', 'Romance', 'Mystery'
];

const Profile = () => {
  const { user, isAuthenticated, openAuthModal, loginDemo, updateProfile, refreshProfile, awsStatus, refreshAwsStatus } = useAuth();
  const location = useLocation();

  // Parse active tab from URL query params (e.g. ?tab=watchlist)
  const queryParams = new URLSearchParams(location.search);
  const initialTab = queryParams.get('tab') || 'watchlist';

  const [activeTab, setActiveTab] = useState(initialTab);
  const [watchlist, setWatchlist] = useState([]);
  const [ratings, setRatings] = useState([]);
  const [personalizedRecs, setPersonalizedRecs] = useState([]);
  const [loadingData, setLoadingData] = useState(false);

  // Profile Edit states
  const [isEditingBio, setIsEditingBio] = useState(false);
  const [bioInput, setBioInput] = useState('');
  const [fullNameInput, setFullNameInput] = useState('');
  const [avatarUploading, setAvatarUploading] = useState(false);
  const [profileMsg, setProfileMsg] = useState('');

  // Synchronize active tab if location changes
  useEffect(() => {
    const tab = new URLSearchParams(location.search).get('tab');
    if (tab) setActiveTab(tab);
  }, [location.search]);

  // Load user data when authenticated
  useEffect(() => {
    if (!isAuthenticated || !user) return;

    setBioInput(user.bio || '');
    setFullNameInput(user.fullName || user.username || '');

    async function loadUserData() {
      setLoadingData(true);
      try {
        // 1. Fetch Watchlist from DynamoDB
        const wlRes = await axios.get('/api/user/watchlist');
        if (wlRes.data && wlRes.data.watchlist) {
          setWatchlist(wlRes.data.watchlist);
        }

        // 2. Fetch Ratings from DynamoDB
        const ratRes = await axios.get('/api/user/ratings');
        if (ratRes.data && ratRes.data.ratings) {
          setRatings(ratRes.data.ratings);
        }

        // 3. Fetch Personalized Recommendations
        const recRes = await axios.get('/api/user/recommendations');
        if (recRes.data && recRes.data.recommendations) {
          setPersonalizedRecs(recRes.data.recommendations);
        }
      } catch (err) {
        console.error('Error fetching profile data:', err);
      } finally {
        setLoadingData(false);
      }
    }

    loadUserData();
  }, [isAuthenticated, user]);

  // Handle Genre selection toggle
  const handleToggleGenre = async (genre) => {
    if (!user) return;
    const currentGenres = user.favoriteGenres || [];
    let updated;
    if (currentGenres.includes(genre)) {
      if (currentGenres.length <= 1) return; // Keep at least one
      updated = currentGenres.filter(g => g !== genre);
    } else {
      updated = [...currentGenres, genre];
    }

    try {
      await updateProfile({ favoriteGenres: updated });
      // Refresh personalized recs
      const recRes = await axios.get('/api/user/recommendations');
      if (recRes.data && recRes.data.recommendations) {
        setPersonalizedRecs(recRes.data.recommendations);
      }
    } catch (err) {
      console.error('Failed to update genres:', err);
    }
  };

  // Handle Avatar file upload to AWS S3
  const handleAvatarFileChange = async (e) => {
    const file = e.target.files && e.target.files[0];
    if (!file) return;

    const formData = new FormData();
    formData.append('avatar', file);

    setAvatarUploading(true);
    setProfileMsg('');
    try {
      const res = await axios.post('/api/user/avatar/upload', formData, {
        headers: { 'Content-Type': 'multipart/form-data' }
      });
      if (res.data && res.data.avatarUrl) {
        setProfileMsg('Avatar uploaded successfully!');
        await refreshProfile();
      }
    } catch (err) {
      console.error('Avatar upload failed:', err);
      setProfileMsg('Failed to upload avatar to AWS S3.');
    } finally {
      setAvatarUploading(false);
      setTimeout(() => setProfileMsg(''), 4000);
    }
  };

  // Save Bio & Name edit
  const handleSaveProfileInfo = async () => {
    try {
      await updateProfile({
        fullName: fullNameInput.trim(),
        bio: bioInput.trim()
      });
      setIsEditingBio(false);
      setProfileMsg('Profile updated successfully!');
      setTimeout(() => setProfileMsg(''), 3000);
    } catch (err) {
      console.error('Profile update failed:', err);
    }
  };

  // Watchlist Actions
  const handleRemoveWatchlist = async (imdbID) => {
    try {
      await axios.delete(`/api/user/watchlist/${encodeURIComponent(imdbID)}`);
      setWatchlist(prev => prev.filter(item => item.imdbID !== imdbID));
    } catch (err) {
      console.error('Failed to remove from watchlist:', err);
    }
  };

  const handleToggleWatchlistFavorite = async (item) => {
    try {
      const res = await axios.post('/api/user/favorite/toggle', {
        imdbID: item.imdbID,
        title: item.title,
        year: item.year,
        poster: item.poster,
        genre: item.genre
      });
      const newFavState = res.data.isFavorite;
      setWatchlist(prev =>
        prev.map(w => (w.imdbID === item.imdbID ? { ...w, isFavorite: newFavState } : w))
      );
    } catch (err) {
      console.error('Failed to toggle favorite:', err);
    }
  };

  if (!isAuthenticated || !user) {
    return (
      <div className="profile-page-unauth">
        <div className="unauth-card">
          <div className="unauth-icon"><i className="fa fa-user-circle"></i></div>
          <h2>Join or Sign In to CineMatch</h2>
          <p>Create your custom user profile, save your favorite movies and watchlists, and unlock personalized AI recommendations tailored to your taste.</p>
          <div className="unauth-buttons">
            <button className="auth-primary-btn demo-btn" onClick={() => loginDemo()}>
              <i className="fa fa-bolt"></i> 1-Click Demo Cinephile
            </button>
            <button className="btn-secondary" onClick={() => openAuthModal('login')}>
              Sign In to Existing Account
            </button>
          </div>
        </div>
      </div>
    );
  }

  const favoritesList = watchlist.filter(item => item.isFavorite);
  const fallbackPoster = "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='200' height='300' viewBox='0 0 200 300'%3E%3Crect width='200' height='300' fill='%231a1a1a'/%3E%3Ctext x='50%25' y='50%25' dominant-baseline='middle' text-anchor='middle' fill='%23777' font-family='sans-serif' font-size='14'%3ENo Poster%3C/text%3E%3C/svg%3E";

  return (
    <div className="profile-page-wrapper">
      {/* PROFILE HERO HEADER */}
      <div className="profile-hero">
        <div className="profile-hero-inner">
          <div className="profile-avatar-container">
            <img
              src={user.avatarUrl || 'https://ui-avatars.com/api/?name=User&background=6366f1&color=fff'}
              alt={user.username}
              className="profile-hero-avatar"
            />
            <label className="avatar-upload-badge" title="Upload new photo">
              <i className={`fa ${avatarUploading ? 'fa-spinner fa-spin' : 'fa-camera'}`}></i>
              <input
                type="file"
                accept="image/*"
                onChange={handleAvatarFileChange}
                disabled={avatarUploading}
                style={{ display: 'none' }}
              />
            </label>
          </div>

          <div className="profile-main-info">
            <div className="profile-title-row">
              <h2>{user.fullName || user.username}</h2>
              <span className="profile-username-tag">@{user.username}</span>
            </div>

            <p className="profile-email"><i className="fa fa-envelope-o"></i> {user.email}</p>

            {isEditingBio ? (
              <div className="profile-edit-bio-box">
                <input
                  type="text"
                  placeholder="Full name"
                  value={fullNameInput}
                  onChange={(e) => setFullNameInput(e.target.value)}
                  className="profile-input-field"
                />
                <textarea
                  rows="2"
                  placeholder="Bio..."
                  value={bioInput}
                  onChange={(e) => setBioInput(e.target.value)}
                  className="profile-input-field"
                />
                <div className="profile-edit-actions">
                  <button className="btn-secondary btn-sm" onClick={() => setIsEditingBio(false)}>Cancel</button>
                  <button className="auth-primary-btn btn-sm" onClick={handleSaveProfileInfo}>Save Changes</button>
                </div>
              </div>
            ) : (
              <div className="profile-bio-display">
                <p className="profile-bio">{user.bio || 'Film lover & cinephile.'}</p>
                <button className="profile-edit-btn" onClick={() => setIsEditingBio(true)}>
                  <i className="fa fa-pencil"></i> Edit Profile
                </button>
              </div>
            )}

            {/* Favorite Genres Pills Selector */}
            <div className="profile-genres-row">
              <span className="genres-label">Favorite Genres:</span>
              <div className="profile-genre-pills">
                {AVAILABLE_GENRES.map((g) => {
                  const isFav = (user.favoriteGenres || []).includes(g);
                  return (
                    <button
                      key={g}
                      className={`profile-genre-pill ${isFav ? 'active' : ''}`}
                      onClick={() => handleToggleGenre(g)}
                      title={isFav ? 'Remove from favorites' : 'Add to favorite genres'}
                    >
                      {g} {isFav ? '\u2713' : '+'}
                    </button>
                  );
                })}
              </div>
            </div>

            {profileMsg && <div className="profile-feedback-alert">{profileMsg}</div>}
          </div>

          {/* Quick Stats Badges */}
          <div className="profile-stats-card">
            <div className="stat-box">
              <span className="stat-number">{watchlist.length}</span>
              <span className="stat-title">Watchlist</span>
            </div>
            <div className="stat-box">
              <span className="stat-number">{favoritesList.length}</span>
              <span className="stat-title">Favorites</span>
            </div>
            <div className="stat-box">
              <span className="stat-number">{ratings.length}</span>
              <span className="stat-title">Ratings</span>
            </div>
          </div>
        </div>
      </div>

      {/* PROFILE TABS NAVIGATION */}
      <div className="profile-nav-tabs">
        <button
          className={`profile-tab-item ${activeTab === 'watchlist' ? 'active' : ''}`}
          onClick={() => setActiveTab('watchlist')}
        >
          <i className="fa fa-bookmark"></i> Watchlist ({watchlist.length})
        </button>
        <button
          className={`profile-tab-item ${activeTab === 'favorites' ? 'active' : ''}`}
          onClick={() => setActiveTab('favorites')}
        >
          <i className="fa fa-heart"></i> Favorites ({favoritesList.length})
        </button>
        <button
          className={`profile-tab-item ${activeTab === 'ratings' ? 'active' : ''}`}
          onClick={() => setActiveTab('ratings')}
        >
          <i className="fa fa-star"></i> My Ratings ({ratings.length})
        </button>
        <button
          className={`profile-tab-item ${activeTab === 'recommendations' ? 'active' : ''}`}
          onClick={() => setActiveTab('recommendations')}
        >
          <i className="fa fa-magic"></i> Recommended For You ({personalizedRecs.length})
        </button>
      </div>

      {/* TAB CONTENTS */}
      <div className="profile-tab-content">
        {loadingData ? (
          <Spinner />
        ) : (
          <>
            {/* 1. WATCHLIST TAB */}
            {activeTab === 'watchlist' && (
              <div className="watchlist-tab-pane">
                <div className="pane-header">
                  <h3>Your Movie Watchlist</h3>
                  <p>Movies you have saved to watch later.</p>
                </div>

                {watchlist.length === 0 ? (
                  <div className="empty-state-box">
                    <i className="fa fa-bookmark-o"></i>
                    <h4>Your watchlist is empty</h4>
                    <p>Search any movie in the search bar and click "Add to Watchlist" to save it here!</p>
                    <Link to="/" className="auth-primary-btn">Explore Movies \u2192</Link>
                  </div>
                ) : (
                  <div className="watchlist-grid">
                    {watchlist.map((item) => (
                      <div key={item.imdbID} className="watchlist-card">
                        <div className="card-poster">
                          <img
                            src={item.poster && item.poster !== 'N/A' ? item.poster : fallbackPoster}
                            alt={item.title}
                            onError={(e) => { e.target.onerror = null; e.target.src = fallbackPoster; }}
                          />
                          <button
                            className={`favorite-corner-btn ${item.isFavorite ? 'favorited' : ''}`}
                            onClick={() => handleToggleWatchlistFavorite(item)}
                            title={item.isFavorite ? 'Remove from favorites' : 'Mark as favorite'}
                          >
                            ♥
                          </button>
                        </div>
                        <div className="card-info">
                          <h4 title={item.title}>{item.title}</h4>
                          <div className="card-meta">
                            <span>{item.year || 'N/A'}</span>
                            <span className="card-genre">{item.genre || 'Movie'}</span>
                          </div>
                          <div className="card-actions">
                            <Link
                              to={{ pathname: '/recommend', state: { MovieName: item.title } }}
                              className="view-rec-link"
                            >
                              Explore \u2192
                            </Link>
                            <button
                              className="remove-btn"
                              onClick={() => handleRemoveWatchlist(item.imdbID)}
                              title="Remove from watchlist"
                            >
                              <i className="fa fa-trash-o"></i>
                            </button>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* 2. FAVORITES TAB */}
            {activeTab === 'favorites' && (
              <div className="favorites-tab-pane">
                <div className="pane-header">
                  <h3>Your Favorite Masterpieces</h3>
                  <p>Your pinned favorite movies.</p>
                </div>

                {favoritesList.length === 0 ? (
                  <div className="empty-state-box">
                    <i className="fa fa-heart-o"></i>
                    <h4>No favorites pinned yet</h4>
                    <p>Click the heart icon on any movie in your watchlist or on the movie details page!</p>
                  </div>
                ) : (
                  <div className="watchlist-grid">
                    {favoritesList.map((item) => (
                      <div key={item.imdbID} className="watchlist-card">
                        <div className="card-poster">
                          <img
                            src={item.poster && item.poster !== 'N/A' ? item.poster : fallbackPoster}
                            alt={item.title}
                            onError={(e) => { e.target.onerror = null; e.target.src = fallbackPoster; }}
                          />
                          <button
                            className="favorite-corner-btn favorited"
                            onClick={() => handleToggleWatchlistFavorite(item)}
                            title="Remove from favorites"
                          >
                            ♥
                          </button>
                        </div>
                        <div className="card-info">
                          <h4 title={item.title}>{item.title}</h4>
                          <div className="card-meta">
                            <span>{item.year || 'N/A'}</span>
                            <span className="card-genre">{item.genre || 'Movie'}</span>
                          </div>
                          <div className="card-actions">
                            <Link
                              to={{ pathname: '/recommend', state: { MovieName: item.title } }}
                              className="view-rec-link"
                            >
                              Explore & Recommendations \u2192
                            </Link>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* 3. MY RATINGS TAB */}
            {activeTab === 'ratings' && (
              <div className="ratings-tab-pane">
                <div className="pane-header">
                  <h3>Your Movie Ratings & Reviews</h3>
                  <p>Your ratings and reviews that power your personalized recommendations.</p>
                </div>

                {ratings.length === 0 ? (
                  <div className="empty-state-box">
                    <i className="fa fa-star-o"></i>
                    <h4>No movie ratings yet</h4>
                    <p>Rate movies on their details page to build your personalized AI recommendation vectors!</p>
                  </div>
                ) : (
                  <div className="ratings-list">
                    {ratings.map((r, idx) => (
                      <div key={r.imdbID || idx} className="rating-card-item">
                        <div className="rating-card-poster">
                          <img
                            src={r.poster && r.poster !== 'N/A' ? r.poster : fallbackPoster}
                            alt={r.title}
                            onError={(e) => { e.target.onerror = null; e.target.src = fallbackPoster; }}
                          />
                        </div>
                        <div className="rating-card-body">
                          <div className="rating-card-header">
                            <div>
                              <h4>{r.title}</h4>
                              <span className="rating-card-year">{r.year} • {r.genre || 'Film'}</span>
                            </div>
                            <div className="user-score-badge">
                              ★ <span className="score-val">{r.rating}</span><span className="score-out">/10</span>
                            </div>
                          </div>
                          {r.review ? (
                            <p className="rating-card-review">"{r.review}"</p>
                          ) : (
                            <p className="rating-card-review muted">No written review provided.</p>
                          )}
                          <div className="rating-card-footer">
                            <span className="rating-timestamp">Updated: {new Date(r.updatedAt).toLocaleDateString()}</span>
                            <Link
                              to={{ pathname: '/recommend', state: { MovieName: r.title } }}
                              className="card-explore-btn"
                            >
                              Get AI Recommendations for this Film \u2192
                            </Link>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* 4. PERSONALIZED RECOMMENDATIONS TAB */}
            {activeTab === 'recommendations' && (
              <div className="personalized-tab-pane">
                <div className="pane-header">
                  <h3>Tailored Specifically For You</h3>
                  <p>
                    Machine learning recommendation vectors computed from your favorite genres (
                    <strong>{(user.favoriteGenres || []).join(', ')}</strong>
                    ) and your top-rated movies.
                  </p>
                </div>

                {personalizedRecs.length === 0 ? (
                  <div className="empty-state-box">
                    <i className="fa fa-magic"></i>
                    <h4>Generating personalized vectors...</h4>
                    <p>Rate a few movies or pick your favorite genres above to unlock recommendations.</p>
                  </div>
                ) : (
                  <div className="personalized-grid">
                    {personalizedRecs.map((rec, i) => (
                      <div key={i} className="personalized-card">
                        <div className="rec-card-badge">{rec.badge || 'Taste Match'}</div>
                        <div className="rec-card-main">
                          <h4>{rec.title}</h4>
                          <span className="rec-card-year">{rec.year}</span>
                          <p className="rec-card-reason">
                            <i className="fa fa-lightbulb-o"></i> {rec.reason}
                          </p>
                        </div>
                        <Link
                          to={{ pathname: '/recommend', state: { MovieName: rec.title } }}
                          className="rec-card-btn"
                        >
                          Explore Movie & ML Similar →
                        </Link>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </>
        )}

      </div>
    </div>
  );
};

export default Profile;
