import React from 'react';
import { Link } from 'react-router-dom';

const RecommendationTiles = (props) => {
    const fallbackPoster = "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='200' height='300' viewBox='0 0 200 300'%3E%3Crect width='200' height='300' fill='%231a1a1a'/%3E%3Ccircle cx='100' cy='120' r='35' fill='%23333'/%3E%3Cpath d='M90 105 L115 120 L90 135 Z' fill='%23777'/%3E%3Ctext x='50%25' y='180' dominant-baseline='middle' text-anchor='middle' fill='%23aaa' font-family='sans-serif' font-size='13' font-weight='bold'%3ENo Poster%3C/text%3E%3C/svg%3E";

    return (
        <div className="Recommendation_Tiles">
            <div className="image-holder">
                <img
                    alt={props.MovieName}
                    src={props.PosterPath && props.PosterPath !== 'N/A' ? props.PosterPath : fallbackPoster}
                    onError={(e) => {
                        e.target.onerror = null;
                        e.target.src = fallbackPoster;
                    }}
                />
            </div>
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
            >
                <p title={props.MovieName}>{props.MovieName}</p>
            </Link>
        </div>
    );
};

export default RecommendationTiles;
