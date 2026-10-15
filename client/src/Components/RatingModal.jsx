import React, { useState } from 'react';
import axios from '../services/api';
import { useAuth } from '../context/AuthContext';

const RatingModal = ({ isOpen, onClose, movie, onRatingSaved, initialRating = 8, initialReview = '' }) => {
  const { isAuthenticated, openAuthModal } = useAuth();
  const [rating, setRating] = useState(initialRating || 8);
  const [hoverRating, setHoverRating] = useState(0);
  const [review, setReview] = useState(initialReview || '');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  if (!isOpen) return null;

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!isAuthenticated) {
      openAuthModal('login');
      return;
    }

    setLoading(true);
    setError('');

    try {
      const res = await axios.post('/api/user/ratings', {
        imdbID: movie.imdbID || movie.Title || movie.title,
        title: movie.Title || movie.title,
        year: movie.Year || movie.year || '',
        poster: movie.Poster || movie.poster || '',
        genre: movie.Genre || movie.genre || '',
        rating: Number(rating),
        review: review.trim()
      });

      if (onRatingSaved) {
        onRatingSaved(res.data.rating);
      }
      onClose();
    } catch (err) {
      console.error('Failed to save rating:', err);
      setError('Failed to save rating. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="rating-modal-backdrop" onClick={onClose}>
      <div className="rating-modal-container" onClick={(e) => e.stopPropagation()}>
        <button className="rating-modal-close" onClick={onClose} aria-label="Close modal">
          &times;
        </button>

        <div className="rating-modal-header">
          <div className="rating-modal-poster">
            {movie.Poster && movie.Poster !== 'N/A' ? (
              <img src={movie.Poster} alt={movie.Title} />
            ) : (
              <div className="poster-placeholder"><i className="fa fa-film"></i></div>
            )}
          </div>
          <div>
            <h3>Rate & Review</h3>
            <h4>{movie.Title || movie.title}</h4>
            <p className="rating-modal-sub">
              Saved to your profile • Enhances your personalized recommendations
            </p>
          </div>
        </div>

        {error && <div className="auth-error-banner">{error}</div>}

        <form onSubmit={handleSubmit} className="rating-form">
          <div className="star-rating-selector">
            <div className="stars-row">
              {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((starVal) => {
                const activeVal = hoverRating || rating;
                const isFilled = starVal <= activeVal;
                return (
                  <button
                    type="button"
                    key={starVal}
                    className={`star-btn ${isFilled ? 'filled' : ''}`}
                    onMouseEnter={() => setHoverRating(starVal)}
                    onMouseLeave={() => setHoverRating(0)}
                    onClick={() => setRating(starVal)}
                    title={`${starVal} / 10`}
                  >
                    ★
                  </button>
                );
              })}
            </div>
            <div className="rating-score-display">
              <span className="score-num">{hoverRating || rating}</span>
              <span className="score-denom">/ 10</span>
              <span className="score-label">
                {(hoverRating || rating) >= 9 ? 'Masterpiece' :
                 (hoverRating || rating) >= 7 ? 'Great' :
                 (hoverRating || rating) >= 5 ? 'Good / Average' : 'Mediocre'}
              </span>
            </div>
          </div>

          <div className="auth-input-group">
            <label>Your Review (Optional)</label>
            <textarea
              rows="3"
              value={review}
              onChange={(e) => setReview(e.target.value)}
              placeholder="What made this movie memorable? Acting, direction, plot twists..."
            />
          </div>

          <div className="rating-modal-actions">
            <button type="button" className="btn-secondary" onClick={onClose}>
              Cancel
            </button>
            <button type="submit" className="auth-primary-btn" disabled={loading}>
              {loading ? 'Saving...' : 'Save Rating ✓'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default RatingModal;
