import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import axios from '../services/api';

const OMDB_BASE_URL = "https://www.omdbapi.com/";
const OMDB_API_KEY = process.env.REACT_APP_OMDB_API_KEY || process.env.REACT_APP_API_KEY || "7acedfb7";

const RecommendationTiles = (props) => {
    const [poster, setPoster] = useState(
        props.PosterPath && props.PosterPath !== 'N/A' ? props.PosterPath : null
    );

    useEffect(() => {
        if (props.PosterPath && props.PosterPath !== 'N/A') {
            setPoster(props.PosterPath);
            return;
        }

        let isMounted = true;
        const fetchPoster = async () => {
            if (!props.MovieName) return;
            try {
                const clean = String(props.MovieName).trim();
                let res = await axios.get(OMDB_BASE_URL, {
                    params: { t: clean, apikey: OMDB_API_KEY }
                });
                if (res.data?.Response === 'True' && res.data.Poster && res.data.Poster !== 'N/A') {
                    if (isMounted) setPoster(res.data.Poster);
                    return;
                }
                // Fallback search by title
                res = await axios.get(OMDB_BASE_URL, {
                    params: { s: clean, type: 'movie', apikey: OMDB_API_KEY }
                });
                if (res.data?.Response === 'True' && res.data.Search?.[0]?.Poster && res.data.Search[0].Poster !== 'N/A') {
                    if (isMounted) setPoster(res.data.Search[0].Poster);
                }
            } catch (err) {
                // Silently fallback to placeholder
            }
        };

        fetchPoster();
        return () => { isMounted = false; };
    }, [props.PosterPath, props.MovieName]);

    const fallbackPoster = "https://images.unsplash.com/photo-1489599849927-2ee91cede3ba?auto=format&fit=crop&w=400&q=80";

    return (
        <div className="Recommendation_Tiles">
            <Link
                onClick={() => {
                    if (props.setToggle) {
                        props.setToggle();
                    }
                }}
                to={{
                    pathname: "/recommend",
                    state: { MovieName: props.MovieName }
                }}
                className="rec-tile-link"
            >
                <div className="image-holder">
                    <img
                        alt={props.MovieName}
                        src={poster || fallbackPoster}
                        onError={(e) => {
                            e.target.onerror = null;
                            e.target.src = fallbackPoster;
                        }}
                    />
                </div>
                <div className="rec-tile-title-box">
                    <p title={props.MovieName}>{props.MovieName}</p>
                </div>
            </Link>
        </div>
    );
};

export default RecommendationTiles;
