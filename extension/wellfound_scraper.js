/**
 * Wellfound Scraper Content Script
 * Extracts job details from the current page.
 */

function extractWellfoundJob() {
  const jobTitle = document.querySelector('h1')?.innerText || 'Unknown Job';
  const companyName = document.querySelector('.u-colorGray3 .u-fontSize18')?.innerText || 
                      document.title.split(' at ')[1]?.split(' • ')[0] || 'Unknown Company';
  
  // Find the description - can be tricky depending on the view
  const description = document.querySelector('.description-content')?.innerText || 
                      document.querySelector('.job-description')?.innerText || 
                      Array.from(document.querySelectorAll('h2')).find(h => h.innerText.includes('About the job'))?.nextElementSibling?.innerText ||
                      "Full description on page";

  return { jobTitle, companyName, description: description.substring(0, 1500) };
}

// Listen for messages from the sidepanel
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.type === 'SCRAPE_WELLFOUND') {
    const data = extractWellfoundJob();
    sendResponse({ success: true, data });
  }
});
