import React, { useState, useEffect } from 'react';
import { useLocation } from 'react-router-dom';
import axios from 'axios';
import RecommendationTiles from "./RecommendationTiles";
import Spinner from "./Spinner";
import AboutMovie from "./AboutMovie";
import Accordian from './Accordian';

const OMDB_BASE_URL = "https://www.omdbapi.com/";
const OMDB_API_KEY = process.env.REACT_APP_OMDB_API_KEY || process.env.REACT_APP_API_KEY;

// Helper function to query OMDb API with multiple fallbacks
async function fetchOmdbMovie(title) {
  if (!title) return null;
  const cleanTitle = title.trim();

  try {
    // 1. Exact title lookup
    let res = await axios.get(OMDB_BASE_URL, {
      params: { t: cleanTitle, apikey: OMDB_API_KEY, plot: "full" }
    });
    if (res.data && res.data.Response === "True") {
      return res.data;
    }

    // 2. Search by title
    res = await axios.get(OMDB_BASE_URL, {
      params: { s: cleanTitle, type: "movie", apikey: OMDB_API_KEY }
    });
    if (res.data && res.data.Response === "True" && res.data.Search && res.data.Search.length > 0) {
      const idRes = await axios.get(OMDB_BASE_URL, {
        params: { i: res.data.Search[0].imdbID, apikey: OMDB_API_KEY, plot: "full" }
      });
      if (idRes.data && idRes.data.Response === "True") {
        return idRes.data;
      }
    }

    // 3. Fallback: normalize title (e.g. "Fantastic 4:" -> "Fantastic Four:", or strip subtitle)
    const normalizedTitle = cleanTitle
      .replace(/ 4:/g, " Four:")
      .replace(/ 4 /g, " Four ")
      .replace(/ 2:/g, " II:")
      .replace(/ 3:/g, " III:");

    const baseTitle = cleanTitle.includes(":") ? cleanTitle.split(":")[0] : null;

    for (const alt of [normalizedTitle, baseTitle].filter(Boolean)) {
      if (alt === cleanTitle) continue;
      const altSearch = await axios.get(OMDB_BASE_URL, {
        params: { s: alt, type: "movie", apikey: OMDB_API_KEY }
      });
      if (altSearch.data && altSearch.data.Response === "True" && altSearch.data.Search && altSearch.data.Search.length > 0) {
        const altIdRes = await axios.get(OMDB_BASE_URL, {
          params: { i: altSearch.data.Search[0].imdbID, apikey: OMDB_API_KEY, plot: "full" }
        });
        if (altIdRes.data && altIdRes.data.Response === "True") {
          return altIdRes.data;
        }
      }
    }
  } catch (err) {
    console.error("Error fetching OMDb data for:", title, err);
  }

  // Graceful fallback object if movie is not found in OMDb
  return {
    Title: title,
    Year: "N/A",
    Rated: "PG-13",
    Released: "N/A",
    Runtime: "N/A",
    Genre: "Movie",
    Director: "N/A",
    Writer: "N/A",
    Actors: "N/A",
    Plot: "Movie details and recommendations are available below.",
    Poster: "N/A",
    Ratings: [],
    imdbRating: "N/A",
    imdbVotes: "N/A",
    Metascore: "N/A",
    BoxOffice: "N/A",
    Response: "False"
  };
}

// Extract structured cast and crew list from OMDb data
function extractCastData(movieData) {
  if (!movieData) return [];
  const castList = [];

  // Actors
  if (movieData.Actors && movieData.Actors !== "N/A") {
    movieData.Actors.split(",").forEach(name => {
      const trimmed = name.trim();
      if (trimmed) {
        castList.push({
          name: trimmed,
          character: "Lead Cast",
          role: "Actor",
          profile_path: `https://ui-avatars.com/api/?name=${encodeURIComponent(trimmed)}&background=1e293b&color=ef4444&size=200&bold=true`
        });
      }
    });
  }

  // Director
  if (movieData.Director && movieData.Director !== "N/A") {
    movieData.Director.split(",").forEach(name => {
      const trimmed = name.trim();
      if (trimmed && !castList.some(c => c.name === trimmed)) {
        castList.push({
          name: trimmed,
          character: "Director",
          role: "Director",
          profile_path: `https://ui-avatars.com/api/?name=${encodeURIComponent(trimmed)}&background=0f172a&color=38bdf8&size=200&bold=true`
        });
      }
    });
  }

  // Writer
  if (movieData.Writer && movieData.Writer !== "N/A") {
    movieData.Writer.split(",").forEach(name => {
      const trimmed = name.trim().replace(/\s*\([^)]*\)/g, "");
      if (trimmed && !castList.some(c => c.name === trimmed)) {
        castList.push({
          name: trimmed,
          character: "Writer",
          role: "Writer",
          profile_path: `https://ui-avatars.com/api/?name=${encodeURIComponent(trimmed)}&background=18181b&color=a855f7&size=200&bold=true`
        });
      }
    });
  }

  return castList;
}

const Recommendations = () => {
  const location = useLocation();
  const [recommendationsData, setRecommendationsData] = useState(null);
  const [toggle, setToggle] = useState(false);

  const queryTitle = new URLSearchParams(location.search).get('title');
  const movieName = (location.state && location.state.MovieName) || queryTitle || "Avatar";

  useEffect(() => {
    let isMounted = true;

    async function getAllData() {
      setRecommendationsData(null);
      try {
        // 1. Fetch movie details from OMDb
        const movieDetails = await fetchOmdbMovie(movieName);

        // 2. Fetch recommendations from Flask backend
        let movieRecommendations = {};
        try {
          const recRes = await axios.post("/api/recommend/", { title: String(movieName) });
          movieRecommendations = recRes.data || {};
        } catch (e) {
          console.error("Backend recommendations request failed:", e);
        }

        // If backend returned empty, use client-side real-time OMDb search
        if (Object.keys(movieRecommendations).length === 0 && movieDetails) {
          const keyword = (movieName.split(':')[0] || movieName).trim();
          try {
            const fallbackSearch = await axios.get(OMDB_BASE_URL, {
              params: { s: keyword, type: "movie", apikey: OMDB_API_KEY }
            });
            if (fallbackSearch.data && fallbackSearch.data.Search) {
              fallbackSearch.data.Search.forEach(item => {
                if (item.Title.toLowerCase() !== movieName.toLowerCase() && !movieRecommendations[item.Title]) {
                  movieRecommendations[item.Title] = item.Year || "N/A";
                }
              });
            }
          } catch (err) {
            console.error("Client fallback recommendation search error:", err);
          }
        }

        // 3. Fetch details for each recommended movie concurrently
        const keys = Object.keys(movieRecommendations);
        const topKeys = keys.slice(0, 10);
        const recommendationDetails = await Promise.all(
          topKeys.map(key => fetchOmdbMovie(key))
        );

        const castData = extractCastData(movieDetails);

        const finalDetailsObj = {
          MovieDetails: movieDetails,
          MovieRecommendations: movieRecommendations,
          MovieRecommendationDetails: recommendationDetails,
          MovieCast: { data: { cast: castData } },
          MovieMetadata: movieDetails
        };

        if (isMounted) {
          setRecommendationsData(finalDetailsObj);
        }
      } catch (e) {
        console.error("Error in getAllData:", e);
      }
    }

    getAllData();

    return () => {
      isMounted = false;
    };
  }, [movieName, toggle]);

  function printRecommendationTiles() {
    if (!recommendationsData || !recommendationsData.MovieRecommendations) return null;
    const keys = Object.keys(recommendationsData.MovieRecommendations);
    const tiles = [];

    for (let i = 0; i < Math.min(keys.length, recommendationsData.MovieRecommendationDetails.length, 10); i++) {
      const recMovie = recommendationsData.MovieRecommendationDetails[i];
      const poster = recMovie && recMovie.Poster && recMovie.Poster !== "N/A" ? recMovie.Poster : null;

      tiles.push(
        <RecommendationTiles
          key={keys[i] || i}
          PosterPath={poster}
          MovieName={keys[i]}
          setToggle={() => setToggle(prev => !prev)}
        />
      );
    }

    return tiles;
  }

  return (
    <>
      {recommendationsData ? (
        <div className="Recommendations-Page">
          <AboutMovie
            Details={recommendationsData.MovieDetails}
            MovieName={movieName}
            MovieMetadata={recommendationsData.MovieMetadata}
          />
          <Accordian
            CastData={recommendationsData.MovieCast?.data?.cast || []}
          />
          <h2 className="Recommendation-title">Movie Recommendations</h2>
          <div className="Recommendations-holder">
            {printRecommendationTiles()}
          </div>
        </div>
      ) : (
        <Spinner />
      )}
    </>
  );
};

export default Recommendations;
