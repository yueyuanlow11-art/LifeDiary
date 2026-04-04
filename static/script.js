let currentPages = [""];
let pageTimestamps = [];
let currentPageIndex = 0;
let analysisTimeout;
let editingEntryId = null; // null means a new diary entry
let allEntries = [];
let isRenaming = false;
let authMode = "login"; // "login" or "signup"

async function checkAuth() {
    try {
        const response = await fetch("/check_auth");
        const data = await response.json();
        if (data.authenticated) {
            showDashboard(data.username);
            if (data.profile_photo) {
                updateProfilePhotoDisplay(data.profile_photo);
            }
        } else {
            showAuth();
        }
    } catch (e) {
        showAuth();
    }
}

async function uploadProfilePhoto(input) {
    if (input.files && input.files[0]) {
        const reader = new FileReader();
        reader.onload = async function(e) {
            const photoData = e.target.result;
            try {
                const response = await fetch("/upload_profile_photo", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ photo: photoData })
                });
                
                if (response.ok) {
                    updateProfilePhotoDisplay(photoData);
                }
            } catch (error) {
                console.error("Error uploading photo:", error);
            }
        };
        reader.readAsDataURL(input.files[0]);
    }
}

function updateProfilePhotoDisplay(photoData) {
    const profileImg = document.getElementById("profile-img");
    const settingsProfileImg = document.getElementById("settings-profile-img");
    const profilePlaceholder = document.getElementById("profile-placeholder");
    const settingsProfilePlaceholder = document.getElementById("settings-profile-placeholder");
    
    if (profileImg) {
        profileImg.src = photoData;
        profileImg.style.display = "block";
    }
    if (settingsProfileImg) {
        settingsProfileImg.src = photoData;
        settingsProfileImg.style.display = "block";
    }
    if (profilePlaceholder) profilePlaceholder.style.display = "none";
    if (settingsProfilePlaceholder) settingsProfilePlaceholder.style.display = "none";
}

function toggleSettingsPanel() {
    const panel = document.getElementById("settings-panel");
    panel.classList.toggle("hidden");
}

function showSubSetting(type) {
    const modal = document.getElementById("subsetting-modal");
    const content = document.getElementById("subsetting-content");
    modal.classList.remove("hidden");
    
    let html = "";
    if (type === 'security') {
        html = `
            <h3>Change Password</h3>
            <input type="password" id="old-pass" placeholder="Old Password" style="margin-bottom:10px; padding:8px; width:80%;"><br>
            <input type="password" id="new-pass" placeholder="New Password" style="margin-bottom:10px; padding:8px; width:80%;"><br>
            <button class="btn-primary" onclick="submitPasswordChange()">Update</button>
            <div id="pass-error" class="error-text"></div>
        `;
    } else if (type === 'theme') {
        html = `
            <h3>Choose Theme</h3>
            <button class="btn-primary" onclick="setTheme('default')" style="margin-bottom:10px; width:80%;">Default (Yellow)</button><br>
            <button class="btn-primary" onclick="setTheme('white')" style="margin-bottom:10px; width:80%;">Pure White</button><br>
            <button class="btn-primary" onclick="setTheme('dark')" style="margin-bottom:10px; width:80%;">Dark Mode</button><br>
            <button class="btn-primary" onclick="setTheme('blue')" style="margin-bottom:10px; width:80%;">Sky Blue</button><br>
            <button class="btn-primary" onclick="setTheme('pink')" style="width:80%;">Rose Pink</button>
        `;
    } else if (type === 'storage') {
        html = `
            <h3>Manage Storage</h3>
            <p>Delete all your diary entries permanently?</p>
            <button class="btn-primary danger" onclick="clearAllData()">Clear All Data</button>
        `;
    } else if (type === 'mood-history') {
        renderMoodHistory();
        return; // renderMoodHistory handles its own HTML injection
    }
    content.innerHTML = html;
}

async function renderMoodHistory() {
    const content = document.getElementById("subsetting-content");
    content.innerHTML = "<div class='loading-spinner'>📊 Loading your mood data...</div>";

    // Always fetch fresh entries when opening history to be sure
    try {
        await loadEntries();
    } catch (e) {
        console.error("Failed to load entries for history:", e);
    }

    const monthlyAverages = calculateMonthlyMoods(allEntries);
    
    // Get average from dashboard text or calculate it if not available
    let overallAvgText = "50%";
    const avgElem = document.getElementById("avg-mood-percent");
    if (avgElem) {
        overallAvgText = avgElem.innerText;
    }
    
    const avgValue = parseInt(overallAvgText) || 50;
    const moodInfo = getMoodFromScore(avgValue);
    
    const html = `
        <h3 class="history-title">Your Mood History</h3>
        <div class="overall-summary" style="margin-bottom: 25px; padding: 15px; background: rgba(0,0,0,0.03); border-radius: 15px;">
            <div style="font-size: 1.1rem; font-weight: 600;">Overall Average</div>
            <div style="font-size: 1.8rem;"><strong>${overallAvgText}</strong> ${moodInfo.emoji}</div>
            <div style="font-size: 0.9rem; color: #666; margin-top: 5px;">Status: ${moodInfo.label}</div>
        </div>
        
        <div class="mood-history-list">
            ${monthlyAverages.reverse().map(m => {
                const info = m.score !== null ? getMoodFromScore(m.score) : null;
                return `
                    <div class="mood-history-item ${m.score === null ? 'no-data' : ''}">
                        <div class="month-name">${m.month}</div>
                        <div class="month-status">
                            ${m.score !== null ? 
                                `<span>${info.emoji} ${info.label} (${m.score}%)</span>` : 
                                `<span style="color: #999; font-style: italic;">No entries recorded</span>`
                            }
                        </div>
                    </div>
                `;
            }).join('')}
        </div>
    `;
    
    content.innerHTML = html;
}

function calculateMonthlyMoods(entries) {
    console.log("Calculating moods for entries:", entries);
    if (!entries || entries.length === 0) return Array(12).fill(0).map((_, i) => {
        const d = new Date();
        d.setMonth(d.getMonth() - (11 - i));
        return { month: ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"][d.getMonth()], score: null };
    });

    const now = new Date();
    const result = [];
    const monthNames = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

    for (let i = 11; i >= 0; i--) {
        const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
        const year = d.getFullYear();
        const month = String(d.getMonth() + 1).padStart(2, '0');
        const monthYear = `${year}-${month}`;
        const monthLabel = monthNames[d.getMonth()];
        
        // Filter entries for this month, making sure e.date exists
        const monthEntries = entries.filter(e => {
            if (!e.date) return false;
            // Handle both "YYYY-MM-DD HH:MM" and "YYYY-MM-DD"
            return e.date.startsWith(monthYear);
        });
        
        console.log(`Month ${monthYear} has ${monthEntries.length} entries`);

        let avgScore = null;
        if (monthEntries.length > 0) {
            const total = monthEntries.reduce((sum, e) => {
                const score = e.mood_score !== undefined ? e.mood_score : getMoodScore(e.mood);
                return sum + score;
            }, 0);
            avgScore = Math.round(total / monthEntries.length);
        }
        
        result.push({
            month: monthLabel,
            score: avgScore
        });
    }
    return result;
}

function closeSubSetting() {
    document.getElementById("subsetting-modal").classList.add("hidden");
}

async function submitPasswordChange() {
    const old_password = document.getElementById("old-pass").value;
    const new_password = document.getElementById("new-pass").value;
    const errorDiv = document.getElementById("pass-error");
    
    try {
        const response = await fetch("/change_password", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ old_password, new_password })
        });
        const data = await response.json();
        if (response.ok) {
            alert("Password updated!");
            closeSubSetting();
        } else {
            errorDiv.innerText = data.error;
        }
    } catch (e) {
        errorDiv.innerText = "Error updating password.";
    }
}

function setTheme(theme) {
    const root = document.documentElement;
    
    // Set the theme attribute - CSS variables will handle the rest
    root.setAttribute('data-theme', theme);
    
    // Save theme preference
    localStorage.setItem('diary-theme', theme);
    alert(`Theme changed to ${theme}!`);
}

async function clearAllData() {
    if (confirm("Delete ALL your diary entries? This cannot be undone.")) {
        await fetch("/clear_storage", { method: "POST" });
        location.reload();
    }
}

async function confirmDeleteAccount() {
    if (confirm("DELETE ACCOUNT? This will permanently erase everything.")) {
        const res = await fetch("/delete_account", { method: "POST" });
        if (res.ok) {
            location.reload();
        }
    }
}

function showAuth() {
    document.getElementById("auth-view").classList.remove("hidden");
    document.getElementById("dashboard-view").classList.add("hidden");
    document.getElementById("entry-view").classList.add("hidden");
    document.getElementById("user-display").innerText = "";
}

function toggleAuthMode() {
    authMode = authMode === "login" ? "signup" : "login";
    const title = document.getElementById("auth-title");
    const btn = document.getElementById("auth-btn");
    const toggleText = document.getElementById("auth-toggle-text");
    
    if (authMode === "signup") {
        title.innerText = "Create Account";
        btn.innerText = "Sign Up";
        toggleText.innerHTML = 'Already have an account? <a href="#" onclick="toggleAuthMode()">Login</a>';
    } else {
        title.innerText = "Welcome Back";
        btn.innerText = "Login";
        toggleText.innerHTML = 'Don\'t have an account? <a href="#" onclick="toggleAuthMode()">Sign up</a>';
    }
    document.getElementById("auth-error").innerText = "";
}

async function handleAuth() {
    const username = document.getElementById("username").value;
    const password = document.getElementById("password").value;
    const errorDiv = document.getElementById("auth-error");
    
    if (!username || !password) {
        errorDiv.innerText = "Please enter both username and password";
        return;
    }
    
    const endpoint = authMode === "login" ? "/login" : "/signup";
    
    try {
        const response = await fetch(endpoint, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ username, password })
        });
        
        const data = await response.json();
        
        if (response.ok) {
            if (authMode === "signup") {
                alert("Account created successfully! Please login.");
                toggleAuthMode();
            } else {
                showDashboard(data.username);
            }
        } else {
            errorDiv.innerText = data.error || "Authentication failed";
        }
    } catch (e) {
        errorDiv.innerText = "Server error. Please try again.";
    }
}

async function logout() {
    await fetch("/logout");
    showAuth();
}

function togglePasswordVisibility() {
    const passwordInput = document.getElementById("password");
    const toggleIcon = document.getElementById("toggle-password");
    
    if (passwordInput.type === "password") {
        passwordInput.type = "text";
        toggleIcon.innerText = "🙈"; // Hide icon
    } else {
        passwordInput.type = "password";
        toggleIcon.innerText = "👁️"; // Show icon
    }
}

function showEntryForm() {
    document.getElementById("auth-view").classList.add("hidden");
    document.getElementById("dashboard-view").classList.add("hidden");
    document.getElementById("entry-view").classList.remove("hidden");
    
    // Reset for new entry
    editingEntryId = null;
    currentPages = [""];
    pageTimestamps = [getFormattedDateTime()];
    currentPageIndex = 0;
    
    // Reset title UI
    resetRenameUI();
    document.getElementById("display-title").innerText = "Dear diary...";
    document.getElementById("edit-title").value = "";

    updatePageDisplay();
}

function resetRenameUI() {
    isRenaming = false;
    document.getElementById("display-title").classList.remove("hidden");
    document.getElementById("edit-title").classList.add("hidden");
    document.getElementById("btn-rename").innerText = "✏️";
}

function toggleRename() {
    const displayTitle = document.getElementById("display-title");
    const editTitle = document.getElementById("edit-title");
    const btnRename = document.getElementById("btn-rename");

    if (!isRenaming) {
        // Switch to edit mode
        isRenaming = true;
        displayTitle.classList.add("hidden");
        editTitle.classList.remove("hidden");
        editTitle.value = displayTitle.innerText === "Dear diary..." ? "" : displayTitle.innerText;
        editTitle.focus();
        btnRename.innerText = "✔️";
    } else {
        // Switch to display mode
        isRenaming = false;
        const newTitle = editTitle.value.trim();
        if (newTitle) {
            displayTitle.innerText = newTitle;
        } else {
            displayTitle.innerText = "Dear diary...";
        }
        displayTitle.classList.remove("hidden");
        editTitle.classList.add("hidden");
        btnRename.innerText = "✏️";
    }
}

function viewEntry(id) {
    const entry = allEntries.find(e => e.id === id);
    if (!entry) return;

    editingEntryId = id;
    currentPages = entry.pages || [entry.text];
    pageTimestamps = entry.page_timestamps || Array(currentPages.length).fill(entry.date);
    currentPageIndex = 0;

    document.getElementById("auth-view").classList.add("hidden");
    document.getElementById("dashboard-view").classList.add("hidden");
    document.getElementById("entry-view").classList.remove("hidden");
    
    // Set title
    resetRenameUI();
    document.getElementById("display-title").innerText = entry.title || `Diary Entry`;
    document.getElementById("edit-title").value = entry.title || "";

    updatePageDisplay();
}

function updatePageDisplay() {
    document.getElementById("page-number").innerText = currentPageIndex + 1;
    document.getElementById("diaryInput").value = currentPages[currentPageIndex];
    document.getElementById("current-date").innerText = pageTimestamps[currentPageIndex];
    analyzeMoodRealTime(currentPages[currentPageIndex]);
}

function nextPage() {
    // Save current page
    currentPages[currentPageIndex] = document.getElementById("diaryInput").value;
    
    if (currentPageIndex === currentPages.length - 1) {
        // Create new page if at the end
        currentPages.push("");
        pageTimestamps.push(getFormattedDateTime());
    }
    currentPageIndex++;
    updatePageDisplay();
}

function prevPage() {
    if (currentPageIndex > 0) {
        // Save current page
        currentPages[currentPageIndex] = document.getElementById("diaryInput").value;
        currentPageIndex--;
        updatePageDisplay();
    }
}

function deleteCurrentPage() {
    if (currentPages.length <= 1) {
        // Just clear the content if it's the only page
        document.getElementById("diaryInput").value = "";
        currentPages[0] = "";
        pageTimestamps[0] = getFormattedDateTime();
        analyzeMoodRealTime("");
        updatePageDisplay();
        return;
    }

    if (confirm("Are you sure you want to delete this page?")) {
        currentPages.splice(currentPageIndex, 1);
        pageTimestamps.splice(currentPageIndex, 1);
        if (currentPageIndex >= currentPages.length) {
            currentPageIndex = currentPages.length - 1;
        }
        updatePageDisplay();
    }
}

async function deleteEntry() {
    if (editingEntryId === null) {
        // If it's a new entry that hasn't been saved yet, just go back to dashboard
        showDashboard();
        return;
    }

    if (confirm("Are you sure you want to delete this ENTIRE diary book? This cannot be undone.")) {
        try {
            const response = await fetch("/delete_entry", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ id: editingEntryId })
            });

            if (!response.ok) throw new Error("Server error");

            const data = await response.json();
            if (data.success) {
                showDashboard();
            }
        } catch (e) {
            alert("Error deleting diary. Please try again.");
        }
    }
}

// Add input listener for real-time mood analysis
document.addEventListener("DOMContentLoaded", () => {
    const savedTheme = localStorage.getItem('diary-theme');
    if (savedTheme) {
        // We need to wait for things to be ready, but for now just call it
        // Note: some elements might not be in the DOM yet if they are dynamic
        setTimeout(() => setTheme(savedTheme), 100);
    }
    
    checkAuth(); // Initial auth check
    
    const textarea = document.getElementById("diaryInput");
    if (textarea) {
        textarea.addEventListener("input", (e) => {
            const text = e.target.value;
            currentPages[currentPageIndex] = text;
            
            // Debounce
            clearTimeout(analysisTimeout);
            analysisTimeout = setTimeout(() => {
                analyzeMoodRealTime(text);
            }, 800);
        });
    }
});

async function analyzeMoodRealTime(text) {
    if (!text.trim()) {
        document.getElementById("real-time-mood").innerText = "Mood: Waiting...";
        return;
    }
    
    try {
        const response = await fetch("/analyze_mood", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ text: text })
        });
        const data = await response.json();
        const scoreText = data.score !== undefined ? ` (${data.score}%)` : "";
        document.getElementById("real-time-mood").innerText = `Mood: ${data.mood}${scoreText}`;
    } catch (e) {
        console.error("Analysis error", e);
    }
}

async function saveEntry() {
    const saveBtn = document.querySelector(".tool-icon[onclick='saveEntry()']");
    const originalContent = saveBtn.innerHTML;
    saveBtn.innerHTML = "⏳";
    saveBtn.disabled = true;

    // Save current page first
    currentPages[currentPageIndex] = document.getElementById("diaryInput").value;
    
    // Get the title
    const diaryTitle = document.getElementById("display-title").innerText;
    const diaryDate = pageTimestamps[0]; // Primary date is the first page date
    
    // Filter out empty pages except if there's only one page
    const filteredPages = [];
    const filteredTimestamps = [];
    
    currentPages.forEach((page, i) => {
        if (page.trim() !== "" || (currentPages.length === 1 && i === 0)) {
            filteredPages.push(page);
            filteredTimestamps.push(pageTimestamps[i]);
        }
    });

    const fullText = filteredPages.join("\n\n---\n\n");

    if (fullText.trim() === "") {
        alert("Please write something!");
        saveBtn.innerHTML = originalContent;
        saveBtn.disabled = false;
        return;
    }

    try {
        const response = await fetch("/save_entry", {
            method: "POST",
            headers: {
                "Content-Type": "application/json"
            },
            body: JSON.stringify({ 
                text: fullText,
                pages: filteredPages,
                page_timestamps: filteredTimestamps,
                id: editingEntryId,
                title: diaryTitle === "Dear diary..." ? "" : diaryTitle,
                date: diaryDate
            })
        });

        if (!response.ok) throw new Error("Server error");

        const data = await response.json();
        const scoreText = data.score !== undefined ? ` (${data.score}%)` : "";
        document.getElementById("result").innerHTML = `<p>Overall Mood: ${data.mood}${scoreText}</p>`;
        
        setTimeout(() => {
            document.getElementById("result").innerHTML = "";
            showDashboard();
            saveBtn.innerHTML = originalContent;
            saveBtn.disabled = false;
        }, 1500);

    } catch (e) {
        alert("Error saving diary. Please try again.");
        saveBtn.innerHTML = originalContent;
        saveBtn.disabled = false;
    }
}

function showDashboard(username) {
    document.getElementById("auth-view").classList.add("hidden");
    document.getElementById("entry-view").classList.add("hidden");
    document.getElementById("dashboard-view").classList.remove("hidden");
    
    if (username) {
        document.getElementById("user-display").innerText = `Hello, ${username}!`;
    }
    
    // Reset global allEntries before loading to prevent stale data if login fails
    allEntries = [];
    loadEntries();
}

async function loadEntries() {
    console.log("DEBUG: loadEntries called");
    try {
        const response = await fetch("/get_entries");
        console.log("DEBUG: loadEntries response status:", response.status);
        
        if (!response.ok) {
            if (response.status === 401) {
                console.warn("DEBUG: Unauthorized - showing auth");
                showAuth();
                return [];
            }
            const errorData = await response.json();
            console.error("DEBUG: Server error loading entries:", errorData.error);
            return [];
        }
        
        allEntries = await response.json();
        console.log("DEBUG: Successfully loaded entries:", allEntries.length);

        const entriesGrid = document.getElementById("entries-grid");
        if (entriesGrid) {
            entriesGrid.innerHTML = "";
            allEntries.forEach((entry) => {
                const moodScore = entry.mood_score !== undefined ? entry.mood_score : getMoodScore(entry.mood);
                const pageCount = entry.pages ? entry.pages.length : 1;
                const displayTitle = entry.title || `Diary Entry`;
                const card = document.createElement("div");
                card.className = "diary-card";
                card.onclick = () => viewEntry(entry.id);
                card.innerHTML = `
                    <div class="book-icon">📔</div>
                    <h3>${displayTitle}</h3>
                    <p style="font-size: 0.8rem; color: #666;">${pageCount} ${pageCount === 1 ? 'page' : 'pages'}</p>
                    <div class="card-gauge-container">
                        <div class="gauge-icons">
                            <span class="gauge-emoji">☹️</span>
                            <span style="font-size: 0.75rem; color: #666;">${moodScore}%</span>
                            <span class="gauge-emoji">😊</span>
                        </div>
                        <div class="mini-gauge">
                            <div class="mini-gauge-fill" style="width: ${moodScore}%"></div>
                        </div>
                    </div>
                    <p style="font-size: 0.7rem; color: #999; margin-top: auto;">${entry.date}</p>
                `;
                entriesGrid.appendChild(card);
            });
            updateAverageMood(allEntries);
        }
        return allEntries;
    } catch (e) {
        console.error("DEBUG: Fetch error in loadEntries:", e);
        return [];
    }
}

function getMoodScore(mood) {
    // Map mood string to a percentage for the gauge
    const moodMap = {
        "Happy 😊": 100,
        "Neutral 😐": 50,
        "Sad 😢": 0
    };
    return moodMap[mood] !== undefined ? moodMap[mood] : 50;
}

function getMoodFromScore(score) {
    if (score >= 80) return { label: "Very Happy", emoji: "😆" };
    if (score >= 60) return { label: "Happy", emoji: "😊" };
    if (score >= 40) return { label: "Neutral", emoji: "😐" };
    if (score >= 20) return { label: "Sad", emoji: "😔" };
    return { label: "Very Sad", emoji: "😭" };
}

function updateAverageMood(entries) {
    const gaugeFill = document.querySelector(".gauge-fill");
    const avgPercentText = document.getElementById("avg-mood-percent");
    if (!gaugeFill) return;

    // Reset to 0 first to ensure animation triggers
    gaugeFill.style.width = "0%";

    setTimeout(() => {
        if (entries.length === 0) {
            gaugeFill.style.width = "50%";
            if (avgPercentText) avgPercentText.innerText = "50%";
            return;
        }

        const totalScore = entries.reduce((sum, entry) => {
            const score = entry.mood_score !== undefined ? entry.mood_score : getMoodScore(entry.mood);
            return sum + score;
        }, 0);
        const average = Math.round(totalScore / entries.length);
        gaugeFill.style.width = `${average}%`;
        if (avgPercentText) {
            const moodInfo = getMoodFromScore(average);
            avgPercentText.innerHTML = `${average}% ${moodInfo.emoji}`;
        }
    }, 50);
}

function getFormattedDateTime() {
    const now = new Date();
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, '0');
    const day = String(now.getDate()).padStart(2, '0');
    const hours = String(now.getHours()).padStart(2, '0');
    const minutes = String(now.getMinutes()).padStart(2, '0');
    return `${year}-${month}-${day} ${hours}:${minutes}`;
}