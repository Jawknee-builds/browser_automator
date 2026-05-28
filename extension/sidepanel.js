const promptInput = document.getElementById('prompt-input');
const executeBtn = document.getElementById('execute-btn');
const logsArea = document.getElementById('logs');
const statusBadge = document.getElementById('status-badge');
const scheduleToggle = document.getElementById('schedule-toggle');
const scheduleTime = document.getElementById('schedule-time');
const scheduledContainer = document.getElementById('scheduled-tasks-container');
const scheduledList = document.getElementById('scheduled-tasks-list');
const wellfoundBtn = document.getElementById('wellfound-autopilot');
const stopBtn = document.getElementById('stop-btn');
let isRunning = false;

// Toggle schedule input visibility
scheduleToggle.addEventListener('change', () => {
    scheduleTime.style.display = scheduleToggle.checked ? 'block' : 'none';
    if (!isRunning) {
        executeBtn.textContent = scheduleToggle.checked ? 'Schedule Task' : 'Execute Now';
    }
});

stopBtn.addEventListener('click', () => {
    isRunning = false;
    addLog('Stopping automation...', 'error');
    statusBadge.textContent = 'Stopping';
    setTimeout(() => {
        statusBadge.textContent = 'Idle';
        statusBadge.className = 'idle';
        stopBtn.style.display = 'none';
        executeBtn.style.display = 'block';
    }, 1000);
});

async function loadScheduledTasks() {
    try {
        const res = await fetch('http://localhost:3001/api/tasks');
        const tasks = await res.json();
        renderTasks(tasks);
    } catch (e) { console.error(e); }
}

function renderTasks(tasks) {
    scheduledList.innerHTML = '';
    if (tasks.length === 0) {
        scheduledContainer.style.display = 'none';
        return;
    }
    scheduledContainer.style.display = 'block';
    tasks.forEach(task => {
        const div = document.createElement('div');
        div.className = 'scheduled-item';
        const dateStr = new Date(task.scheduledAt).toLocaleString();
        div.innerHTML = `
            <span>${task.prompt.substring(0, 20)}... <br><small>${dateStr}</small></span>
            <span class="remove-task" data-id="${task.id}">Remove</span>
        `;
        scheduledList.appendChild(div);
    });

    document.querySelectorAll('.remove-task').forEach(btn => {
        btn.onclick = async () => {
            await fetch(`http://localhost:3001/api/tasks/${btn.dataset.id}`, { method: 'DELETE' });
            loadScheduledTasks();
        };
    });
}

loadScheduledTasks();

executeBtn.addEventListener('click', async () => {
    const prompt = promptInput.value;
    if (!prompt) return;

    if (scheduleToggle.checked) {
        const time = scheduleTime.value;
        if (!time) return alert('Please set a time');
        try {
            await fetch('http://localhost:3001/api/schedule', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ prompt, scheduledAt: time })
            });
            alert('Scheduled!');
            loadScheduledTasks();
        } catch (e) { alert(e.message); }
        return;
    }

    isRunning = true;
    statusBadge.textContent = 'Scanning Page...';
    statusBadge.className = 'running';
    executeBtn.style.display = 'none';
    stopBtn.style.display = 'block';
    logsArea.innerHTML = '<div class="log-entry info">Scanning page content...</div>';

    // Get All Tabs context
    const allTabs = await chrome.tabs.query({});
    const [currentTab] = await chrome.tabs.query({ active: true, currentWindow: true });

    chrome.scripting.executeScript({
        target: { tabId: currentTab.id },
        func: () => {
            const elements = Array.from(document.querySelectorAll('button, a, input, [role="button"], [role="link"], textarea'));
            const metaDesc = document.querySelector('meta[name="description"]');
            
            return {
                title: document.title,
                description: metaDesc ? metaDesc.content : '',
                map: elements.map((el, index) => {
                    const id = `automator-${index}`;
                    el.setAttribute('data-automator-id', id);
                    return {
                        id: id,
                        tag: el.tagName,
                        role: (el.getAttribute('role') || el.type || '').substring(0, 20),
                        text: (el.innerText || el.value || el.placeholder || el.ariaLabel || '').substring(0, 50).trim(), 
                        aria: (el.getAttribute('aria-label') || '').substring(0, 50),
                        visible: el.offsetWidth > 0 && el.offsetHeight > 0
                    };
                }).filter(item => item.visible && item.text.length > 2).slice(0, 50)
            };
        }
    }, (results) => {
        const pageData = results[0].result;
        statusBadge.textContent = 'Planning...';
        addLog(`Analyzing ${pageData.title}...`, 'info');

        chrome.runtime.sendMessage({ 
            type: "GET_PLAN", 
            prompt, 
            context: {
                url: currentTab.url,
                title: pageData.title,
                description: pageData.description,
                interactiveMap: pageData.map,
                allTabs: allTabs.map(t => ({ id: t.id, title: t.title, url: t.url })),
                currentTabId: currentTab.id
            } 
        }, async (response) => {
            if (!isRunning) return resetState();
            
            if (!response || !response.success) {
                addLog(`Error: ${response ? response.error : 'No response'}`, 'error');
                return resetState('Error');
            }

            const steps = response.steps || [];
            if (steps.length === 0) {
                addLog("AI couldn't generate a plan.", 'error');
                return resetState('Idle');
            }
            
            addLog(`Plan: ${steps.length} steps.`, 'info');
            statusBadge.textContent = 'Running';

            for (const step of steps) {
                if (!isRunning) break;
                addLog(`Executing: ${step.action}`, 'info');
                try {
                    // Mandatory human-like pause between actions
                    await new Promise(r => setTimeout(r, 800 + Math.random() * 1000));
                    await sendExecuteMessage(step);
                    addLog(`Success: ${step.action}`, 'success');
                } catch (err) {
                    addLog(`Failed: ${err.message}`, 'error');
                    break; 
                }
            }
            
            resetState(isRunning ? 'Finished' : 'Stopped');
            if (isRunning) addLog('Automation complete!', 'success');
        });
    });
});

wellfoundBtn.addEventListener('click', async () => {
    isRunning = true;
    statusBadge.textContent = 'Scraping Job...';
    statusBadge.className = 'running';
    addLog('Locating job details on page...', 'info');

    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    
    // 1. Scrape Wellfound
    chrome.tabs.sendMessage(tab.id, { type: 'SCRAPE_WELLFOUND' }, async (response) => {
        if (!response || !response.success) {
            addLog("Couldn't scrape job info. Ensure you're on a Wellfound job page.", 'error');
            return resetState('Error');
        }

        const { jobTitle, companyName, description } = response.data;
        addLog(`Scraped: ${jobTitle} @ ${companyName}`, 'success');
        statusBadge.textContent = 'Consulting Qwen...';

        // 2. Generate Note via Backend (Qwen)
        try {
            const res = await fetch('http://localhost:3001/api/generate-job-note', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    jobInfo: `${jobTitle} at ${companyName}. Description: ${description}`,
                    userBackground: "Industrial Engineering at MIT Manipal, GoPerch TPM, YOLO/Raspberry Pi project"
                })
            });
            const { note } = await res.json();
            addLog(`Qwen Note Generated!`, 'success');
            addLog(`"${note.substring(0, 50)}..."`, 'info');

            // 3. Plan the drafting steps
            statusBadge.textContent = 'Drafting...';
            // Note: In refined mode, we could use the note directly in an EXECUTE_STEP.
            // For now, we'll use the existing planner but force the note into the prompt.
            const prompt = `Apply for this job: ${jobTitle} at ${companyName}. Use this note: "${note}".`;
            
            chrome.runtime.sendMessage({ 
                type: "GET_PLAN", 
                prompt,
                context: { title: jobTitle, currentTabId: tab.id }
            }, async (planRes) => {
                if (!planRes || !planRes.success) return resetState('Error');
                
                for (const step of planRes.steps) {
                    if (!isRunning) break;
                    addLog(`Executing: ${step.action}...`, 'info');
                    await new Promise(r => setTimeout(r, 1000 + Math.random() * 500));
                    await sendExecuteMessage(step);
                }
                resetState('Complete');
                addLog('Drafted! Review and click Send.', 'success');
            });

        } catch (e) {
            addLog(`Error: ${e.message}`, 'error');
            resetState('Error');
        }
    });
});

function resetState(status = 'Idle') {
    isRunning = false;
    statusBadge.textContent = status;
    statusBadge.className = status.toLowerCase();
    executeBtn.style.display = 'block';
    stopBtn.style.display = 'none';
}

function addLog(message, type) {
    const div = document.createElement('div');
    div.className = `log-entry ${type}`;
    div.textContent = message;
    logsArea.appendChild(div);
    logsArea.scrollTop = logsArea.scrollHeight;
}

function sendExecuteMessage(step) {
    return new Promise((resolve, reject) => {
        chrome.runtime.sendMessage({ type: "EXECUTE_STEP", step }, (res) => {
            if (res && res.success) resolve(res.result);
            else reject(new Error(res ? res.error : "Execution error"));
        });
    });
}
