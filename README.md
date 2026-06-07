# 🚀 OpenRouter Streamlit & React AI Sandbox

This workspace contains two powerful AI playgrounds:
1. **Full-Stack React + Node (Express) App**: Robust dashboard for resume analysis, dynamic mock interviews (with text-to-speech feedback), and scoring models.
2. **Streamlit AI Sandbox (`streamlit_app.py`)**: A rich, responsive Python dashboard leveraging the OpenRouter mesh with custom prompt configurations, parameter controls, and chat persistence.

---

## 📦 Python Streamlit Setup

### 1. Install Dependencies
Make sure you have Python 3.8+ installed, then run:
```bash
pip install -r requirements.txt
```

### 2. Run Streamlit Locally
```bash
streamlit run streamlit_app.py
```

---

## 🌐 Deploying to Streamlit Community Cloud (Free Sharing Link)

Streamlit Community Cloud is the best and easiest way to host and share your Streamlit app for free!

### Step 1: Export this workspace to GitHub
1. In the top-right corner of Google AI Studio (or in the Settings/Share menu), click on **Export** / **Export to GitHub** (or download as a ZIP file to push to your GitHub manually).
2. Follow the prompt to authorize AI Studio with your GitHub account.
3. Choose to create a new repository (e.g., `openrouter-streamlit-sandbox`) and export your files.

### Step 2: Deploy to Streamlit Cloud
1. Go to [share.streamlit.io](https://share.streamlit.io/) and log in with your GitHub account.
2. Click **Create app** (or **New app**).
3. Fill in the repository details:
   - **Repository**: Select your newly created repo (e.g., `your-username/openrouter-streamlit-sandbox`).
   - **Branch**: `main` (or `master`).
   - **Main file path**: `streamlit_app.py`
4. Click **Deploy!**

Within a couple of minutes, Streamlit will configure your environment using `requirements.txt` and launch your live application with a custom `.streamlit.app` link that you can share with anyone!

---

## 🛠️ Full-Stack React Project Setup

If you wish to run the React + Express server app locally:

### 1. Install Package Dependencies
```bash
npm install
```

### 2. Configure Environment Variables
Create a `.env` file in the root directory and add your secret keys:
```env
GEMINI_API_KEY=your_gemini_api_key_here
PORT=3000
```

### 3. Start Development Servers
```bash
npm run dev
```
The application will serve the Vite/React frontend and Express backend.
