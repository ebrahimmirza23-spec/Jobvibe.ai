import streamlit as st
import json
import requests
import os
import time

# 1. Page Configuration
st.set_page_config(
    page_title="OpenRouter AI Playground // Streamlit",
    page_icon="🤖",
    layout="wide",
    initial_sidebar_state="expanded"
)

# Custom Styling (Minimal Dark Slate Theme)
st.markdown("""
<style>
    .reportview-container {
        background: #090d16;
    }
    .main {
        background: #090d16;
        color: #e2e8f0;
    }
    .stTextInput>div>div>input {
        background-color: #1e293b;
        color: white;
        border-color: #334155;
    }
    .stTextArea>div>div>textarea {
        background-color: #1e293b;
        color: white;
        border-color: #334155;
    }
    .stButton>button {
        background-color: #4f46e5;
        color: white;
        border-radius: 4px;
        border: none;
    }
    .stButton>button:hover {
        background-color: #4338ca;
        color: white;
    }
</style>
""", unsafe_allow_html=True)

# 2. Sidebar Configuration
st.sidebar.image("https://cryptologos.cc/logos/chatgpt-gpt-logo.png" if not os.path.exists("groq.ico") else "groq.ico", width=40)
st.sidebar.title("Configuration Control")
st.sidebar.write("### Powered by Groq Free Tier")

# Model options matching our custom Groq interactive playground
model_options = {
    "Meta: Llama 3.1 8B (Free) [RECOMMENDED]": "llama-3.1-8b-instant",
    "Mistral: Mixtral 8x7B (Free)": "mixtral-8x7b-32768",
    "Google: Gemma 2 9B (Free)": "gemma2-9b-it",
    "Meta: Llama 3.3 70B (Free)": "llama-3.3-70b-versatile"
}

selected_model_name = st.sidebar.selectbox("Choose AI Model", list(model_options.keys()))
model_tag = model_options[selected_model_name]

# Secrets / API Key configuration
st.sidebar.write("---")
st.sidebar.write("### 🔑 API Authentication")
env_key = os.environ.get("GROQ_API_KEY", "")
api_key_input = st.sidebar.text_input(
    "Groq API Key",
    value=env_key,
    type="password",
    help="If configured in AI Studio Secrets, this defaults automatically. Or obtain a key from https://console.groq.com/keys"
)

# Advanced parameters
st.sidebar.write("---")
st.sidebar.write("### ⚙️ Generation Parameters")
temperature = st.sidebar.slider("Temperature", min_value=0.0, max_value=2.0, value=0.7, step=0.1)
top_p = st.sidebar.slider("Top-P", min_value=0.0, max_value=1.0, value=0.9, step=0.05)
max_tokens = st.sidebar.number_input("Max Output Tokens", min_value=100, max_value=4096, value=1000, step=100)

st.sidebar.write("---")
st.sidebar.write("### 💡 Running this locally:")
st.sidebar.code("""
pip install streamlit requests
st_key = "your_groq_api_key"
# set in environment variable or configure in streamlit_app.py
""", language="bash")

# 3. Main Header
st.title("🤖 Groq Streamlit AI Sandbox")
st.caption("A responsive python dashboard orchestrating next-gen models via the ultra-high speed Groq Free API mesh.")

# System Prompt Configuration
st.write("### 📑 System Prompt Persona")
system_prompt = st.text_area(
    "Set the cognitive context or persona behavior",
    value="You are a helpful, professional, and knowledgeable AI assistant.",
    height=80
)

# 4. Session Chat State Handling
if "messages" not in st.session_state:
    st.session_state.messages = []

# Clear button
if st.button("🧼 Reset Conversation History"):
    st.session_state.messages = []
    st.rerun()

# 5. Display existing conversation history
st.write("---")
for msg in st.session_state.messages:
    with st.chat_message(msg["role"]):
        st.markdown(msg["content"])

# 6. Accepting Client Input Prompt
if user_prompt := st.chat_input("Enter your message..."):
    # Display user input
    with st.chat_message("user"):
        st.markdown(user_prompt)
    st.session_state.messages.append({"role": "user", "content": user_prompt})

    # Prepare payloads for Groq
    effective_api_key = api_key_input.strip() if api_key_input else os.environ.get("GROQ_API_KEY", "")

    if not effective_api_key:
        with st.chat_message("assistant"):
            st.error("🔑 **Authentication Missing**: No Groq token found. Please enter your Groq API Key in the sidebar text input, or set the `GROQ_API_KEY` secret variable in the AI Studio platform Secrets menu.")
        st.stop()

    headers = {
        "Authorization": f"Bearer {effective_api_key}",
        "Content-Type": "application/json"
    }

    # Format historical chat context
    groq_messages = [{"role": "system", "content": system_prompt}]
    for msg in st.session_state.messages:
        groq_messages.append({
            "role": "user" if msg["role"] == "user" else "assistant",
            "content": msg["content"]
        })

    payload = {
        "model": model_tag,
        "messages": groq_messages,
        "temperature": temperature,
        "top_p": top_p,
        "max_tokens": min(max_tokens, 1200)
    }

    # API call simulation with fallbacks
    with st.chat_message("assistant"):
        message_placeholder = st.empty()
        
        # Adaptive self-healing candidates cascade for Groq
        target_tag = model_tag
        candidates = [
            target_tag,
            "mixtral-8x7b-32768",
            "llama-3.1-8b-instant",
            "gemma2-9b-it",
            "llama-3.3-70b-versatile"
        ]

        # Deduplicate
        unique_candidates = []
        for c in candidates:
            if c not in unique_candidates:
                unique_candidates.append(c)

        success = False
        last_error = "No connection completed."
        last_status = 500
        final_model_used = model_tag

        for idx, current_model in enumerate(unique_candidates):
            if idx == 0:
                message_placeholder.markdown(f"🌌 *Contacting Groq node for model: `{current_model}`...*")
            else:
                message_placeholder.markdown(f"🔄 *[Fallback Mode] model `{model_tag}` is rate-limited. Recovering with candidate: `{current_model}`...*")
                
            payload["model"] = current_model
            
            # Up to 2 retries per candidate on 429 errors
            max_retries = 2
            for attempt in range(1, max_retries + 1):
                try:
                    # Querying the Groq REST interface
                    response = requests.post(
                        "https://api.groq.com/openai/v1/chat/completions",
                        headers=headers,
                        data=json.dumps(payload),
                        timeout=30
                    )
                    
                    if response.status_code == 200:
                        resp_json = response.json()
                        assistant_response = resp_json['choices'][0]['message']['content']
                        
                        # Highlight if fallback was triggered
                        if current_model != model_tag:
                            st.warning(f"⚠️ **Failover Safehouse**: `{model_tag}` is currently rate-limited on your Groq key. Successfully recovered using fallback candidate `{current_model}`!")
                            
                        message_placeholder.markdown(assistant_response)
                        st.session_state.messages.append({"role": "assistant", "content": assistant_response})
                        success = True
                        final_model_used = current_model
                        break
                    else:
                        try:
                            last_error = response.json().get('error', {}).get('message', 'Unknown Groq error status.')
                        except Exception:
                            last_error = response.text or 'Failure contacting Groq REST node.'
                        last_status = response.status_code
                        
                        # If rate limited (429), sleep (exponential delay) before retrying or cascading
                        if response.status_code == 429:
                            if attempt < max_retries:
                                delay = attempt * 1.5
                                message_placeholder.write(f"⛔ *429 Rate limited. Cooling down for {delay}s before retrying (Attempt {attempt + 1}/{max_retries})...*")
                                time.sleep(delay)
                                continue
                        
                        # Break attempt loop for non-recoverable error to try next candidate
                        break
                except Exception as e:
                    last_error = str(e)
                    last_status = 500
                    break
            
            if success:
                break

        if not success:
            helpful_tip = ""
            if last_status == 429 or "429" in last_error or "rate limit" in last_error.lower():
                helpful_tip = " \n\n⛔ **429: Groq Rate Limit Exceeded**: Your Groq API key or the public pool is rate-limited.\n\n🛠 *How to fix*:\n1. Wait 5-10 seconds and retry.\n2. Switch models in the dropdown.\n3. Verify your Groq Console dashboard usage metrics."
            elif last_status == 401:
                helpful_tip = " \n\n🔑 **Credential Check**: Please check if your Groq API Key has been typed correctly in the sidebar."
                
            message_placeholder.error(f"Error {last_status}: {last_error}{helpful_tip}")
