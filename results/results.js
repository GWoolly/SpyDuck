// results.js - Displays the results from Spy Duck jobs

document.addEventListener('DOMContentLoaded', () => {
  loadResults();
  setupEventListeners();
});

// Load results from storage
function loadResults() {
  browser.storage.local.get(['lastResults', 'lastRunTime'], result => {
    const results = result.lastResults || [];
    
    // Update info section
    if (result.lastRunTime) {
      document.getElementById('last-run-time').textContent = formatDate(new Date(result.lastRunTime));
    } else {
      document.getElementById('last-run-time').textContent = 'Never';
    }
    
    document.getElementById('result-count').textContent = results.length.toString();
    
    // Display results
    displayResults(results);
  });
}

// Display results in table
function displayResults(results) {
  const resultsBody = document.getElementById('results-body');
  const emptyMessage = document.getElementById('empty-message');
  
  // Clear existing results
  resultsBody.innerHTML = '';
  
  // Show empty message if no results
  if (results.length === 0) {
    resultsBody.innerHTML = '';
    emptyMessage.classList.remove('hidden');
    return;
  }
  
  emptyMessage.classList.add('hidden');
  
  // Add each result to table
  results.forEach(result => {
    const row = document.createElement('tr');
    
    // Name column
    const nameCell = document.createElement('td');
    nameCell.textContent = result.name;
    row.appendChild(nameCell);
    
    // URL column
    const urlCell = document.createElement('td');
    const urlLink = document.createElement('a');
    urlLink.href = result.url;
    urlLink.textContent = truncateText(result.url, 40);
    urlLink.target = '_blank';
    urlCell.appendChild(urlLink);
    row.appendChild(urlCell);
    
    // Type column
    const typeCell = document.createElement('td');
    typeCell.textContent = result.type === 'difference' ? 'Change' : 'Content';
    typeCell.className = result.type;
    row.appendChild(typeCell);
    
    // Content column
    const contentCell = document.createElement('td');
    if (result.type === 'difference') {
      contentCell.textContent = 'Content changed';
    } else {
      contentCell.textContent = truncateText(result.result, 100);
    }
    row.appendChild(contentCell);
    
    // Actions column
    const actionsCell = document.createElement('td');
    const viewButton = document.createElement('button');
    viewButton.className = 'table-action';
    viewButton.innerHTML = '<i class="fas fa-eye"></i>';
    viewButton.addEventListener('click', () => {
      showContentViewer(result);
    });
    actionsCell.appendChild(viewButton);
    row.appendChild(actionsCell);
    
    resultsBody.appendChild(row);
  });
}

// Show content viewer modal
function showContentViewer(result) {
  const contentViewer = document.getElementById('content-viewer');
  const contentTitle = document.getElementById('content-title');
  const contentBody = document.getElementById('content-body');
  
  contentTitle.textContent = result.name;
  
  if (result.type === 'difference') {
    contentBody.innerHTML = '<div class="alert">Content has changed since last check.</div>';
  } else {
    // Format content with proper line breaks
    contentBody.innerHTML = result.result.replace(/\n/g, '<br>');
  }
  
  contentViewer.classList.remove('hidden');
}

// Setup event listeners
function setupEventListeners() {
  // Close content viewer
  document.getElementById('close-viewer-btn').addEventListener('click', () => {
    document.getElementById('content-viewer').classList.add('hidden');
  });
  
  // Run filters button
  document.getElementById('run-filters-btn').addEventListener('click', applyFilters);
  
  // Export to CSV button
  document.getElementById('export-btn').addEventListener('click', exportToCSV);
  
  // Search input
  document.getElementById('search-input').addEventListener('input', applyFilters);
  
  // Filter select
  document.getElementById('filter-select').addEventListener('change', applyFilters);
}

// Apply filters to results
function applyFilters() {
  browser.storage.local.get('lastResults', result => {
    let filteredResults = result.lastResults || [];
    const searchTerm = document.getElementById('search-input').value.toLowerCase();
    const filterType = document.getElementById('filter-select').value;
    
    // Filter by search term
    if (searchTerm) {
      filteredResults = filteredResults.filter(result => 
        result.name.toLowerCase().includes(searchTerm) || 
        (result.result && result.result.toLowerCase().includes(searchTerm))
      );
    }
    
    // Filter by type
    if (filterType !== 'all') {
      filteredResults = filteredResults.filter(result => result.type === filterType);
    }
    
    // Display filtered results
    displayResults(filteredResults);
  });
}

// Export results to CSV
function exportToCSV() {
  browser.storage.local.get('lastResults', result => {
    const results = result.lastResults || [];
    
    if (results.length === 0) {
      alert('No results to export.');
      return;
    }
    
    let csvContent = 'data:text/csv;charset=utf-8,';
    csvContent += 'Name,URL,Type,Content\n';
    
    results.forEach(item => {
      let content = item.type === 'difference' ? 'Content changed' : item.result;
      // Escape quotes and commas for CSV
      content = content ? `"${content.replace(/"/g, '""')}"` : '';
      
      csvContent += `"${item.name}","${item.url}","${item.type}",${content}\n`;
    });
    
    // Create download link
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement('a');
    link.setAttribute('href', encodedUri);
    link.setAttribute('download', `spy-duck-results-${formatDate(new Date(), true)}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  });
}

// Helper functions
function truncateText(text, maxLength) {
  if (!text) return '';
  if (text.length <= maxLength) return text;
  return text.substring(0, maxLength) + '...';
}

function formatDate(date, forFilename = false) {
  if (forFilename) {
    return date.toISOString().slice(0, 19).replace(/[-:T]/g, '-');
  }
  
  return date.toLocaleString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  });
}