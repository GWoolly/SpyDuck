// Spy Duck Popup Script

// DOM Elements
const tabButtons = document.querySelectorAll('.tab-button');
const contentDivs = document.querySelectorAll('.content');

// Tab switching functionality
tabButtons.forEach(button => {
  button.addEventListener('click', () => {
    // Deactivate all tabs
    tabButtons.forEach(btn => btn.classList.remove('active'));
    contentDivs.forEach(div => div.classList.remove('active'));
    
    // Activate clicked tab
    button.classList.add('active');
    const contentId = 'content-' + button.id.substring(4); // Extract tab ID
    document.getElementById(contentId).classList.add('active');
  });
});

// Global state
let currentJobs = [];
let currentFilters = [];
let currentConfig = null;
let lastResults = [];
let isEditingJob = false;
let isEditingFilter = false;
let editingId = null;

// Initialize popup
document.addEventListener('DOMContentLoaded', () => {
  loadData();
  setupEventListeners();
});

// Load data from storage
// Add to the loadData function in popup.js
function loadData() {
  browser.storage.local.get([
    'jobs', 'filters', 'config', 'lastResults', 'lastRunTime',
    'elementSelected', 'selectionData', 'eyedropperActive', 'eyedropperCanceled'
  ], result => {
    currentJobs = result.jobs || [];
    currentFilters = result.filters || [];
    currentConfig = result.config || getDefaultConfig();
    lastResults = result.lastResults || [];
    
    // Populate UI
    populateJobsList();
    populateFiltersList();
    populateResultsList();
    populateConfigForm();
    
    // Update last run time
    if (result.lastRunTime) {
      const lastRunDate = new Date(result.lastRunTime);
      document.getElementById('last-run-time').textContent = formatDate(lastRunDate);
    }
    
    // Update result count
    document.getElementById('result-count').textContent = lastResults.length;
    
    // Handle eyedropper results if present
    if (result.elementSelected) {
      // Show job form with pre-filled data
      document.getElementById('job-details').classList.remove('hidden');
      
      // Pre-fill form with stored data
      document.getElementById('job-name').value = result.selectionData.pageTitle || 'New Job';
      document.getElementById('job-url').value = result.selectionData.url;
      document.getElementById('job-selector').value = result.selectionData.selector;
      
      // Clear the stored selection data
      browser.storage.local.remove(['elementSelected', 'selectionData']);
    }
    
    // If eyedropper was canceled, just clear the flag
    if (result.eyedropperCanceled) {
      browser.storage.local.remove('eyedropperCanceled');
    }
    
    // If eyedropper is still active in a tab, but popup reopened
    if (result.eyedropperActive && result.eyedropperTabId) {
      // Show a message that selection is in progress
      document.getElementById('jobs-list').innerHTML = 
        '<div class="message">Element selection in progress. Please click on an element in the page or press ESC to cancel.</div>';
    }
  });
}

// Get default config
function getDefaultConfig() {
  return {
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
  };
}

// Setup event listeners
function setupEventListeners() {
  // Jobs tab
  document.getElementById('add-job-btn').addEventListener('click', showJobForm);
  document.getElementById('eyedropper-btn').addEventListener('click', activateEyedropper);
  document.getElementById('job-search').addEventListener('input', filterJobs);
  document.getElementById('job-form').addEventListener('submit', saveJob);
  document.getElementById('cancel-job-btn').addEventListener('click', hideJobForm);
  
  // Filters tab
  document.getElementById('add-filter-btn').addEventListener('click', showFilterForm);
  document.getElementById('filter-search').addEventListener('input', filterFilters);
  document.getElementById('filter-form').addEventListener('submit', saveFilter);
  document.getElementById('cancel-filter-btn').addEventListener('click', hideFilterForm);
  
  // Run tab
  document.getElementById('run-now-btn').addEventListener('click', runAllJobs);
  document.getElementById('view-results-table-btn').addEventListener('click', openResultsTable);
  
  // Config tab
  document.getElementById('config-form').addEventListener('submit', saveConfig);
  document.getElementById('reset-btn').addEventListener('click', confirmReset);
}

// Jobs Tab Functions
function populateJobsList() {
  const jobsList = document.getElementById('jobs-list');
  jobsList.innerHTML = '';
  
  const searchTerm = document.getElementById('job-search').value.toLowerCase();
  
  if (currentJobs.length === 0) {
    jobsList.innerHTML = '<div class="empty-message">No jobs defined. Use the eyedropper to add a new job.</div>';
    return;
  }
  
  const filteredJobs = currentJobs.filter(job => 
    job.name.toLowerCase().includes(searchTerm) || 
    job.url.toLowerCase().includes(searchTerm)
  );
  
  if (filteredJobs.length === 0) {
    jobsList.innerHTML = '<div class="empty-message">No jobs match your search.</div>';
    return;
  }
  
  filteredJobs.forEach(job => {
    const jobItem = document.createElement('div');
    jobItem.className = 'list-item';
    jobItem.dataset.id = job.id;
    
    jobItem.innerHTML = `
      <div class="title">${job.name}</div>
      <div class="subtitle">${job.url}</div>
      <div class="actions">
        <button class="edit" title="Edit"><i class="fas fa-edit"></i></button>
        <button class="delete" title="Delete"><i class="fas fa-trash"></i></button>
      </div>
    `;
    
    // Add click event
    jobItem.addEventListener('click', (e) => {
      // Don't trigger if clicking edit or delete button
      if (e.target.closest('.actions')) {
        return;
      }
      selectJob(job);
    });
    
    // Add edit button event
    jobItem.querySelector('.edit').addEventListener('click', () => {
      editJob(job);
    });
    
    // Add delete button event
    jobItem.querySelector('.delete').addEventListener('click', (e) => {
      e.stopPropagation();
      deleteJob(job.id);
    });
    
    jobsList.appendChild(jobItem);
  });
}

function filterJobs() {
  populateJobsList();
}

function selectJob(job) {
  // Highlight selected job
  document.querySelectorAll('#jobs-list .list-item').forEach(item => {
    item.classList.remove('active');
  });
  
  document.querySelector(`.list-item[data-id="${job.id}"]`).classList.add('active');
}

function showJobForm() {
  document.getElementById('job-details').classList.remove('hidden');
  document.getElementById('job-form').reset();
  isEditingJob = false;
}

function hideJobForm() {
  document.getElementById('job-details').classList.add('hidden');
}

function editJob(job) {
  document.getElementById('job-details').classList.remove('hidden');
  
  // Populate form
  document.getElementById('job-name').value = job.name;
  document.getElementById('job-url').value = job.url;
  document.getElementById('job-selector').value = job.selector;
  document.getElementById('job-difference').checked = job.checkDifference || false;
  
  isEditingJob = true;
  editingId = job.id;
}

function saveJob(e) {
  e.preventDefault();
  
  const jobData = {
    name: document.getElementById('job-name').value.trim(),
    url: document.getElementById('job-url').value.trim(),
    selector: document.getElementById('job-selector').value.trim(),
    checkDifference: document.getElementById('job-difference').checked
  };
  
  if (isEditingJob) {
    // Update existing job
    const index = currentJobs.findIndex(job => job.id === editingId);
    if (index !== -1) {
      jobData.id = editingId;
      jobData.lastHash = currentJobs[index].lastHash; // Preserve lastHash if exists
      currentJobs[index] = jobData;
    }
  } else {
    // Create new job
    jobData.id = generateId();
    currentJobs.push(jobData);
  }
  
  // Save to storage
  browser.storage.local.set({ jobs: currentJobs }, () => {
    populateJobsList();
    hideJobForm();
  });
}

function deleteJob(jobId) {
  if (confirm('Are you sure you want to delete this job?')) {
    currentJobs = currentJobs.filter(job => job.id !== jobId);
    
    // Also delete associated filters
    currentFilters = currentFilters.filter(filter => filter.jobId !== jobId);
    
    // Save to storage
    browser.storage.local.set({ 
      jobs: currentJobs,
      filters: currentFilters
    }, () => {
      populateJobsList();
      populateFiltersList();
    });
  }
}

function activateEyedropper() {
  // Store that we're in eyedropper mode
  browser.storage.local.set({ 
    eyedropperActive: true 
  });
  
  // Check if we have active tab permission
  browser.tabs.query({ active: true, currentWindow: true }).then(tabs => {
    if (tabs.length === 0) return;
    
    const activeTab = tabs[0];
    
    // Remember this tab for when popup reopens
    browser.storage.local.set({ 
      eyedropperTabId: activeTab.id 
    });
    
    // Send message to content script
    browser.tabs.sendMessage(activeTab.id, { action: 'activateEyedropper' })
      .catch(error => {
        // Content script might not be loaded, inject it
        browser.tabs.executeScript(activeTab.id, { file: '../content.js' })
          .then(() => {
            // Now send the message
            setTimeout(() => {
              browser.tabs.sendMessage(activeTab.id, { action: 'activateEyedropper' });
            }, 100);
          })
          .catch(err => {
            alert('Unable to activate element selector on this page. Make sure you are on a regular web page.');
            // Clear eyedropper state on error
            browser.storage.local.set({ eyedropperActive: false });
          });
      });
  });
}

// Filters Tab Functions
function populateFiltersList() {
  const filtersList = document.getElementById('filters-list');
  filtersList.innerHTML = '';
  
  const searchTerm = document.getElementById('filter-search').value.toLowerCase();
  
  if (currentFilters.length === 0) {
    filtersList.innerHTML = '<div class="empty-message">No filters defined. Add a filter to process job results.</div>';
    return;
  }
  
  const filteredFilters = currentFilters.filter(filter => 
    filter.name.toLowerCase().includes(searchTerm)
  );
  
  if (filteredFilters.length === 0) {
    filtersList.innerHTML = '<div class="empty-message">No filters match your search.</div>';
    return;
  }
  
  filteredFilters.forEach(filter => {
    const filterItem = document.createElement('div');
    filterItem.className = 'list-item';
    filterItem.dataset.id = filter.id;
    
	// Find associated job
	let jobName = 'Unknown Job';
	if (filter.jobId === 'all') {
	  jobName = 'All Jobs';
	} else {
	  const job = currentJobs.find(j => j.id === filter.jobId);
	  jobName = job ? job.name : 'Unknown Job';
	}
    
    filterItem.innerHTML = `
      <div class="title">${filter.name}</div>
      <div class="subtitle">Applied to: ${jobName}</div>
      <div class="actions">
        <button class="edit" title="Edit"><i class="fas fa-edit"></i></button>
        <button class="delete" title="Delete"><i class="fas fa-trash"></i></button>
      </div>
    `;
    
    // Add edit button event
    filterItem.querySelector('.edit').addEventListener('click', () => {
      editFilter(filter);
    });
    
    // Add delete button event
    filterItem.querySelector('.delete').addEventListener('click', () => {
      deleteFilter(filter.id);
    });
    
    filtersList.appendChild(filterItem);
  });
}

function filterFilters() {
  populateFiltersList();
}

function showFilterForm() {
  document.getElementById('filter-details').classList.remove('hidden');
  document.getElementById('filter-form').reset();
  
  // Populate job dropdown
  const jobSelect = document.getElementById('filter-job');
  jobSelect.innerHTML = '<option value="all">All Jobs</option><option value="">Select a job...</option>';
  
  currentJobs.forEach(job => {
    const option = document.createElement('option');
    option.value = job.id;
    option.textContent = job.name;
    jobSelect.appendChild(option);
  });
  
  isEditingFilter = false;
}

function hideFilterForm() {
  document.getElementById('filter-details').classList.add('hidden');
}

function editFilter(filter) {
  showFilterForm(); // This will populate the job dropdown
  
  // Populate form
  document.getElementById('filter-name').value = filter.name;
  document.getElementById('filter-job').value = filter.jobId;
  document.getElementById('filter-include').value = filter.includeKeywords.join(', ');
  document.getElementById('filter-exclude').value = filter.excludeWords.join(', ');
  
  isEditingFilter = true;
  editingId = filter.id;
}

function saveFilter(e) {
  e.preventDefault();
  
  const jobId = document.getElementById('filter-job').value;
  
  // Validate job selection
  if (!jobId) {
    alert('Please select a job for this filter.');
    return;
  }
  
  // Parse keywords and exclude words
  const includeKeywords = document.getElementById('filter-include').value
    .split(',')
    .map(word => word.trim())
    .filter(word => word.length > 0);
    
  const excludeWords = document.getElementById('filter-exclude').value
    .split(',')
    .map(word => word.trim())
    .filter(word => word.length > 0);
  
  const filterData = {
    name: document.getElementById('filter-name').value.trim(),
    jobId,
    includeKeywords,
    excludeWords
  };
  
  if (isEditingFilter) {
    // Update existing filter
    const index = currentFilters.findIndex(filter => filter.id === editingId);
    if (index !== -1) {
      filterData.id = editingId;
      currentFilters[index] = filterData;
    }
  } else {
    // Create new filter
    filterData.id = generateId();
    currentFilters.push(filterData);
  }
  
  // Save to storage
  browser.storage.local.set({ filters: currentFilters }, () => {
    populateFiltersList();
    hideFilterForm();
  });
}

function deleteFilter(filterId) {
  if (confirm('Are you sure you want to delete this filter?')) {
    currentFilters = currentFilters.filter(filter => filter.id !== filterId);
    
    // Save to storage
    browser.storage.local.set({ filters: currentFilters }, () => {
      populateFiltersList();
    });
  }
}

// Run Tab Functions
function populateResultsList() {
  const resultsList = document.getElementById('results-list');
  resultsList.innerHTML = '';
  
  if (lastResults.length === 0) {
    resultsList.innerHTML = '<div class="empty-message">No results yet. Run jobs to see results here.</div>';
    return;
  }
  
  lastResults.forEach(result => {
    const resultItem = document.createElement('div');
    resultItem.className = 'result-item';
    
    if (result.type === 'difference') {
      resultItem.innerHTML = `
        <div class="title">${result.name} <span class="badge difference">Changed</span></div>
        <div class="url">${result.url}</div>
      `;
    } else {
      resultItem.innerHTML = `
        <div class="title">${result.name} <span class="badge content">Content</span></div>
        <div class="url">${result.url}</div>
        <div class="content">${truncateText(result.result, 200)}</div>
      `;
    }
    
    resultsList.appendChild(resultItem);
  });
}

function truncateText(text, maxLength) {
  if (text.length <= maxLength) return text;
  return text.substring(0, maxLength) + '...';
}

function runAllJobs() {
  if (currentJobs.length === 0) {
    alert('No jobs defined. Please add jobs first.');
    return;
  }
  
  // Show loading state
  const runButton = document.getElementById('run-now-btn');
  const originalText = runButton.innerHTML;
  runButton.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Running...';
  runButton.disabled = true;
  
  // Send message to background script
  browser.runtime.sendMessage({ action: 'runAllJobs' }).then(response => {
    // Update UI
    document.getElementById('last-run-time').textContent = formatDate(new Date());
    
    // Reset button after a delay
    setTimeout(() => {
      runButton.innerHTML = originalText;
      runButton.disabled = false;
      
      // Reload results
      loadData();
    }, 2000);
  });
}

function openResultsTable() {
  browser.tabs.create({
    url: '../results/results.html'
  });
}

// Config Tab Functions
function populateConfigForm() {
  if (!currentConfig) return;
  
  // Discord webhook
  document.getElementById('discord-webhook').value = currentConfig.discord_webhook || '';
  
  // Schedule settings
  document.getElementById('schedule-interval').value = currentConfig.schedule.interval;
  document.getElementById('schedule-start-time').value = currentConfig.schedule.startTime;
  document.getElementById('schedule-end-time').value = currentConfig.schedule.endTime;
  
  // Days
  document.querySelectorAll('.day-checkbox input').forEach(checkbox => {
    checkbox.checked = currentConfig.schedule.days.includes(parseInt(checkbox.value));
  });
  
  // Notification settings
  document.getElementById('notify-sound').checked = currentConfig.notifications.sound;
  document.getElementById('notify-badge').checked = currentConfig.notifications.badge;
}

function saveConfig(e) {
  e.preventDefault();
  
  // Collect selected days
  const selectedDays = [];
  document.querySelectorAll('.day-checkbox input:checked').forEach(checkbox => {
    selectedDays.push(parseInt(checkbox.value));
  });
  
  const configData = {
    discord_webhook: document.getElementById('discord-webhook').value.trim(),
    schedule: {
      interval: parseInt(document.getElementById('schedule-interval').value),
      startTime: document.getElementById('schedule-start-time').value,
      endTime: document.getElementById('schedule-end-time').value,
      days: selectedDays
    },
    notifications: {
      sound: document.getElementById('notify-sound').checked,
      badge: document.getElementById('notify-badge').checked
    }
  };
  
  // Save to storage
  browser.storage.local.set({ config: configData }, () => {
    currentConfig = configData;
    
    // Show success message
    const saveButton = e.target.querySelector('button[type="submit"]');
    const originalText = saveButton.innerHTML;
    saveButton.innerHTML = '<i class="fas fa-check"></i> Saved!';
    setTimeout(() => {
      saveButton.innerHTML = originalText;
    }, 2000);
    
    // Update alarms
    browser.runtime.sendMessage({ action: 'updateAlarms' });
  });
}

function confirmReset() {
  if (confirm('This will delete all jobs, filters, and results. Are you sure?')) {
    browser.storage.local.clear().then(() => {
      // Reload data with defaults
      currentJobs = [];
      currentFilters = [];
      currentConfig = getDefaultConfig();
      lastResults = [];
      
      // Update UI
      populateJobsList();
      populateFiltersList();
      populateResultsList();
      populateConfigForm();
      
      document.getElementById('last-run-time').textContent = 'Never';
      document.getElementById('result-count').textContent = '0';
      
      // Show confirmation
      alert('All data has been reset.');
    });
  }
}

// Utility Functions
function generateId() {
  return 'id_' + Math.random().toString(36).substr(2, 9);
}

function formatDate(date) {
  return date.toLocaleString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  });
}