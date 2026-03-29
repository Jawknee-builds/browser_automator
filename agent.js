import Groq from 'groq-sdk';
import { executeCommands } from './executor.js';
import fs from 'fs';

let groq;

function getGroqClient() {
  if (!groq) {
    if (!process.env.GROQ_API_KEY) {
      throw new Error("GROQ_API_KEY is missing from environment variables.");
    }
    groq = new Groq({ apiKey: process.env.GROQ_API_KEY });
  }
  return groq;
}

export async function runAgent(prompt) {
  const model = 'llama-3.3-70b-versatile'; 
  const client = getGroqClient();
  
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
    Focus on accuracy and reliability. If a task involves multiple steps (e.g., "Find a contact on LinkedIn and save to sheets"), break it down logically.

    Goal: "${prompt}"
    IMPORTANT: Output ONLY a JSON array of steps. No extra text.
  `;

  try {
    console.log(`[Agent] Planning professional workflow using ${model}...`);
    const chatCompletion = await client.chat.completions.create({
      messages: [{ role: 'user', content: systemPrompt }],
      model: model,
      response_format: { type: 'json_object' }
    });

    const text = chatCompletion.choices[0].message.content;
    const jsonMatch = text.match(/\[.*\]/s);
    let steps;
    
    if (!jsonMatch) {
      const obj = JSON.parse(text);
      if (Array.isArray(obj)) steps = obj;
      else if (obj.steps) steps = obj.steps;
      else throw new Error(`Planning failed. Received: ${text}`);
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
  const model = 'llama-3.3-70b-versatile'; 
  const client = getGroqClient();
  console.log(`[Agent] Planning for prompt: "${prompt}"`);
  
  const systemPrompt = `
    You are the "Master AI Browser Controller" (Comet-Class). You have full control over the entire browser session.
    
    ENVIRONMENT CONTEXT:
    - ALL OPEN TABS: ${JSON.stringify(context.allTabs || [], null, 2)}
    - CURRENT ACTIVE TAB: "${context.title || 'a webpage'}" (ID: ${context.currentTabId})
    
    STRATEGIC MENTAL MODEL:
    1. UNIVERSAL CONTROL: You can create, switch, and close tabs.
    2. CROSS-TAB FLOW: If asked to "compare prices in two sites", you should: 1. Create a new tab for Site B, 2. Research, 3. Switch back to Tab A.
    3. TARGETING: Every action takes a "tabId". If you don't specify it, it runs in the current tab.
    
    ALLOWED ACTIONS (ONLY USE THESE):
    - { "action": "createTab", "url": "..." } -> Returns a new tabId.
    - { "action": "switchTab", "tabId": ... } -> Focuses a tab.
    - { "action": "closeTab", "tabId": ... }
    - { "action": "click", "tabId": ..., "selector": "[data-automator-id='...']" }
    - { "action": "type", "tabId": ..., "selector": "[data-automator-id='...']", "text": "..." }
    - { "action": "press", "tabId": ..., "selector": "[data-automator-id='...']", "key": "Enter" }
    - { "action": "scroll", "tabId": ..., "direction": "down" }
    - { "action": "wait", "ms": 2000 }
    
    INTERACTIVE ELEMENT MAP (FOR CURRENT TAB):
    ${JSON.stringify(context.interactiveMap || [], null, 2)}

    GOAL: "${prompt}"
    
    RESPONSE FORMAT:
    Output ONLY a JSON object with a "steps" key containing the flat array.
  `;

  try {
    const debugData = { timestamp: new Date().toISOString(), prompt, interactiveMap: context.interactiveMap };
    fs.writeFileSync('./debug_prompt.json', JSON.stringify(debugData, null, 2));

    const chatCompletion = await client.chat.completions.create({
      messages: [{ role: 'system', content: systemPrompt }, { role: 'user', content: prompt }],
      model: model,
      response_format: { type: 'json_object' }
    });

    const text = chatCompletion.choices[0].message.content;
    fs.writeFileSync('./debug_response.txt', text);
    console.log(`[Agent] Raw LLM Response: ${text}`);
    
    try {
      const obj = JSON.parse(text);
      const steps = obj.steps || obj.actions || (Array.isArray(obj) ? obj : []);
      return { steps };
    } catch (parseErr) {
      console.error('[Agent] JSON Parsing failed!', parseErr);
      console.log('[Agent] Problematic text:', text);
      return { steps: [] };
    }
  } catch (err) {
    console.error('[Agent] Planning error:', err);
    throw err;
  }
}
