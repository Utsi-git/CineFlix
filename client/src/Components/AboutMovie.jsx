import React, { useState, useEffect } from 'react';
import axios from '../services/api';
import { useAuth } from '../context/AuthContext';
import RatingModal from './RatingModal';

const AboutMovie = (props) => {
    const movie = props.Details || {};
    const { isAuthenticated, openAuthModal } = useAuth();

    const [isInWatchlist, setIsInWatchlist] = useState(false);
    const [isFavorite, setIsFavorite] = useState(false);
    const [userRating, setUserRating] = useState(null);
    const [userReview, setUserReview] = useState('');
    const [isRatingModalOpen, setIsRatingModalOpen] = useState(false);
    const [actionMsg, setActionMsg] = useState('');

    // Format runtime from "148 min" to "2h 28m"
    function formatRuntime(rt) {
        if (!rt || rt === "N/A") return "";
        const numeric = parseInt(rt, 10);
        if (isNaN(numeric) || numeric <= 0) return rt;
        const hours = Math.floor(numeric / 60);
        const mins = numeric % 60;
        return `${hours > 0 ? `${hours}h ` : ""}${mins}m`;
    }

    const title = movie.Title || props.MovieName;
    const year = movie.Year && movie.Year !== "N/A"
        ? movie.Year
        : (movie.Released && movie.Released !== "N/A" ? movie.Released.slice(-4) : "");
    const rated = movie.Rated && movie.Rated !== "N/A" ? movie.Rated : "PG-13";
    const runtimeStr = formatRuntime(movie.Runtime);
    const genre = movie.Genre && movie.Genre !== "N/A" ? movie.Genre : "";
    const plot = movie.Plot && movie.Plot !== "N/A" ? movie.Plot : "No overview available for this movie.";
    const poster = movie.Poster && movie.Poster !== "N/A" ? movie.Poster : null;
    const fallbackPoster = "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='380' height='560' viewBox='0 0 380 560'%3E%3Crect width='380' height='560' fill='%231f1f1f'/%3E%3Ccircle cx='190' cy='240' r='50' fill='%23333'/%3E%3Cpath d='M175 220 L215 240 L175 260 Z' fill='%23666'/%3E%3Ctext x='50%25' y='330' dominant-baseline='middle' text-anchor='middle' fill='%23888' font-family='sans-serif' font-size='18'%3ENo Poster Available%3C/text%3E%3C/svg%3E";

    // Ratings & metadata from OMDb
    const imdbRating = movie.imdbRating && movie.imdbRating !== "N/A" ? `${movie.imdbRating} / 10` : "N/A";
    const imdbVotes = movie.imdbVotes && movie.imdbVotes !== "N/A" ? movie.imdbVotes : "N/A";
    const metascore = movie.Metascore && movie.Metascore !== "N/A" ? `${movie.Metascore} / 100` : "N/A";
    const boxOffice = movie.BoxOffice && movie.BoxOffice !== "N/A" ? movie.BoxOffice : "N/A";
    const awards = movie.Awards && movie.Awards !== "N/A" ? movie.Awards : "";

    const imdbID = movie.imdbID || title;

    // Check user's DynamoDB watchlist and ratings for this movie
    useEffect(() => {
        if (!isAuthenticated || !imdbID) return;

        async function checkMovieStatus() {
            try {
                // Check watchlist
                const wlRes = await axios.get('/api/user/watchlist');
                if (wlRes.data && wlRes.data.watchlist) {
                    const match = wlRes.data.watchlist.find(
                        (item) => item.imdbID === imdbID || item.title.toLowerCase() === title.toLowerCase()
                    );
                    if (match) {
                        setIsInWatchlist(true);
                        setIsFavorite(!!match.isFavorite);
                    } else {
                        setIsInWatchlist(false);
                        setIsFavorite(false);
                    }
                }

                // Check user ratings
                const ratRes = await axios.get('/api/user/ratings');
                if (ratRes.data && ratRes.data.ratings) {
                    const match = ratRes.data.ratings.find(
                        (r) => r.imdbID === imdbID || r.title.toLowerCase() === title.toLowerCase()
                    );
                    if (match) {
                        setUserRating(match.rating);
                        setUserReview(match.review || '');
                    } else {
                        setUserRating(null);
                        setUserReview('');
                    }
                }
            } catch (err) {
                console.error('Error checking movie user status:', err);
            }
        }

        checkMovieStatus();
    }, [isAuthenticated, imdbID, title]);

    // Handle Watchlist toggle
    const handleWatchlistToggle = async () => {
        if (!isAuthenticated) {
            openAuthModal('login');
            return;
        }

        try {
            if (isInWatchlist) {
                await axios.delete(`/api/user/watchlist/${encodeURIComponent(imdbID)}`);
                setIsInWatchlist(false);
                setIsFavorite(false);
                setActionMsg('Removed from DynamoDB Watchlist');
            } else {
                await axios.post('/api/user/watchlist', {
                    imdbID: imdbID,
                    title: title,
                    year: year,
                    poster: poster || fallbackPoster,
                    genre: genre,
                    isFavorite: isFavorite
                });
                setIsInWatchlist(true);
                setActionMsg('Added to Amazon DynamoDB Watchlist \u2713');
            }
            setTimeout(() => setActionMsg(''), 3000);
        } catch (err) {
            console.error('Failed to toggle watchlist:', err);
        }
    };

    // Handle Favorite toggle
    const handleFavoriteToggle = async () => {
        if (!isAuthenticated) {
            openAuthModal('login');
            return;
        }

        try {
            const res = await axios.post('/api/user/favorite/toggle', {
                imdbID: imdbID,
                title: title,
                year: year,
                poster: poster || fallbackPoster,
                genre: genre
            });
            setIsFavorite(res.data.isFavorite);
            if (res.data.isFavorite) {
                setIsInWatchlist(true);
                setActionMsg('Marked as Favorite in DynamoDB ♥');
            } else {
                setActionMsg('Removed from Favorites');
            }
            setTimeout(() => setActionMsg(''), 3000);
        } catch (err) {
            console.error('Failed to toggle favorite:', err);
        }
    };

    const handleRatingSaved = (savedRating) => {
        setUserRating(savedRating.rating);
        setUserReview(savedRating.review || '');
        setActionMsg(`Rating (${savedRating.rating}/10) saved to Amazon DynamoDB!`);
        setTimeout(() => setActionMsg(''), 3500);
    };

    return (
        <div className="About-Movie">
            <div className="image-holder">
                {/* Atmospheric blurred backdrop */}
                {poster ? (
                    <img
                        className="backdrop-blur-img"
                        alt=""
                        aria-hidden="true"
                        src={poster}
                    />
                ) : null}
                <div id="image"></div>

                {/* Main Hero Content */}
                <div className="hero-content-wrapper">
                    <div className="poster-container">
                        <img
                            className="hero-poster"
                            alt={title}
                            src={poster || fallbackPoster}
                            onError={(e) => {
                                e.target.onerror = null;
                                e.target.src = fallbackPoster;
                            }}
                        />
                    </div>

                    <div className="hero-info">
                        <div className="hero-badge-row">
                            <span className="live-omdb-badge">
                                <i className="fa fa-bolt"></i> Real-Time OMDb Data
                            </span>
                            <span className="ai-model-badge">
                                <i className="fa fa-cogs"></i> Cosine Similarity ML
                            </span>
                        </div>

                        <h2 className="hero-title">{title}</h2>

                        <div className="movie-meta-row">
                            {year ? <span className="meta-badge meta-year">{year}</span> : null}
                            {rated ? <span className="agelimit">{rated}</span> : null}
                            {runtimeStr ? <span className="meta-badge">{runtimeStr}</span> : null}
                            {genre ? <span className="meta-badge meta-genre">{genre}</span> : null}
                        </div>

                        <p className="Overview">{plot}</p>

                        <div className="credits-snippet">
                            {movie.Director && movie.Director !== "N/A" ? (
                                <p><strong>Director:</strong> {movie.Director}</p>
                            ) : null}
                            {movie.Actors && movie.Actors !== "N/A" ? (
                                <p><strong>Starring:</strong> {movie.Actors}</p>
                            ) : null}
                            {awards ? (
                                <p className="awards-text"><i className="fa fa-trophy" aria-hidden="true"></i> {awards}</p>
                            ) : null}
                        </div>

                        {/* Interactive User Actions (Synced to Amazon DynamoDB) */}
                        <div className="hero-user-actions">
                            <button
                                className={`action-btn-pill watchlist-btn ${isInWatchlist ? 'active' : ''}`}
                                onClick={handleWatchlistToggle}
                            >
                                <i className={`fa ${isInWatchlist ? 'fa-check' : 'fa-bookmark'}`}></i>
                                {isInWatchlist ? 'In Watchlist' : 'Add to Watchlist'}
                            </button>

                            <button
                                className={`action-btn-pill favorite-btn ${isFavorite ? 'active' : ''}`}
                                onClick={handleFavoriteToggle}
                            >
                                <i className="fa fa-heart"></i>
                                {isFavorite ? 'Favorited' : 'Favorite'}
                            </button>

                            <button
                                className={`action-btn-pill rate-btn ${userRating ? 'rated' : ''}`}
                                onClick={() => {
                                    if (!isAuthenticated) openAuthModal('login');
                                    else setIsRatingModalOpen(true);
                                }}
                            >
                                <i className="fa fa-star"></i>
                                {userRating ? `Your Rating: ${userRating}/10` : 'Rate Movie'}
                            </button>
                        </div>

                        {actionMsg && (
                            <div className="hero-action-toast">
                                <i className="fa fa-cloud"></i> {actionMsg}
                            </div>
                        )}
                    </div>
                </div>
            </div>

            {/* Ratings Bar */}
            <div className="Ratings">
                <div className="rating-item">
                    <span className="rating-label">IMDb Rating</span>
                    <p className="rating-val">
                        <i className="fa fa-star" style={{ color: "#f5c518", marginRight: "6px" }}></i>
                        {imdbRating}
                    </p>
                </div>
                <div className="rating-item">
                    <span className="rating-label">Metascore</span>
                    <p className="rating-val">{metascore}</p>
                </div>
                <div className="rating-item">
                    <span className="rating-label">Box Office</span>
                    <p className="rating-val">{boxOffice}</p>
                </div>
                <div className="rating-item">
                    <span className="rating-label">IMDb Votes</span>
                    <p className="rating-val">{imdbVotes}</p>
                </div>
                {userRating && (
                    <div className="rating-item user-score-item">
                        <span className="rating-label">Your DynamoDB Score</span>
                        <p className="rating-val user-val">★ {userRating} / 10</p>
                    </div>
                )}
            </div>

            {/* Star Rating & Review Modal */}
            <RatingModal
                isOpen={isRatingModalOpen}
                onClose={() => setIsRatingModalOpen(false)}
                movie={{
                    Title: title,
                    Year: year,
                    Poster: poster || fallbackPoster,
                    Genre: genre,
                    imdbID: imdbID
                }}
                initialRating={userRating || 8}
                initialReview={userReview}
                onRatingSaved={handleRatingSaved}
            />
        </div>
    );
};

export default AboutMovie;
