from vaderSentiment.vaderSentiment import SentimentIntensityAnalyzer

analyzer = SentimentIntensityAnalyzer()

# ==============================
# Emotion Keyword Dictionary
# ==============================
emotion_keywords = {
    "Joy 😄": [
        "happy", "excited", "great", "amazing", "fun", "love",
        "good", "grateful", "awesome", "nice", "enjoy"
    ],
    "Sadness 😢": [
        "sad", "tired", "down", "depressed", "lonely",
        "unhappy", "cry", "upset", "hurt"
    ],
    "Anger 😡": [
        "angry", "mad", "frustrated", "annoyed",
        "hate", "irritated", "furious"
    ],
    "Anxiety 😨": [
        "nervous", "worried", "anxious", "stress",
        "overwhelmed", "scared", "afraid"
    ],
    "Calm 😌": [
        "calm", "relaxed", "peaceful", "okay",
        "fine", "content", "chill"
    ]
}

# ==============================
# Main Emotion Detection
# ==============================
def detect_emotion(text):
    if not text.strip():
        return "Neutral 😐"

    text_lower = text.lower()
    # Count keyword matches
    emotion_scores = {emotion: 0 for emotion in emotion_keywords}

    for emotion, keywords in emotion_keywords.items():
        for word in keywords:
            if word in text_lower:
                emotion_scores[emotion] += 1

    # Find highest scoring emotion
    detected_emotion = max(emotion_scores, key=emotion_scores.get)

    # If no keywords matched → fallback to VADER
    if emotion_scores[detected_emotion] == 0:
        compound = analyzer.polarity_scores(text)["compound"]

        if compound >= 0.6:
            return "Joy 😄"
        elif compound >= 0.2:
            return "Happy 🙂"
        elif compound > -0.2:
            return "Neutral 😐"
        elif compound > -0.6:
            return "Sad 😕"
        else:
            return "Sadness 😢"

    return detected_emotion

# ==============================
# Multiple Emotions Detection
# ==============================
def detect_multiple_emotions(text):
    if not text.strip():
        return ["Neutral 😐"]

    text_lower = text.lower()
    results = []

    for emotion, keywords in emotion_keywords.items():
        if any(word in text_lower for word in keywords):
            results.append(emotion)

    return results if results else ["Neutral 😐"]

# ==============================
# Mood Score (0–100) — Emotion-Aware
# ==============================
def get_mood_score(text, detected_emotion=None):
    if not text.strip():
        return 50

    # VADER compound score
    compound = analyzer.polarity_scores(text)["compound"]
    score = int((compound + 1) / 2 * 100)  # 0–100

    # Emotion-aware adjustment
    negative_emotions = ["Sadness 😢", "Anger 😡", "Anxiety 😨"]
    positive_emotions = ["Joy 😄", "Calm 😌"]

    if detected_emotion in negative_emotions:
        score = max(0, score - 5)   # Reduce negative emotions slightly
    elif detected_emotion in positive_emotions:
        score = min(100, score + 10) # Boost positive emotions slightly

    return score

# ==============================
# Overall Mood Label
# ==============================
def detect_mood(text):
    if not text.strip():
        return "Neutral 😐"

    compound = analyzer.polarity_scores(text)["compound"]

    if compound >= 0.6:
        return "Very Happy 😄"
    elif compound >= 0.2:
        return "Happy 🙂"
    elif compound > -0.2:
        return "Neutral 😐"
    elif compound > -0.6:
        return "Sad 😕"
    else:
        return "Very Sad 😢"

# ==============================
# Combined Analysis
# ==============================
def analyze_entry(text):
    emotion = detect_emotion(text)
    all_emotions = detect_multiple_emotions(text)

    # Emotion-aware mood override
    if emotion in ["Anger 😡", "Anxiety 😨", "Sadness 😢"]:
        mood = emotion
    else:
        mood = detect_mood(text)

    # Pass detected emotion to get_mood_score for emotion-aware adjustment
    score = get_mood_score(text, detected_emotion=emotion)

    return {
        "mood": mood,
        "emotion": emotion,
        "all_emotions": all_emotions,
        "score": score
    }
    