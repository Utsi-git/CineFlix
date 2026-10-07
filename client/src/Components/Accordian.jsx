import React, { useState, useEffect, useRef } from 'react';
import Cast from "./Cast";

const Accordian = (props) => {
    const [iscollapsed, setiscollapsed] = useState(false);
    const content = useRef(null);

    function toggleheight() {
        setiscollapsed(!iscollapsed);
    }

    useEffect(() => {
        if (content.current) {
            content.current.style.maxHeight = iscollapsed ? `${content.current.scrollHeight}px` : '350px';
        }
    }, [iscollapsed]);

    const castList = props.CastData || [];

    if (castList.length === 0) {
        return null;
    }

    return (
        <div className="Accordian-holder">
            <div className="accordian-holder-inner">
                <h2 className="cast-heading">Cast & Crew</h2>
                {castList.length > 5 && (
                    <button onClick={toggleheight} aria-label="Toggle cast view">
                        {!iscollapsed ?
                            <i className="fa fa-angle-double-down fa-lg fa-3x" aria-hidden="true"></i>
                            :
                            <i className="fa fa-angle-double-up fa-lg fa-3x" aria-hidden="true"></i>
                        }
                    </button>
                )}
            </div>
            <div className="inner-div cast-holder Accordian-content" ref={content}>
                {castList.map((item, index) => {
                    if (index < 15) {
                        return (
                            <Cast
                                key={index}
                                MovieCast={item}
                            />
                        );
                    }
                    return null;
                })}
            </div>
        </div>
    );
};

export default Accordian;
