import { executeCommands } from './executor.js';
import fs from 'fs';
import dotenv from 'dotenv';

dotenv.config();

const OLLAMA_URL = process.env.OLLAMA_URL || 'http://localhost:11434/v1';
const LOCAL_MODEL = process.env.LOCAL_MODEL || 'qwen2.5:1.5b';

// Dual-mode LLM controller: dynamically switches between high-speed Groq Cloud LPU and offline local Ollama
async function callLLM(messages, useJson = true) {
  const groqKey = process.env.GROQ_API_KEY;
  
  if (groqKey) {
    // 1. Enterprise Mode: Groq Cloud LPU (Ultra-fast, low-latency reasoning)
    try {
      console.log(`[LLM] Dispatching to Groq Cloud (llama-3.3-70b-versatile)...`);
      const response = await fetch("https://api.groq.com/openai/v1/chat/completions", {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${groqKey}`
        },
        body: JSON.stringify({
          model: "llama-3.3-70b-versatile",
          messages: messages,
          response_format: useJson ? { type: 'json_object' } : undefined,
          temperature: 0.1
        })
      });
      
      if (!response.ok) {
        const err = await response.text();
        throw new Error(`Groq API Error: ${err}`);
      }
      
      const data = await response.json();
      return data.choices[0].message.content;
    } catch (error) {
      console.error('[Groq] API Connection failed, trying local fallback...', error);
      throw error;
    }
  } else {
    // 2. Local Mode: Offline Ollama (Free-tier, zero-cost Qwen model)
    try {
      console.log(`[LLM] Dispatching to local Ollama (${LOCAL_MODEL})...`);
      const response = await fetch(`${OLLAMA_URL}/chat/completions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: LOCAL_MODEL,
          messages: messages,
          response_format: useJson ? { type: 'json_object' } : undefined
        })
      });
      
      if (!response.ok) {
        const err = await response.text();
        throw new Error(`Ollama Error: ${err}`);
      }
      
      const data = await response.json();
      return data.choices[0].message.content;
    } catch (error) {
      console.error('[Ollama] API Error: Local Ollama server offline.', error);
      throw new Error(
        "LLM Connection Failed: Local Ollama server is offline.\n" +
        "👉 Start your local service by running: 'ollama run qwen2.5:1.5b'\n" +
        "👉 Or, configure 'GROQ_API_KEY' in your .env file to enable instant Groq Cloud LPU (Llama 3.3-70B)."
      );
    }
  }
}

export async function runAgent(prompt) {
  const systemPrompt = `
    You are a professional business automation agent. Your goal is to execute complex workflows in the browser.
    
    Actions available:
    - navigate (url)
    - click (selector) - Use precise CSS selectors.
    - type (selector, text) - Use for inputs.
    - press (selector, key) - e.g., "Enter", "Tab".
    - wait (time in ms) - Use for loading states.
    - screenshot () - Use to capture results.

    Business Context:
    The user is using their personal/business Chrome profile. Logins are likely already handled by the persistent session. 
    Focus on accuracy and reliability.
  `;

  try {
    const activeModel = process.env.GROQ_API_KEY ? 'llama-3.3-70b' : LOCAL_MODEL;
    console.log(`[Agent] Planning professional workflow using ${activeModel}...`);
    
    const text = await callLLM([
      { role: 'system', content: systemPrompt },
      { role: 'user', content: prompt }
    ]);
    
    const jsonMatch = text.match(/\[.*\]/s);
    let steps;
    
    if (!jsonMatch) {
      const obj = JSON.parse(text);
      steps = obj.steps || (Array.isArray(obj) ? obj : []);
    } else {
      steps = JSON.parse(jsonMatch[0]);
    }
    
    console.log(`[Agent] Executing ${steps.length} business steps...`);
    return await executeCommands(steps);
  } catch (error) {
    console.error('[Agent] Logic error:', error);
    throw error;
  }
}

export async function getPlanOnly(prompt, context = {}) {
  const activeModel = process.env.GROQ_API_KEY ? 'llama-3.3-70b' : LOCAL_MODEL;
  console.log(`[Agent] Planning for prompt: "${prompt}" using ${activeModel}`);
  
  const systemPrompt = `
    You are the "Master AI Browser Controller" (Comet-Class). You have full control over the entire browser session.
    
    ENVIRONMENT CONTEXT:
    - ALL OPEN TABS: ${JSON.stringify(context.allTabs || [], null, 2)}
    - CURRENT ACTIVE TAB: "${context.title || 'a webpage'}" (ID: ${context.currentTabId})
    
    STRATEGIC MENTAL MODEL:
    1. UNIVERSAL CONTROL: You can create, switch, and close tabs.
    2. TARGETING: Every action takes a "tabId".
    
    ALLOWED ACTIONS (ONLY USE THESE):
    - { "action": "createTab", "url": "..." }
    - { "action": "switchTab", "tabId": ... }
    - { "action": "click", "tabId": ..., "selector": "[data-automator-id='...']" }
    - { "action": "type", "tabId": ..., "selector": "[data-automator-id='...']", "text": "..." }
    - { "action": "press", "tabId": ..., "selector": "[data-automator-id='...']", "key": "Enter" }
    - { "action": "scroll", "tabId": ..., "direction": "down" }
    - { "action": "wait", "ms": 2000 }
    
    INTERACTIVE ELEMENT MAP (FOR CURRENT TAB):
    ${JSON.stringify(context.interactiveMap || [], null, 2)}

    RESPONSE FORMAT:
    Output ONLY a JSON object with a "steps" key containing the flat array.
  `;

  try {
    const text = await callLLM([
      { role: 'system', content: systemPrompt },
      { role: 'user', content: prompt }
    ]);
    
    console.log(`[Agent] Raw LLM Response: ${text}`);
    
    const obj = JSON.parse(text);
    const steps = obj.steps || obj.actions || (Array.isArray(obj) ? obj : []);
    return { steps };
  } catch (err) {
    console.error('[Agent] Planning error:', err);
    throw err;
  }
}

// Specialized function for Wellfound Job Notes
export async function generateJobNote(jobInfo, userBackground) {
  const prompt = `
    I'm applying for this job: ${jobInfo}. 
    Based on my background (${userBackground}), write a 2-sentence 'Note to Founder' that is concise and highlights my industrial-tech blend. 
    Do not include placeholders like [Name]. 
    Output ONLY the note text.
  `;
  
  return await callLLM([{ role: 'user', content: prompt }], false);
}
