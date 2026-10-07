import React, { useState } from 'react';
import { Link, useHistory } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

// ─── Featured Hero Movies ─────────────────────────────────────────────────────
const HERO_MOVIES = [
  {
    title: "Inception",
    tagline: "Your mind is the scene of the crime",
    poster: "https://m.media-amazon.com/images/M/MV5BMjAxMzY3NjcxNF5BMl5BanBnXkFtZTcwNTI5OTM0Mw@@._V1_SX300.jpg",
    bg: "https://m.media-amazon.com/images/M/MV5BMjAxMzY3NjcxNF5BMl5BanBnXkFtZTcwNTI5OTM0Mw@@._V1_SX300.jpg",
    color: "#1a3a5c",
    seed: "Inception",
  },
  {
    title: "Dune: Part Two",
    tagline: "Long live the fighters",
    poster: "https://m.media-amazon.com/images/M/MV5BN2FjNmEyNWMtYzM0ZS00NjIyLTg5YzYtYThlMGVjNzE1OGViXkEyXkFqcGdeQXVyMTkxNjUyNQ@@._V1_SX300.jpg",
    bg: "https://m.media-amazon.com/images/M/MV5BN2FjNmEyNWMtYzM0ZS00NjIyLTg5YzYtYThlMGVjNzE1OGViXkEyXkFqcGdeQXVyMTkxNjUyNQ@@._V1_SX300.jpg",
    color: "#2c1a0e",
    seed: "Dune",
  },
];

// ─── Genre Tabs ───────────────────────────────────────────────────────────────
const GENRES = [
  { name: 'Trending',   icon: '🔥', seed: 'Avengers: Endgame' },
  { name: 'Action',     icon: '⚔️',  seed: 'John Wick' },
  { name: 'Romance',    icon: '💗', seed: 'La La Land' },
  { name: 'Animation',  icon: '🎬', seed: 'Spirited Away' },
  { name: 'Horror',     icon: '👻', seed: 'A Quiet Place' },
  { name: 'Sci-Fi',     icon: '🚀', seed: 'Blade Runner 2049' },
  { name: 'Drama',      icon: '🎭', seed: 'Fight Club' },
];

// ─── Movie Cards per genre ────────────────────────────────────────────────────
const GENRE_MOVIES = {
  Trending: [
    { title: 'Avengers: Endgame', rating: '8.4', year: '2019', poster: 'https://m.media-amazon.com/images/M/MV5BMTc5MDE2ODcwNV5BMl5BanBnXkFtZTgwMzI2NzQ2NzM@._V1_SX300.jpg' },
    { title: 'The Dark Knight',   rating: '9.0', year: '2008', poster: 'https://m.media-amazon.com/images/M/MV5BMTMxNTMwODM0NF5BMl5BanBnXkFtZTcwODAyMTk2Mw@@._V1_SX300.jpg' },
    { title: 'Oppenheimer',       rating: '8.9', year: '2023', poster: 'https://m.media-amazon.com/images/M/MV5BMDBmYTZjNjUtN2M1MS00MTQ2LTk2ODgtNzc2M2QyZGE5NTVjXkEyXkFqcGdeQXVyNzAwMjU2MTY@._V1_SX300.jpg' },
    { title: 'Interstellar',      rating: '8.7', year: '2014', poster: 'https://m.media-amazon.com/images/M/MV5BZjdkOTU3MDktN2IxOS00OGEyLWFmMjktY2FiMmZkNWIyODZiXkEyXkFqcGdeQXVyMTMxODk2OTU@._V1_SX300.jpg' },
    { title: 'Parasite',          rating: '8.5', year: '2019', poster: 'https://m.media-amazon.com/images/M/MV5BYWZjMjk3ZTItODQ2ZC00NTY5LWE0ZDYtZTI3MjcwN2Q5NTVkXkEyXkFqcGdeQXVyODk4OTc3MTY@._V1_SX300.jpg' },
    { title: 'Inception',         rating: '8.8', year: '2010', poster: 'https://m.media-amazon.com/images/M/MV5BMjAxMzY3NjcxNF5BMl5BanBnXkFtZTcwNTI5OTM0Mw@@._V1_SX300.jpg' },
  ],
  Action: [
    { title: 'John Wick',         rating: '7.4', year: '2014', poster: 'https://m.media-amazon.com/images/M/MV5BMTU2NjA1ODgzMF5BMl5BanBnXkFtZTgwMTM2MTI4MjE@._V1_SX300.jpg' },
    { title: 'Mad Max: Fury Road',rating: '8.1', year: '2015', poster: 'https://m.media-amazon.com/images/M/MV5BN2EwM2I5OWMtMGQyMi00Zjg1LWJkNTctZTdjYTA4OGUwZjMyXkEyXkFqcGdeQXVyMTMxODk2OTU@._V1_SX300.jpg' },
    { title: 'Top Gun: Maverick', rating: '8.3', year: '2022', poster: 'https://m.media-amazon.com/images/M/MV5BZWYzOGEwNTgtNWU3NS00ZTQ0LWJkODUtMmVhMjIwMjA1ZmQwXkEyXkFqcGdeQXVyMjkwOTAyMDU@._V1_SX300.jpg' },
    { title: 'The Dark Knight',   rating: '9.0', year: '2008', poster: 'https://m.media-amazon.com/images/M/MV5BMTMxNTMwODM0NF5BMl5BanBnXkFtZTcwODAyMTk2Mw@@._V1_SX300.jpg' },
    { title: 'Mission: Impossible', rating: '7.9', year: '2023', poster: 'https://m.media-amazon.com/images/M/MV5BYzViNmQ2MWQtMTQ0NS00NGVlLWI1ZDMtNjcxMzYxODYxMjEyXkEyXkFqcGdeQXVyMTkxNjUyNQ@@._V1_SX300.jpg' },
    { title: 'Avengers: Endgame', rating: '8.4', year: '2019', poster: 'https://m.media-amazon.com/images/M/MV5BMTc5MDE2ODcwNV5BMl5BanBnXkFtZTgwMzI2NzQ2NzM@._V1_SX300.jpg' },
  ],
  Romance: [
    { title: 'La La Land',        rating: '8.0', year: '2016', poster: 'https://m.media-amazon.com/images/M/MV5BMzUzNDM2NzM2MV5BMl5BanBnXkFtZTgwNTM3NTg4OTE@._V1_SX300.jpg' },
    { title: 'Titanic',           rating: '7.9', year: '1997', poster: 'https://m.media-amazon.com/images/M/MV5BMDdmZGU3NDQtY2E5My00ZTliLWIzOTUtMTY4ZGI1YjdiNjk3XkEyXkFqcGdeQXVyNTA4NzY1MzY@._V1_SX300.jpg' },
    { title: 'The Notebook',      rating: '7.8', year: '2004', poster: 'https://m.media-amazon.com/images/M/MV5BODk1OTE4MDQ1MV5BMl5BanBnXkFtZTcwMzU3MDUyMQ@@._V1_SX300.jpg' },
    { title: 'Her',               rating: '8.0', year: '2013', poster: 'https://m.media-amazon.com/images/M/MV5BMjA1Nzk0OTM2OF5BMl5BanBnXkFtZTgwNjU2NjEwMDE@._V1_SX300.jpg' },
    { title: 'Before Sunrise',    rating: '8.1', year: '1995', poster: 'https://m.media-amazon.com/images/M/MV5BZDdiZDllMjEtNDUxNS00YWJhLWE4ZTctYWVkZGQyYTFhNTZiXkEyXkFqcGdeQXVyNjU0OTQ0OTY@._V1_SX300.jpg' },
    { title: 'Pride & Prejudice', rating: '7.8', year: '2005', poster: 'https://m.media-amazon.com/images/M/MV5BMTA1NDQ3NTcyOTNeQTJeQWpwZ15BbWU3MDA0MzA4MzE@._V1_SX300.jpg' },
  ],
  Animation: [
    { title: 'Spirited Away',     rating: '8.6', year: '2001', poster: 'https://m.media-amazon.com/images/M/MV5BMjlmZmI5MDctNDE2YS00YWE0LWE5ZWItZDBhYWQ0NTcxNWRhXkEyXkFqcGdeQXVyMTMxODk2OTU@._V1_SX300.jpg' },
    { title: 'Spider-Man: Into the Spider-Verse', rating: '8.4', year: '2018', poster: 'https://m.media-amazon.com/images/M/MV5BMjMwNDkxMTgzOF5BMl5BanBnXkFtZTgwNTkwNTQ3NjM@._V1_SX300.jpg' },
    { title: 'Coco',              rating: '8.4', year: '2017', poster: 'https://m.media-amazon.com/images/M/MV5BYjQ5NjM0Y2YtNjZkNC00ZDhkLWJjMWItN2QyNzFkMDE3ZjAxXkEyXkFqcGdeQXVyODIxMzk1NjA@._V1_SX300.jpg' },
    { title: 'Princess Mononoke', rating: '8.4', year: '1997', poster: 'https://m.media-amazon.com/images/M/MV5BNGIzY2IzODQtNThmOC00ZjMyLWFmYTktOGIxMDYyMjkwYzE5XkEyXkFqcGdeQXVyMTMxODk2OTU@._V1_SX300.jpg' },
    { title: 'Your Name',         rating: '8.4', year: '2016', poster: 'https://m.media-amazon.com/images/M/MV5BODRmZDVmNzUtZjRhZS00YjA3LTkxNDktYzFkM2RlYTczMDYyXkEyXkFqcGdeQXVyNTk0MzMzODA@._V1_SX300.jpg' },
    { title: 'Howl\'s Moving Castle', rating: '8.2', year: '2004', poster: 'https://m.media-amazon.com/images/M/MV5BNmM4YTFmMWQtZDZkMy00NGEwLWJiMjMtZTE3ZDE5ZWY1ZTIwXkEyXkFqcGdeQXVyMTMxODk2OTU@._V1_SX300.jpg' },
  ],
  Horror: [
    { title: 'A Quiet Place',     rating: '7.5', year: '2018', poster: 'https://m.media-amazon.com/images/M/MV5BMjI0MDMzNTQ0M15BMl5BanBnXkFtZTgwMTM5NzM3NDM@._V1_SX300.jpg' },
    { title: 'Get Out',           rating: '7.7', year: '2017', poster: 'https://m.media-amazon.com/images/M/MV5BMjUxMDQwNjcyMl5BMl5BanBnXkFtZTgwNzcwMzc1MTI@._V1_SX300.jpg' },
    { title: 'Hereditary',        rating: '7.3', year: '2018', poster: 'https://m.media-amazon.com/images/M/MV5BOTU5MDg3OGItZWQ1Ny00ZGVmLTg2YTUtMzBkYzQ1YWIwZjlhXkEyXkFqcGdeQXVyMDM2NDM2MQ@@._V1_SX300.jpg' },
    { title: 'The Conjuring',     rating: '7.5', year: '2013', poster: 'https://m.media-amazon.com/images/M/MV5BMTM3NjA1NDMyMV5BMl5BanBnXkFtZTcwMDQzNDMzOQ@@._V1_SX300.jpg' },
    { title: 'Midsommar',         rating: '7.1', year: '2019', poster: 'https://m.media-amazon.com/images/M/MV5BMzQxNzQzOTQwM15BMl5BanBnXkFtZTgwMDQ2NTcwODM@._V1_SX300.jpg' },
    { title: 'It',                rating: '7.3', year: '2017', poster: 'https://m.media-amazon.com/images/M/MV5BZDVkZmI0YzAtNzdjYi00ZjhhLWE1ODEtMWMzMWMzNDA0NmQ4XkEyXkFqcGdeQXVyNzYzODM3Mzg@._V1_SX300.jpg' },
  ],
  'Sci-Fi': [
    { title: 'Blade Runner 2049', rating: '8.0', year: '2017', poster: 'https://m.media-amazon.com/images/M/MV5BNzA1Njg4NzYxOV5BMl5BanBnXkFtZTgwODk5NjU3MzI@._V1_SX300.jpg' },
    { title: 'Interstellar',      rating: '8.7', year: '2014', poster: 'https://m.media-amazon.com/images/M/MV5BZjdkOTU3MDktN2IxOS00OGEyLWFmMjktY2FiMmZkNWIyODZiXkEyXkFqcGdeQXVyMTMxODk2OTU@._V1_SX300.jpg' },
    { title: 'Dune',              rating: '8.0', year: '2021', poster: 'https://m.media-amazon.com/images/M/MV5BN2FjNmEyNWMtYzM0ZS00NjIyLTg5YzYtYThlMGVjNzE1OGViXkEyXkFqcGdeQXVyMTkxNjUyNQ@@._V1_SX300.jpg' },
    { title: 'Arrival',           rating: '7.9', year: '2016', poster: 'https://m.media-amazon.com/images/M/MV5BMTExMzU0ODcxNDheQTJeQWpwZ15BbWU4MDE1OTI4MzAy._V1_SX300.jpg' },
    { title: 'Ex Machina',        rating: '7.7', year: '2014', poster: 'https://m.media-amazon.com/images/M/MV5BMTUxNzc0OTIxMV5BMl5BanBnXkFtZTgwNDI3NzU2NDE@._V1_SX300.jpg' },
    { title: 'Inception',         rating: '8.8', year: '2010', poster: 'https://m.media-amazon.com/images/M/MV5BMjAxMzY3NjcxNF5BMl5BanBnXkFtZTcwNTI5OTM0Mw@@._V1_SX300.jpg' },
  ],
  Drama: [
    { title: 'The Shawshank Redemption', rating: '9.3', year: '1994', poster: 'https://m.media-amazon.com/images/M/MV5BNDE3ODcxYzMtY2YzZC00NmNlLWJiNDMtZDViZWM2MzIxZDYwXkEyXkFqcGdeQXVyNjAwNDUxODI@._V1_SX300.jpg' },
    { title: 'Fight Club',         rating: '8.8', year: '1999', poster: 'https://m.media-amazon.com/images/M/MV5BNDIzNDU0YzEtYzE5Ni00ZjlkLTk5ZjgtNjM3NWE4YzA3Nzk3XkEyXkFqcGdeQXVyMjUzOTY1NTc@._V1_SX300.jpg' },
    { title: 'Parasite',          rating: '8.5', year: '2019', poster: 'https://m.media-amazon.com/images/M/MV5BYWZjMjk3ZTItODQ2ZC00NTY5LWE0ZDYtZTI3MjcwN2Q5NTVkXkEyXkFqcGdeQXVyODk4OTc3MTY@._V1_SX300.jpg' },
    { title: 'Whiplash',          rating: '8.5', year: '2014', poster: 'https://m.media-amazon.com/images/M/MV5BOTA5NDZlZGUtMjAxOS00YTRkLTkwYmMtYWQ0NWEwZDZiNjEzXkEyXkFqcGdeQXVyMTMxODk2OTU@._V1_SX300.jpg' },
    { title: 'Forrest Gump',      rating: '8.8', year: '1994', poster: 'https://m.media-amazon.com/images/M/MV5BNWIwODRlZTUtY2U3ZS00Yzg1LWJhNzYtMmZiYmEyNmU1NjMzXkEyXkFqcGdeQXVyMTQxNzMzNDI@._V1_SX300.jpg' },
    { title: 'The Godfather',     rating: '9.2', year: '1972', poster: 'https://m.media-amazon.com/images/M/MV5BM2MyNjYxNmUtYTAwNi00MTYxLWJmNWYtYzZlODY3ZTk3OTFlXkEyXkFqcGdeQXVyNzkwMjQ5NzM@._V1_SX300.jpg' },
  ],
};

// ─── Component ────────────────────────────────────────────────────────────────
const HomeExplore = () => {
  const [activeGenre, setActiveGenre] = useState('Trending');
  const history = useHistory();
  const { openAuthModal, loginDemo } = useAuth();

  const fallback = "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='200' height='300' viewBox='0 0 200 300'%3E%3Crect width='200' height='300' fill='%231a1a2e'/%3E%3C/svg%3E";

  const handleMovieClick = (title) => {
    history.push({ pathname: '/recommend', state: { MovieName: title } });
  };

  const activeMovies = GENRE_MOVIES[activeGenre] || GENRE_MOVIES['Trending'];

  return (
    <div className="flix-home">

      {/* ── Hero Banners ─────────────────────────────────────────────── */}
      <section className="flix-hero">
        {HERO_MOVIES.map((movie, i) => (
          <div
            key={i}
            className="flix-hero-card"
            style={{ background: movie.color }}
            onClick={() => handleMovieClick(movie.seed)}
          >
            <img
              src={movie.poster}
              alt={movie.title}
              className="flix-hero-poster"
              onError={(e) => { e.target.onerror = null; e.target.src = fallback; }}
            />
            <div className="flix-hero-overlay">
              <h2 className="flix-hero-title">{movie.title}</h2>
              <p className="flix-hero-tagline">{movie.tagline}</p>
              <button className="flix-play-btn" id={`hero-play-${i}`}>
                <span className="flix-play-icon">▶</span>
                Get Recommendations
              </button>
            </div>
          </div>
        ))}
      </section>

      {/* ── Genre Tab Pills ──────────────────────────────────────────── */}
      <section className="flix-genre-bar">
        {GENRES.map((g) => (
          <button
            key={g.name}
            id={`genre-tab-${g.name.toLowerCase()}`}
            className={`flix-genre-pill ${activeGenre === g.name ? 'active' : ''}`}
            onClick={() => setActiveGenre(g.name)}
          >
            <span className="pill-icon">{g.icon}</span>
            {g.name}
          </button>
        ))}
      </section>

      {/* ── Trending Section ─────────────────────────────────────────── */}
      <section className="flix-trending">
        <div className="flix-trending-header">
          <h3 className="flix-trending-title">
            {activeGenre === 'Trending' ? '🔥 Trending Now' : `${GENRES.find(g => g.name === activeGenre)?.icon} ${activeGenre} Picks`}
          </h3>
          <div className="flix-trending-actions">
            <button className="flix-icon-btn" title="Sort" id="sort-btn">⇅</button>
            <button className="flix-icon-btn" title="Filter" id="filter-btn">⊞</button>
          </div>
        </div>

        <div className="flix-movie-row">
          {activeMovies.map((movie, idx) => (
            <div
              key={idx}
              className="flix-movie-card"
              id={`movie-card-${idx}`}
              onClick={() => handleMovieClick(movie.title)}
            >
              <div className="flix-card-poster">
                <img
                  src={movie.poster}
                  alt={movie.title}
                  onError={(e) => { e.target.onerror = null; e.target.src = fallback; }}
                />
                <div className="flix-card-hover-overlay">
                  <span className="flix-hover-play">▶</span>
                </div>
              </div>
              <div className="flix-card-info">
                <p className="flix-card-title">{movie.title}</p>
                <div className="flix-card-meta">
                  <span className="flix-card-rating">⭐ {movie.rating}</span>
                  <span className="flix-card-year">{movie.year}</span>
                </div>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* ── Search CTA ───────────────────────────────────────────────── */}
      <section className="flix-search-cta">
        <div className="flix-cta-content">
          <h3>🎯 Find Your Perfect Movie</h3>
          <p>Type any movie title to discover AI-powered cosine similarity recommendations</p>
          <div className="flix-cta-actions">
            <Link to="/" className="flix-cta-search-btn" id="cta-search">
              Search Movies
            </Link>
            <button className="flix-cta-demo-btn" id="cta-demo" onClick={() => loginDemo()}>
              ⚡ Try Demo Account
            </button>
          </div>
        </div>
      </section>

    </div>
  );
};

export default HomeExplore;
