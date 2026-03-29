chrome.sidePanel
  .setPanelBehavior({ openPanelOnActionClick: true })
  .catch((error) => console.error(error));

chrome.action.onClicked.addListener((tab) => {
  console.log("Automator Extension Icon Clicked");
});

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.type === "EXECUTE_STEP") {
    executeStep(request.step)
      .then(result => sendResponse({ success: true, result }))
      .catch(err => sendResponse({ success: false, error: err.message }));
    return true;
  }
  
  if (request.type === "GET_PLAN") {
    fetch('http://localhost:3001/api/plan', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ 
        prompt: request.prompt,
        context: request.context 
      })
    })
    .then(res => res.json())
    .then(data => sendResponse({ success: true, steps: data.steps || [] }))
    .catch(err => sendResponse({ success: false, error: err.message }));
    return true;
  }
});

async function executeStep(step) {
  // Use provided tabId or fall back to active tab
  let targetTabId = step.tabId;
  
  if (!targetTabId) {
    const [activeTab] = await chrome.tabs.query({ active: true, currentWindow: true });
    targetTabId = activeTab ? activeTab.id : null;
  }

  if (!targetTabId && !['createTab', 'wait'].includes(step.action)) {
    throw new Error("No target tab found for action: " + step.action);
  }

  console.log(`[Background] Executing: ${step.action} in tab ${targetTabId}`);

  switch (step.action) {
    case 'navigate':
      await chrome.tabs.update(targetTabId, { url: step.url });
      // Wait for load
      return new Promise((resolve) => {
        chrome.tabs.onUpdated.addListener(function listener(tId, info) {
          if (tId === targetTabId && info.status === 'complete') {
            chrome.tabs.onUpdated.removeListener(listener);
            resolve("Navigated");
          }
        });
      });

    case 'click':
      return chrome.scripting.executeScript({
        target: { tabId: targetTabId },
        func: (selector) => {
          const el = document.querySelector(selector);
          if (el) {
            el.scrollIntoView({ behavior: 'smooth', block: 'center' });
            
            // Gaze / Highlight
            const originalOutline = el.style.outline;
            const originalZ = el.style.zIndex;
            el.style.outline = '5px solid rgba(99, 102, 241, 0.8)';
            el.style.outlineOffset = '2px';
            el.style.zIndex = '10000';
            el.style.transition = 'outline 0.3s ease';
            
            setTimeout(() => {
              // Dispatch events
              ['mousedown', 'mouseup', 'click'].forEach(type => {
                el.dispatchEvent(new MouseEvent(type, { bubbles: true, cancelable: true, view: window }));
              });
              el.style.outline = originalOutline;
              el.style.zIndex = originalZ;
            }, 600); // 600ms gaze time
            
            return "Clicked";
          }
          throw new Error(`Element not found: ${selector}`);
        },
        args: [step.selector]
      });

    case 'type':
      return chrome.scripting.executeScript({
        target: { tabId: targetTabId },
        func: async (selector, text) => {
          const el = document.querySelector(selector);
          if (el) {
            el.scrollIntoView({ behavior: 'smooth', block: 'center' });
            el.focus();
            el.value = ''; 
            
            // Gaze / Highlight
            const originalOutline = el.style.outline;
            el.style.outline = '5px solid rgba(99, 102, 241, 0.8)';
            el.style.outlineOffset = '2px';
            el.style.transition = 'outline 0.3s ease';

            // Human-like typing after gaze
            setTimeout(async () => {
              for (const char of text) {
                document.execCommand('insertText', false, char);
                await new Promise(r => setTimeout(r, 20 + Math.random() * 50));
              }
              el.dispatchEvent(new Event('input', { bubbles: true }));
              el.dispatchEvent(new Event('change', { bubbles: true }));
              el.style.outline = originalOutline;
            }, 600);
            return "Typed";
          }
          throw new Error(`Element not found: ${selector}`);
        },
        args: [step.selector, step.text]
      });

    case 'scroll':
      return chrome.scripting.executeScript({
        target: { tabId: targetTabId },
        func: (direction) => {
          window.scrollBy({
            top: direction === 'down' ? 500 : -500,
            behavior: 'smooth'
          });
          return "Scrolled";
        },
        args: [step.direction || 'down']
      });

    case 'press':
      return chrome.scripting.executeScript({
        target: { tabId: targetTabId },
        func: (selector, key) => {
          const el = (selector ? document.querySelector(selector) : null) || document.activeElement;
          if (el) {
              const event = new KeyboardEvent('keydown', { key: key, code: key, keyCode: key === 'Enter' ? 13 : 0, bubbles: true });
              el.dispatchEvent(event);
              const upEvent = new KeyboardEvent('keyup', { key: key, code: key, keyCode: key === 'Enter' ? 13 : 0, bubbles: true });
              el.dispatchEvent(upEvent);
              return "Pressed";
          }
          return "No element found to press key";
        },
        args: [step.selector, step.key]
      });

    case 'createTab':
      const newTab = await chrome.tabs.create({ url: step.url });
      return { tabId: newTab.id, status: "Created" };

    case 'switchTab':
      await chrome.tabs.update(step.tabId, { active: true });
      return "Switched";

    case 'closeTab':
      await chrome.tabs.remove(step.tabId || targetTabId);
      return "Closed";

    case 'wait':
      return new Promise(resolve => setTimeout(resolve, step.time || 2000));

    default:
      throw new Error(`Unknown action: ${step.action}`);
  }
}
