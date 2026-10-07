import React from 'react';

const Cast = (props) => {
    const name = props.MovieCast?.name || 'Cast Member';
    const role = props.MovieCast?.character || props.MovieCast?.role || 'Actor';
    const fallbackAvatar = `https://ui-avatars.com/api/?name=${encodeURIComponent(name)}&background=1e293b&color=ef4444&size=200&bold=true`;
    const avatarSrc = props.MovieCast?.profile_path || fallbackAvatar;

    return (
        <div className="Cast-Tile">
            <div className="cast-image">
                <img
                    src={avatarSrc}
                    alt={name}
                    onError={(e) => {
                        e.target.onerror = null;
                        e.target.src = fallbackAvatar;
                    }}
                />
            </div>
            <div className="cast-name">
                <h5 title={name}>{name}</h5>
                <h6>{role}</h6>
            </div>
        </div>
    );
};

export default Cast;
