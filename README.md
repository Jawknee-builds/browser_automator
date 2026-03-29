# AUTOMATOR AI - Ultra-Fast Browser Automation (Groq Cloud)

This is a free, high-performance browser automation tool powered by **Groq Cloud** and **Playwright**.

## Prerequisites

1.  **Get a Groq API Key**: Go to [console.groq.com](https://console.groq.com), create a free account, and generate an API key.
2.  **Add your key**:
    - Open `server/.env`
    - Set `GROQ_API_KEY=your_actual_key_here`

## Setup

1.  **Start the Application**:
    - Open two terminals:
        - **Terminal 1 (Backend)**: `cd server && npm start`
        - **Terminal 2 (Frontend)**: `cd client && npm run dev`

2.  **Open in Browser**:
    - Visit `http://localhost:3000`.

## Why Groq?
-   **Speed**: It's the fastest LLM inference in the world. Automation steps are planned in milliseconds.
-   **Coolness**: Uses **Llama-3.3-70B**, a massive, state-of-the-art model without draining your local battery/RAM.
-   **Free Tier**: Very generous free limits for developers.
