import random
from typing import List, Dict, Any
from model import df, get_recommendations, fetch_omdb_movie_meta
from aws_services import aws_manager

GENRE_SAMPLE_SEEDS = {
    "action": ["The Dark Knight", "Mad Max: Fury Road", "Gladiator", "John Wick", "Die Hard"],
    "sci-fi": ["Inception", "Interstellar", "The Matrix", "Blade Runner 2049", "Arrival"],
    "drama": ["The Shawshank Redemption", "Forrest Gump", "Fight Club", "The Godfather", "Whiplash"],
    "thriller": ["Se7en", "Shutter Island", "Gone Girl", "Memento", "Parasite"],
    "comedy": ["The Grand Budapest Hotel", "Superbad", "The Truman Show", "Deadpool", "Groundhog Day"],
    "horror": ["A Quiet Place", "Get Out", "The Shining", "Hereditary", "The Conjuring"],
    "animation": ["Spider-Man: Into the Spider-Verse", "Spirited Away", "WALL-E", "Coco", "Toy Story"],
    "adventure": ["The Lord of the Rings: The Fellowship of the Ring", "Avatar", "Jurassic Park", "Pirates of the Caribbean", "Raiders of the Lost Ark"],
    "romance": ["La La Land", "Titanic", "Eternal Sunshine of the Spotless Mind", "Before Sunrise", "About Time"],
}

def get_user_personalized_recommendations(user_id: str) -> List[Dict[str, Any]]:
    """
    Generates tailored movie recommendations for a user based on:
    1. Their highest rated movies (from DynamoDB ratings table)
    2. Their favorite genres selected in their profile
    3. Their saved watchlist
    """
    profile = aws_manager.get_user_profile(user_id) or {}
    ratings = aws_manager.get_user_ratings(user_id) or []
    watchlist = aws_manager.get_user_watchlist(user_id) or []

    fav_genres = [g.lower().strip() for g in profile.get("favoriteGenres", ["Action", "Sci-Fi"])]

    # Movies to avoid recommending again (already rated or in watchlist)
    seen_titles = set()
    for r in ratings:
        if r.get("title"):
            seen_titles.add(r["title"].lower().strip())
    for w in watchlist:
        if w.get("title"):
            seen_titles.add(w["title"].lower().strip())

    candidates = []
    recommended_seen = set()

    # 1. Recommendation based on user's highest rated movies (rating >= 7)
    high_rated = sorted(
        [r for r in ratings if float(r.get("rating", 0)) >= 7.0],
        key=lambda x: float(x.get("rating", 0)),
        reverse=True
    )

    for movie in high_rated[:3]:
        title = movie.get("title")
        if not title:
            continue
        try:
            recs_df = get_recommendations(title)
            if recs_df is not None and not recs_df.empty:
                for _, row in recs_df.iterrows():
                    rec_title = str(row["Title"]).strip()
                    rec_lower = rec_title.lower()
                    if rec_lower not in seen_titles and rec_lower not in recommended_seen:
                        recommended_seen.add(rec_lower)
                        candidates.append({
                            "title": rec_title,
                            "year": str(row.get("Year", "N/A")),
                            "reason": f"Because you loved {title} ({movie.get('rating')}/10)",
                            "badge": "Taste Match"
                        })
        except Exception as e:
            print(f"[Personalization] Error getting recommendations for {title}: {e}")

    # 2. Recommendation based on profile favorite genres
    genre_seeds = []
    for g in fav_genres:
        if g in GENRE_SAMPLE_SEEDS:
            genre_seeds.extend([(g, s) for s in GENRE_SAMPLE_SEEDS[g]])

    random.shuffle(genre_seeds)
    for genre_name, seed_movie in genre_seeds[:4]:
        try:
            recs_df = get_recommendations(seed_movie)
            if recs_df is not None and not recs_df.empty:
                for _, row in recs_df.iterrows():
                    rec_title = str(row["Title"]).strip()
                    rec_lower = rec_title.lower()
                    if rec_lower not in seen_titles and rec_lower not in recommended_seen:
                        recommended_seen.add(rec_lower)
                        candidates.append({
                            "title": rec_title,
                            "year": str(row.get("Year", "N/A")),
                            "reason": f"Matches your favorite genre: {genre_name.title()}",
                            "badge": f"{genre_name.title()} Pick"
                        })
                    if len(candidates) >= 12:
                        break
        except Exception as e:
            print(f"[Personalization] Error with seed {seed_movie}: {e}")

    # 3. Fallback if new user or sparse profile
    if len(candidates) < 8:
        sample_pool = ["Inception", "Interstellar", "Dune", "The Matrix", "The Dark Knight", "Gladiator", "Arrival", "Oppenheimer"]
        for pool_title in sample_pool:
            if pool_title.lower() not in seen_titles and pool_title.lower() not in recommended_seen:
                recommended_seen.add(pool_title.lower())
                candidates.append({
                    "title": pool_title,
                    "year": "N/A",
                    "reason": "Popular among movie lovers with similar taste",
                    "badge": "Trending"
                })

    return candidates[:12]
