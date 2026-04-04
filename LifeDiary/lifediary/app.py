from flask import Flask, render_template, request, jsonify, session, redirect, url_for
import json
import os
import uuid
from datetime import datetime
from werkzeug.security import generate_password_hash, check_password_hash
from mood_analysis import analyze_entry
app = Flask(__name__)
app.secret_key = "life_diary_secret_key" # Change this to a real secret key

# Get the base directory of the project
BASE_DIR = os.path.dirname(os.path.abspath(__file__))
DATA_FILE = os.path.join(BASE_DIR, "data.json")
USERS_FILE = os.path.join(BASE_DIR, "users.json")

def load_data():
    if os.path.exists(DATA_FILE):
        try:
            with open(DATA_FILE, "r") as f:
                content = f.read().strip()
                if not content:
                    return {}
                return json.loads(content)
        except json.JSONDecodeError:
            print(f"DEBUG: Corrupted {DATA_FILE}, resetting to {{}}")
            return {}
    return {}

def save_data(data):
    with open(DATA_FILE, "w") as f:
        json.dump(data, f)

def load_users():
    if os.path.exists(USERS_FILE):
        try:
            with open(USERS_FILE, "r") as f:
                content = f.read().strip()
                if not content:
                    return []
                return json.loads(content)
        except json.JSONDecodeError:
            print(f"DEBUG: Corrupted {USERS_FILE}, resetting to []")
            return []
    return []

def save_users(users):
    with open(USERS_FILE, "w") as f:
        json.dump(users, f)

@app.route("/")
def home():
    return render_template("index.html")

@app.route("/signup", methods=["POST"])
def signup():
    content = request.json
    username = content.get("username")
    password = content.get("password")
    
    if not username or not password:
        return jsonify({"success": False, "error": "Username and password required"}), 400
    
    users = load_users()
    if any(u["username"] == username for u in users):
        return jsonify({"success": False, "error": "Username already exists"}), 400
    
    user_id = str(uuid.uuid4())
    hashed_password = generate_password_hash(password)
    
    new_user = {
        "id": user_id,
        "username": username,
        "password": hashed_password
    }
    
    users.append(new_user)
    save_users(users)
    
    return jsonify({"success": True})

@app.route("/login", methods=["POST"])
def login():
    content = request.json
    username = content.get("username")
    password = content.get("password")
    
    users = load_users()
    user = next((u for u in users if u["username"] == username), None)
    
    if user and check_password_hash(user["password"], password):
        session["user_id"] = user["id"]
        session["username"] = user["username"]
        return jsonify({"success": True, "username": username})
    
    return jsonify({"success": False, "error": "Invalid username or password"}), 401

@app.route("/logout")
def logout():
    session.clear()
    return jsonify({"success": True})

@app.route("/check_auth")
def check_auth():
    if "user_id" in session:
        users = load_users()
        user = next((u for u in users if u["id"] == session["user_id"]), None)
        profile_photo = user.get("profile_photo") if user else None
        return jsonify({
            "authenticated": True, 
            "username": session["username"],
            "profile_photo": profile_photo
        })
    return jsonify({"authenticated": False})

@app.route("/upload_profile_photo", methods=["POST"])
def upload_profile_photo():
    if "user_id" not in session:
        return jsonify({"success": False, "error": "Unauthorized"}), 401
    
    content = request.json
    photo_data = content.get("photo")
    
    if not photo_data:
        return jsonify({"success": False, "error": "No photo data provided"}), 400
    
    users = load_users()
    for user in users:
        if user["id"] == session["user_id"]:
            user["profile_photo"] = photo_data
            break
    
    save_users(users)
    return jsonify({"success": True})

@app.route("/save_entry", methods=["POST"])
def save_entry():
    if "user_id" not in session:
        return jsonify({"success": False, "error": "Unauthorized"}), 401
    
    user_id = session["user_id"]
    content = request.json
    text = content["text"]
    pages = content.get("pages", [text])
    page_timestamps = content.get("page_timestamps", [datetime.now().strftime("%Y-%m-%d %H:%M")] * len(pages))
    entry_id = content.get("id")
    title = content.get("title", "")
    date_str = content.get("date") or datetime.now().strftime("%Y-%m-%d %H:%M")

    analysis = analyze_entry(text)

    mood = analysis["mood"]
    numerical_score = analysis["score"]
    emotion = analysis["emotion"]
    all_emotions = analysis["all_emotions"]

    entry = {
    "id": entry_id or str(uuid.uuid4()),
    "date": date_str,
    "text": text,
    "pages": pages,
    "page_timestamps": page_timestamps,
    "mood": mood,
    "mood_score": numerical_score,
    "emotion": emotion,              # NEW
    "all_emotions": all_emotions,    # NEW
    "title": title
}

    data = load_data()
    user_entries = data.get(user_id, [])
    
    if entry_id:
        # Update existing entry by ID
        found = False
        for i, existing in enumerate(user_entries):
            if existing.get("id") == entry_id:
                user_entries[i] = entry
                found = True
                break
        if not found:
            user_entries.append(entry)
    else:
        # Append new entry
        user_entries.append(entry)
    
    # Sort entries by date string (YYYY-MM-DD HH:mm) descending (newest first)
    user_entries.sort(key=lambda x: x.get("date", ""), reverse=True)
    
    data[user_id] = user_entries
    save_data(data)

    return jsonify({"mood": mood, "score": numerical_score})

@app.route("/get_entries")
def get_entries():
    if "user_id" not in session:
        print("DEBUG: get_entries - User not in session")
        return jsonify({"success": False, "error": "Unauthorized"}), 401
    
    user_id = session["user_id"]
    print(f"DEBUG: get_entries - Loading data for user: {user_id}")
    try:
        data = load_data()
        user_entries = data.get(user_id, [])
        print(f"DEBUG: get_entries - Found {len(user_entries)} entries")
        
        # Ensure they are sorted when returning as well, just in case
        user_entries.sort(key=lambda x: x.get("date", ""), reverse=True)
        return jsonify(user_entries)
    except Exception as e:
        print(f"DEBUG: get_entries - ERROR: {str(e)}")
        return jsonify({"success": False, "error": str(e)}), 500

@app.route("/delete_entry", methods=["POST"])
def delete_entry():
    if "user_id" not in session:
        return jsonify({"success": False, "error": "Unauthorized"}), 401
    
    user_id = session["user_id"]
    content = request.json
    entry_id = content.get("id")
    
    data = load_data()
    user_entries = data.get(user_id, [])
    
    initial_len = len(user_entries)
    user_entries = [e for e in user_entries if e.get("id") != entry_id]
    
    if len(user_entries) < initial_len:
        data[user_id] = user_entries
        save_data(data)
        return jsonify({"success": True})
    
    return jsonify({"success": False, "error": "Entry not found"}), 404

@app.route("/clear_storage", methods=["POST"])
def clear_storage():
    if "user_id" not in session:
        return jsonify({"success": False, "error": "Unauthorized"}), 401
    
    user_id = session["user_id"]
    data = load_data()
    if user_id in data:
        data[user_id] = []
        save_data(data)
    
    return jsonify({"success": True})

@app.route("/delete_account", methods=["POST"])
def delete_account():
    if "user_id" not in session:
        return jsonify({"success": False, "error": "Unauthorized"}), 401
    
    user_id = session["user_id"]
    
    # Remove user entries
    data = load_data()
    if user_id in data:
        del data[user_id]
        save_data(data)
    
    # Remove user from users list
    users = load_users()
    users = [u for u in users if u["id"] != user_id]
    save_users(users)
    
    session.clear()
    return jsonify({"success": True})

@app.route("/change_password", methods=["POST"])
def change_password():
    if "user_id" not in session:
        return jsonify({"success": False, "error": "Unauthorized"}), 401
    
    user_id = session["user_id"]
    content = request.json
    old_password = content.get("old_password")
    new_password = content.get("new_password")
    
    users = load_users()
    for user in users:
        if user["id"] == user_id:
            if check_password_hash(user["password"], old_password):
                user["password"] = generate_password_hash(new_password)
                save_users(users)
                return jsonify({"success": True})
            else:
                return jsonify({"success": False, "error": "Old password incorrect"}), 400
    
    return jsonify({"success": False, "error": "User not found"}), 404

@app.route("/analyze_mood", methods=["POST"])
def analyze_mood():
    content = request.json
    text = content.get("text", "")
    analysis = analyze_entry(text)
    return jsonify(analysis)

if __name__ == "__main__":
    app.run(debug=True, port=8000)