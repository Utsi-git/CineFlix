import pickle
import pandas as pd
from sklearn.metrics.pairwise import cosine_similarity
import urllib.request
import urllib.parse
import json
import os

df = pickle.load(open("./prepeared_df.pkl", "rb"))
count_model = pickle.load(open("./count_model.pkl", "rb"))

count_matrix = count_model.fit_transform(df['soup'])
df = df.reset_index()

indices = pd.Series(df.index, index=df['title'])
all_titles = [df['title'][i] for i in range(len(df['title']))]

OMDB_API_KEY = os.environ.get("OMDB_API_KEY")

def fetch_omdb_movie_meta(title):
    """Fetch movie details in real-time from OMDb API."""
    try:
        url = f"https://www.omdbapi.com/?t={urllib.parse.quote(title)}&apikey={OMDB_API_KEY}&plot=full"
        req = urllib.request.Request(url, headers={'User-Agent': 'Mozilla/5.0'})
        res = json.loads(urllib.request.urlopen(req, timeout=5).read().decode())
        if res.get('Response') == 'True':
            return res

        # Fallback to search
        s_url = f"https://www.omdbapi.com/?s={urllib.parse.quote(title)}&type=movie&apikey={OMDB_API_KEY}"
        s_req = urllib.request.Request(s_url, headers={'User-Agent': 'Mozilla/5.0'})
        s_res = json.loads(urllib.request.urlopen(s_req, timeout=5).read().decode())
        if s_res.get('Response') == 'True' and s_res.get('Search'):
            imdb_id = s_res['Search'][0]['imdbID']
            id_url = f"https://www.omdbapi.com/?i={imdb_id}&apikey={OMDB_API_KEY}&plot=full"
            id_req = urllib.request.Request(id_url, headers={'User-Agent': 'Mozilla/5.0'})
            return json.loads(urllib.request.urlopen(id_req, timeout=5).read().decode())
    except Exception as e:
        print(f"[OMDb API Error] {e}")
    return None

def fetch_omdb_franchise_movies(query):
    """Fetch related franchise movies from OMDb."""
    try:
        url = f"https://www.omdbapi.com/?s={urllib.parse.quote(query)}&type=movie&apikey={OMDB_API_KEY}"
        req = urllib.request.Request(url, headers={'User-Agent': 'Mozilla/5.0'})
        data = json.loads(urllib.request.urlopen(req, timeout=5).read().decode())
        if data.get('Response') == 'True' and data.get('Search'):
            return data['Search']
    except Exception:
        pass
    return []

def get_recommendations(title):
    """
    Real-time dynamic recommendation engine:
    1. If the movie exists in the local pre-trained corpus, uses cosine similarity.
    2. If it's a new or real-time movie, queries OMDb API in real-time, extracts
       live attributes (Director, Actors, Genre, Plot), vectorizes a dynamic soup,
       and computes real-time cosine similarity + franchise matching.
    """
    clean_title = title.strip()
    idx = None

    if clean_title in indices:
        idx = indices[clean_title]
        if hasattr(idx, 'iloc'):
            idx = idx.iloc[0]
    else:
        matches = df[df['title'].str.lower() == clean_title.lower()]
        if not matches.empty:
            idx = matches.index[0]

    # Local match found
    if idx is not None:
        sim_scores = cosine_similarity(count_matrix[idx], count_matrix)[0]
        sim_scores = list(enumerate(sim_scores))
        sim_scores = sorted(sim_scores, key=lambda a: a[1], reverse=True)
        sim_scores = sim_scores[1:11]
        movie_indices = [i[0] for i in sim_scores]
        tit = df['title'].iloc[movie_indices].values
        dat = df['release_date'].iloc[movie_indices].values
        return pd.DataFrame({'Title': tit, 'Year': dat})

    # Real-Time Mode with OMDb API
    omdb_meta = fetch_omdb_movie_meta(clean_title)
    recommendations_list = []

    if omdb_meta:
        # Check franchise keywords (e.g. "Dune", "Avatar", "Spider-Man", "Batman")
        base_keyword = clean_title.split(':')[0].split('-')[0].strip()
        if len(base_keyword) >= 4 and base_keyword.lower() != clean_title.lower():
            franchise_movies = fetch_omdb_franchise_movies(base_keyword)
            for fm in franchise_movies:
                fm_title = fm.get('Title')
                if (fm_title and 
                    fm_title.lower() != clean_title.lower() and 
                    fm_title not in [r['Title'] for r in recommendations_list]):
                    recommendations_list.append({
                        'Title': fm_title,
                        'Year': str(fm.get('Year', 'N/A'))
                    })
                if len(recommendations_list) >= 3:
                    break

        director = omdb_meta.get('Director', '').replace(',', ' ')
        actors = omdb_meta.get('Actors', '').replace(',', ' ')
        genre = omdb_meta.get('Genre', '').replace(',', ' ')
        plot = omdb_meta.get('Plot', '')
        dynamic_soup = f"{director} {actors} {genre} {plot}"

        try:
            new_vec = count_model.transform([dynamic_soup])
            sim_scores = cosine_similarity(new_vec, count_matrix)[0]
            sim_scores = list(enumerate(sim_scores))
            sim_scores = sorted(sim_scores, key=lambda a: a[1], reverse=True)

            for i, score in sim_scores:
                cand_title = df['title'].iloc[i]
                cand_date = df['release_date'].iloc[i]
                if (cand_title.lower() != clean_title.lower() and 
                    cand_title not in [r['Title'] for r in recommendations_list]):
                    recommendations_list.append({
                        'Title': cand_title,
                        'Year': str(cand_date)
                    })
                if len(recommendations_list) >= 10:
                    break
        except Exception as e:
            print(f"[Vectorization Error] {e}")

    # Fallback if no recommendations generated
    if not recommendations_list:
        fallback_df = df.sample(min(10, len(df)))
        return pd.DataFrame({
            'Title': fallback_df['title'].values,
            'Year': fallback_df['release_date'].values
        })

    return pd.DataFrame(recommendations_list[:10])
