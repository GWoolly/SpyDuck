// Content script for Spy Duck

// Global variables
let selectedElement = null;
let highlightedElements = [];
let eyedropperActive = false;

// Main function to run when script is injected
function init() {
  // Check if this is a job execution
  if (window.spyDuckJob) {
    executeJob(window.spyDuckJob);
    return;
  }
  
  // Check for eyedropper mode activation message
  browser.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.action === 'activateEyedropper') {
      activateEyedropper();
      sendResponse({ status: 'activated' });
    }
    return true;
  });
}

// Function to execute a job
function executeJob(job) {
  // Wait for page to fully load
  if (document.readyState !== 'complete') {
    window.addEventListener('load', () => executeJobOnPage(job));
  } else {
    executeJobOnPage(job);
  }
}

// Execute job on loaded page
function executeJobOnPage(job) {
  try {
    // Select elements using the stored selector
    const elements = document.querySelectorAll(job.selector);
    
    // Extract text from all matching elements
    let data = '';
    elements.forEach(element => {
      data += element.textContent.trim() + '\n';
    });
    
    // Send result back to background script
    browser.runtime.sendMessage({
      action: 'jobCompleted',
      data: data
    });
  } catch (error) {
    // Send error message if something went wrong
    browser.runtime.sendMessage({
      action: 'jobCompleted',
      error: error.message,
      data: ''  // Send empty data
    });
  }
}

// Activate eyedropper tool for element selection
function activateEyedropper() {
  if (eyedropperActive) return;
  eyedropperActive = true;
  
  // Create overlay and instructions
  const overlay = document.createElement('div');
  overlay.id = 'spy-duck-overlay';
  overlay.style.cssText = `
    position: fixed;
    top: 0;
    left: 0;
    width: 100%;
    height: 100%;
    background-color: rgba(0, 0, 0, 0.3);
    z-index: 999999;
    pointer-events: none;
  `;
  
  const instructions = document.createElement('div');
  instructions.id = 'spy-duck-instructions';
  instructions.style.cssText = `
    position: fixed;
    top: 10px;
    left: 50%;
    transform: translateX(-50%);
    background-color: #FF5722;
    color: white;
    padding: 10px 20px;
    border-radius: 5px;
    font-family: Arial, sans-serif;
    font-size: 14px;
    z-index: 1000000;
    box-shadow: 0 2px 10px rgba(0, 0, 0, 0.2);
  `;
  instructions.textContent = 'Click on an element to select it. Press ESC to cancel.';
  
  document.body.appendChild(overlay);
  document.body.appendChild(instructions);
  
  // Event listeners for hovering and selecting elements
  const mouseMoveHandler = event => {
    const target = document.elementFromPoint(event.clientX, event.clientY);
    highlightElement(target);
  };
  
	// In content.js, modify the clickHandler in activateEyedropper function
	const clickHandler = event => {
	  event.preventDefault();
	  event.stopPropagation();
	  
	  selectedElement = document.elementFromPoint(event.clientX, event.clientY);
	  const selector = generateSelector(selectedElement);
	  
	  // Store selection data in storage
	  browser.storage.local.set({
		elementSelected: true,
		selectionData: {
		  url: window.location.href,
		  selector: selector,
		  pageTitle: document.title,
		  sampleText: selectedElement.textContent.trim()
		},
		eyedropperActive: false
	  });
	  
	  // Clean up
	  clearHighlights();
	  document.body.removeChild(overlay);
	  document.body.removeChild(instructions);
	  document.removeEventListener('mousemove', mouseMoveHandler);
	  document.removeEventListener('click', clickHandler, true);
	  document.removeEventListener('keydown', escapeHandler);
	  eyedropperActive = false;
	  
	  return false;
	};

	// Modify the escapeHandler
	const escapeHandler = event => {
	  if (event.key === 'Escape') {
		// Clean up
		clearHighlights();
		document.body.removeChild(overlay);
		document.body.removeChild(instructions);
		document.removeEventListener('mousemove', mouseMoveHandler);
		document.removeEventListener('click', clickHandler, true);
		document.removeEventListener('keydown', escapeHandler);
		eyedropperActive = false;
		
		// Update storage that eyedropper was canceled
		browser.storage.local.set({ 
		  eyedropperActive: false,
		  eyedropperCanceled: true
		});
	  }
	};

  document.addEventListener('mousemove', mouseMoveHandler);
  document.addEventListener('click', clickHandler, true);
  document.addEventListener('keydown', escapeHandler);
}

// Highlight an element
function highlightElement(element) {
  clearHighlights();
  
  if (!element || element === document.documentElement || element === document.body) {
    return;
  }
  
  const originalStyle = element.getAttribute('style') || '';
  element.setAttribute('data-spy-duck-original-style', originalStyle);
  element.style.cssText = `${originalStyle}; outline: 2px solid #FF5722 !important; outline-offset: 2px !important;`;
  highlightedElements.push(element);
}

// Clear all highlights
function clearHighlights() {
  highlightedElements.forEach(element => {
    const originalStyle = element.getAttribute('data-spy-duck-original-style');
    if (originalStyle) {
      element.style.cssText = originalStyle;
      element.removeAttribute('data-spy-duck-original-style');
    } else {
      element.removeAttribute('style');
    }
  });
  
  highlightedElements = [];
}

// Generate a CSS selector for the element
function generateSelector(element) {
  // Simple ID selector
  if (element.id) {
    return `#${element.id}`;
  }
  
  // Try to use classes if available
  if (element.className && typeof element.className === 'string') {
    const classes = element.className.trim().split(/\s+/);
    if (classes.length > 0) {
      const classSelector = '.' + classes.join('.');
      // Check if this selector is unique
      if (document.querySelectorAll(classSelector).length === 1) {
        return classSelector;
      }
    }
  }
  
  // Use tag name with nth-child
  let path = [];
  let current = element;
  
  while (current && current !== document.documentElement) {
    let selector = current.tagName.toLowerCase();
    
    if (current.parentNode) {
      const siblings = Array.from(current.parentNode.children)
        .filter(child => child.tagName === current.tagName);
      
      if (siblings.length > 1) {
        const index = siblings.indexOf(current) + 1;
        selector += `:nth-child(${index})`;
      }
    }
    
    path.unshift(selector);
    current = current.parentNode;
  }
  
  return path.join(' > ');
}

// Initialize the script
init();