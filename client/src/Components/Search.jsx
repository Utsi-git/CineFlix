import React, { useState, useEffect, useRef } from 'react';
import movie_list from "../movies_list";
import { Link, useHistory } from 'react-router-dom';
import axios from 'axios';

const OMDB_BASE_URL = "https://www.omdbapi.com/";
const OMDB_API_KEY = process.env.REACT_APP_OMDB_API_KEY || process.env.REACT_APP_API_KEY;

const Search = (props) => {
    const [formval, setformval] = useState("");
    const [Movies] = useState(movie_list);
    const [suggestions, setSuggestions] = useState([]);
    const history = useHistory();
    const debounceTimer = useRef(null);

    useEffect(() => {
        if (!formval || formval.trim().length < 2) {
            setSuggestions([]);
            return;
        }

        const query = formval.trim().toLowerCase();

        // 1. Instant local matches from movie_list
        const localMatches = Movies
            .filter((movie) => movie.toString().toLowerCase().includes(query))
            .slice(0, 4)
            .map(title => ({ Title: title, Year: "", Poster: "", Source: "local" }));

        setSuggestions(localMatches);

        // 2. Real-time OMDb API search with debounce
        if (debounceTimer.current) {
            clearTimeout(debounceTimer.current);
        }

        debounceTimer.current = setTimeout(async () => {
            try {
                const res = await axios.get(OMDB_BASE_URL, {
                    params: { s: formval.trim(), type: "movie", apikey: OMDB_API_KEY }
                });

                if (res.data && res.data.Response === "True" && res.data.Search) {
                    const omdbMatches = res.data.Search.slice(0, 8).map(m => ({
                        Title: m.Title,
                        Year: m.Year,
                        Poster: m.Poster && m.Poster !== "N/A" ? m.Poster : "",
                        Source: "omdb"
                    }));

                    // Merge and deduplicate by Title
                    const seen = new Set();
                    const merged = [];

                    for (const item of [...omdbMatches, ...localMatches]) {
                        const key = item.Title.toLowerCase();
                        if (!seen.has(key)) {
                            seen.add(key);
                            merged.push(item);
                        }
                    }

                    setSuggestions(merged.slice(0, 10));
                }
            } catch (err) {
                console.error("OMDb search autocomplete error:", err);
            }
        }, 220);

        return () => {
            if (debounceTimer.current) {
                clearTimeout(debounceTimer.current);
            }
        };
    }, [formval, Movies]);

    const handleSelectMovie = (title) => {
        setformval(title);
        setSuggestions([]);
        history.push({
            pathname: "/recommend",
            state: { MovieName: title }
        });
    };

    const handleKeyDown = (e) => {
        if (e.key === "Enter" && formval.trim()) {
            e.preventDefault();
            setSuggestions([]);
            history.push({
                pathname: "/recommend",
                state: { MovieName: formval.trim() }
            });
        }
    };

    const fallbackThumb = "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='32' height='48' viewBox='0 0 32 48'%3E%3Crect width='32' height='48' fill='%23333'/%3E%3C/svg%3E";

    return (
        <div className="search-section">
            <div className="Search-div">
                <div className="Search-Form">
                    <div className="input-field-autocomplete-holder">
                        <div className="search-input-wrapper">
                            <i className="fa fa-search search-icon-inside" aria-hidden="true"></i>
                            <input
                                className="input-field"
                                type="text"
                                onChange={(e) => setformval(e.target.value)}
                                onKeyDown={handleKeyDown}
                                value={formval}
                                placeholder="Search any movie in real-time (e.g. Inception, Dune, Oppenheimer, Avatar...)"
                                autoComplete="off"
                            />
                            {formval && (
                                <button
                                    type="button"
                                    className="search-clear-btn"
                                    onClick={() => { setformval(""); setSuggestions([]); }}
                                >
                                    &times;
                                </button>
                            )}
                        </div>

                        {formval && suggestions.length > 0 ? (
                            <div className="Search-Autocomplete">
                                {suggestions.map((item, index) => (
                                    <button
                                        key={index}
                                        type="button"
                                        className="autocomplete-item-btn"
                                        onClick={() => handleSelectMovie(item.Title)}
                                    >
                                        <div className="autocomplete-left">
                                            {item.Poster ? (
                                                <img
                                                    src={item.Poster}
                                                    alt=""
                                                    className="autocomplete-thumb"
                                                    onError={(e) => { e.target.onerror = null; e.target.src = fallbackThumb; }}
                                                />
                                            ) : (
                                                <div className="autocomplete-thumb placeholder">
                                                    <i className="fa fa-film"></i>
                                                </div>
                                            )}
                                            <span className="autocomplete-title">{item.Title}</span>
                                        </div>
                                        <div className="autocomplete-right">
                                            {item.Source === "omdb" && (
                                                <span className="source-tag">Live OMDb</span>
                                            )}
                                            {item.Year ? (
                                                <span className="autocomplete-year">{item.Year}</span>
                                            ) : null}
                                        </div>
                                    </button>
                                ))}
                            </div>
                        ) : null}
                    </div>

                    <Link
                        onClick={() => setSuggestions([])}
                        to={{
                            pathname: "/recommend",
                            state: { MovieName: formval.trim() || "Avatar" }
                        }}
                        className="submit-button"
                        aria-label="Submit search"
                    >
                        {'\u2192'}
                    </Link>
                </div>
            </div>
        </div>
    );
};

export default Search;
