// Background script for Spy Duck

// Initialize storage with default values if not set
browser.runtime.onInstalled.addListener(() => {
  browser.storage.local.get(['jobs', 'filters', 'config'], result => {
    if (!result.jobs) {
      browser.storage.local.set({ jobs: [] });
    }
    if (!result.filters) {
      browser.storage.local.set({ filters: [] });
    }
    if (!result.config) {
      browser.storage.local.set({
        config: {
          discord_webhook: '',
          schedule: {
            interval: 1, // hours
            startTime: '08:00',
            endTime: '18:00',
            days: [1, 2, 3, 4, 5] // Monday to Friday
          },
          notifications: {
            sound: true,
            badge: true
          }
        }
      });
    }
    
    // Set up initial alarm
    setupAlarms();
  });
});

// Function to set up alarms based on config
function setupAlarms() {
  browser.storage.local.get('config', result => {
    const config = result.config;
    
    // Clear existing alarms
    browser.alarms.clearAll();
    
    // Create new alarm
    browser.alarms.create('runJobs', {
      periodInMinutes: config.schedule.interval * 60
    });
  });
}

// Listen for alarm
browser.alarms.onAlarm.addListener(alarm => {
  if (alarm.name === 'runJobs') {
    checkScheduleAndRun();
  }
});

// Check if current time is within scheduled time
function checkScheduleAndRun() {
  browser.storage.local.get('config', result => {
    const config = result.config;
    const now = new Date();
    const currentDay = now.getDay(); // 0 = Sunday, 1 = Monday, ...
    
    // Check if today is a scheduled day
    if (!config.schedule.days.includes(currentDay)) {
      return;
    }
    
    // Parse schedule times
    const startTime = parseTimeString(config.schedule.startTime);
    const endTime = parseTimeString(config.schedule.endTime);
    const currentTime = now.getHours() * 60 + now.getMinutes();
    
    // Check if current time is within schedule
    if (currentTime >= startTime && currentTime <= endTime) {
      runAllJobs();
    }
  });
}

// Parse time string (HH:MM) to minutes since midnight
function parseTimeString(timeString) {
  const [hours, minutes] = timeString.split(':').map(Number);
  return hours * 60 + minutes;
}

// Function to run all jobs
// Modify the runAllJobs function in background.js
function runAllJobs() {
  browser.storage.local.get(['jobs', 'config'], result => {
    const jobs = result.jobs;
    const config = result.config;
    let results = [];
    let jobIndex = 0;
    
    // Process jobs sequentially
    function processNextJob() {
      if (jobIndex >= jobs.length) {
        // All jobs completed
        processResults(results, config);
        return;
      }
      
      const job = jobs[jobIndex];
      jobIndex++;
      
      console.log(`Processing job: ${job.name}`);
      
      // Open the page in a background tab
      browser.tabs.create({ url: job.url, active: false }).then(tab => {
        console.log(`Created tab ${tab.id} for job`);
        
        // Set a timeout in case page takes too long to load
        const timeoutId = setTimeout(() => {
          console.log(`Job timeout for tab ${tab.id}`);
          browser.tabs.remove(tab.id).then(() => {
            processNextJob();
          }).catch(e => {
            console.error("Error closing tab:", e);
            processNextJob();
          });
        }, 30000); // 30 seconds timeout
        
        // Listen for completion message from content script
        const messageListener = function(message, sender) {
          if (sender.tab && sender.tab.id === tab.id && message.action === 'jobCompleted') {
            console.log(`Job completed in tab ${tab.id}`);
            clearTimeout(timeoutId);
            browser.runtime.onMessage.removeListener(messageListener);
            
            // Process job result
            const result = processJobResult(job, message.data);
            if (result) {
              results.push(result);
            }
            
            // Close the tab and process next job
            browser.tabs.remove(tab.id).then(() => {
              processNextJob();
            }).catch(e => {
              console.error("Error closing tab:", e);
              processNextJob();
            });
          }
        };
        
        browser.runtime.onMessage.addListener(messageListener);
        
        // Add a loaded event listener to know when page is ready
        browser.tabs.onUpdated.addListener(function onTabLoaded(tabId, changeInfo) {
          if (tabId === tab.id && changeInfo.status === 'complete') {
            console.log(`Tab ${tab.id} loaded completely`);
            browser.tabs.onUpdated.removeListener(onTabLoaded);
            
            // Send job details to content script after page load
            browser.tabs.executeScript(tab.id, {
              code: `window.spyDuckJob = ${JSON.stringify(job)};`
            }).then(() => {
              return browser.tabs.executeScript(tab.id, {
                file: 'content.js'
              });
            }).catch(err => {
              console.error("Error injecting script:", err);
              clearTimeout(timeoutId);
              browser.tabs.remove(tab.id).then(() => {
                processNextJob();
              }).catch(e => {
                console.error("Error closing tab:", e);
                processNextJob();
              });
            });
          }
        });
      });
    }
    
    // Start processing jobs
    processNextJob();
  });
}

// Process result from a single job
function processJobResult(job, data) {
  // For difference check jobs
  if (job.checkDifference) {
    const newHash = hashData(data);
    
    if (job.lastHash && job.lastHash !== newHash) {
      // Update job with new hash
      updateJobHash(job.id, newHash);
      
      return {
        id: job.id,
        name: job.name,
        url: job.url,
        type: 'difference',
        result: 'Changed'
      };
    } else if (!job.lastHash) {
      // First run, just save the hash
      updateJobHash(job.id, newHash);
    }
    return null;
  } 
  // For content scraping jobs
  else {
    return {
      id: job.id,
      name: job.name,
      url: job.url,
      type: 'content',
      result: data
    };
  }
}

// Update job hash in storage
function updateJobHash(jobId, newHash) {
  browser.storage.local.get('jobs', result => {
    const jobs = result.jobs;
    const jobIndex = jobs.findIndex(job => job.id === jobId);
    
    if (jobIndex !== -1) {
      jobs[jobIndex].lastHash = newHash;
      browser.storage.local.set({ jobs });
    }
  });
}

// Simple hash function for data
function hashData(data) {
  let hash = 0;
  for (let i = 0; i < data.length; i++) {
    const char = data.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash; // Convert to 32bit integer
  }
  return hash.toString();
}

// Process all results after jobs complete
function processResults(results, config) {
  // Count results
  const count = results.length;
  
  // Update badge
  if (config.notifications.badge && count > 0) {
    browser.browserAction.setBadgeText({ text: count.toString() });
    browser.browserAction.setBadgeBackgroundColor({ color: '#FF5722' });
  } else {
    browser.browserAction.setBadgeText({ text: '' });
  }
  
  // Play sound if enabled and there are results
  if (config.notifications.sound && count > 0) {
    const audio = new Audio(browser.runtime.getURL('sounds/notification.mp3'));
    audio.play();
  }
  
  // Store results - make sure we're saving properly
  console.log("Saving results:", results);
  browser.storage.local.set({ 
    lastResults: results, 
    lastRunTime: new Date().toISOString() 
  }).then(() => {
    console.log("Results saved successfully");
  }).catch(err => {
    console.error("Error saving results:", err);
  });
  
  // Send to Discord webhook if configured
  if (config.discord_webhook && count > 0) {
    sendToDiscord(results, config.discord_webhook);
  }
}

// Send results to Discord webhook
function sendToDiscord(results, webhookUrl) {
  const content = {
    content: `Spy Duck found ${results.length} updates`,
    embeds: results.map(result => {
      return {
        title: result.name,
        url: result.url,
        description: result.type === 'difference' ? 'Content changed' : 'New content found',
        color: 16740152 // Orange color
      };
    })
  };
  
  fetch(webhookUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(content)
  }).catch(error => console.error('Error sending to Discord:', error));
}

// Listen for manual run request from popup
browser.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.action === 'runAllJobs') {
    runAllJobs();
    sendResponse({ status: 'started' });
  }
  return true;
});