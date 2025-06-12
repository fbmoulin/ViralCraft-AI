/**
 * Optimized App - Clean and efficient frontend application
 * Implements performance optimizations and modern JavaScript patterns
 */

// Configuration
const config = {
  cacheEnabled: true,
  cacheTTL: 300000, // 5 minutes
  analyticsEnabled: true,
  performance: {
    lazyLoadThreshold: 100,
    debounceDelay: 300,
    animationDuration: 300
  }
};

// Cache system
const cache = new Map();
const performanceMetrics = {
  pageLoad: 0,
  firstInteraction: 0,
  apiCalls: [],
  interactions: []
};

// DOM Ready
document.addEventListener('DOMContentLoaded', initializeApp);

function initializeApp() {
  performanceMetrics.pageLoad = performance.now();

  // Initialize critical components first
  initializeNavigation();
  initializeFormHandling();
  initializeFileUpload();

  // Initialize non-critical components after a delay
  setTimeout(() => {
    initializeLazyLoading();
    initializeAnalytics();
    startPerformanceMonitoring();
  }, 100);

  // Remove loading screen
  removeLoadingScreen();
}

function initializeNavigation() {
  const tabButtons = document.querySelectorAll('.tab-button');
  const tabContents = document.querySelectorAll('.tab-content');

  tabButtons.forEach(button => {
    button.addEventListener('click', (e) => {
      e.preventDefault();
      const targetTab = button.dataset.tab;
      switchToTab(targetTab, tabButtons, tabContents);
    });
  });
}

function switchToTab(targetTab, tabButtons, tabContents) {
  // Remove active class from all tabs
  tabButtons.forEach(btn => btn.classList.remove('active'));
  tabContents.forEach(content => content.classList.remove('active'));

  // Add active class to target tab
  const targetButton = document.querySelector(`[data-tab="${targetTab}"]`);
  const targetContent = document.getElementById(targetTab);

  if (targetButton && targetContent) {
    targetButton.classList.add('active');
    targetContent.classList.add('active');
  }
}

function initializeFormHandling() {
  const forms = document.querySelectorAll('form');

  forms.forEach(form => {
    form.addEventListener('submit', handleFormSubmit);

    // Add real-time validation
    const inputs = form.querySelectorAll('input, textarea, select');
    inputs.forEach(input => {
      input.addEventListener('blur', () => validateField(input));
      input.addEventListener('input', debounce(() => {
        if (input.classList.contains('error')) {
          validateField(input);
        }
      }, config.performance.debounceDelay));
    });
  });
}

function handleFormSubmit(event) {
  event.preventDefault();
  const form = event.target;

  // Validate all fields
  const inputs = form.querySelectorAll('input[required], textarea[required], select[required]');
  let isValid = true;

  inputs.forEach(input => {
    if (!validateField(input)) {
      isValid = false;
    }
  });

  if (!isValid) {
    showNotification('Please fill in all required fields', 'error');
    return;
  }

  // Handle specific form actions
  if (form.id === 'content-form') {
    handleContentGeneration(form);
  }
}

function validateField(field) {
  const value = field.value.trim();
  let isValid = true;
  let message = '';

  if (field.hasAttribute('required') && !value) {
    isValid = false;
    message = 'This field is required';
  } else if (field.type === 'email' && value && !isValidEmail(value)) {
    isValid = false;
    message = 'Please enter a valid email address';
  }

  updateFieldValidation(field, isValid, message);
  return isValid;
}

function updateFieldValidation(field, isValid, message) {
  field.classList.toggle('error', !isValid);
  field.classList.toggle('valid', isValid);

  // Remove existing error message
  const existingError = field.parentNode.querySelector('.error-message');
  if (existingError) {
    existingError.remove();
  }

  // Add new error message if needed
  if (!isValid && message) {
    const errorElement = document.createElement('div');
    errorElement.className = 'error-message';
    errorElement.textContent = message;
    field.parentNode.appendChild(errorElement);
  }
}

function initializeFileUpload() {
  const fileInput = document.getElementById('file');
  const fileButton = document.querySelector('.file-upload-button');
  const filePreview = document.querySelector('.file-preview');

  if (!fileInput || !fileButton || !filePreview) return;

  fileButton.addEventListener('click', () => fileInput.click());

  fileInput.addEventListener('change', (e) => {
    const file = e.target.files[0];
    if (file) {
      displayFilePreview(file, filePreview);
    }
  });
}

function displayFilePreview(file, container) {
  container.innerHTML = '';

  const preview = document.createElement('div');
  preview.className = 'file-preview-item';

  const fileInfo = document.createElement('div');
  fileInfo.className = 'file-info';
  fileInfo.innerHTML = `
    <div class="file-name">${file.name}</div>
    <div class="file-size">${formatFileSize(file.size)}</div>
  `;

  const removeButton = document.createElement('button');
  removeButton.type = 'button';
  removeButton.className = 'file-remove';
  removeButton.textContent = '×';
  removeButton.addEventListener('click', () => {
    container.innerHTML = '';
    document.getElementById('file').value = '';
  });

  preview.appendChild(fileInfo);
  preview.appendChild(removeButton);
  container.appendChild(preview);
}

function initializeLazyLoading() {
  if ('IntersectionObserver' in window) {
    const imageObserver = new IntersectionObserver((entries) => {
      entries.forEach(entry => {
        if (entry.isIntersecting) {
          const img = entry.target;
          if (img.dataset.src) {
            img.src = img.dataset.src;
            img.removeAttribute('data-src');
            imageObserver.unobserve(img);
          }
        }
      });
    });

    document.querySelectorAll('img[data-src]').forEach(img => {
      imageObserver.observe(img);
    });
  }
}

function initializeAnalytics() {
  if (!config.analyticsEnabled) return;

  document.addEventListener('click', (e) => {
    const target = e.target;
    if (target.dataset.track) {
      trackEvent(target.dataset.track, {
        element: target.tagName,
        text: target.textContent.substring(0, 50)
      });
    }
  });
}

function startPerformanceMonitoring() {
  // Record first interaction
  document.addEventListener('click', function recordFirstClick() {
    performanceMetrics.firstInteraction = performance.now();
    document.removeEventListener('click', recordFirstClick);
  }, { once: true });

  // Monitor memory usage
  if ('memory' in performance) {
    setInterval(() => {
      const memInfo = performance.memory;
      if (memInfo.usedJSHeapSize > memInfo.jsHeapSizeLimit * 0.8) {
        console.warn('High memory usage detected');
        cleanupCache();
      }
    }, 30000);
  }
}

function handleContentGeneration(form) {
  const formData = new FormData(form);
  const data = Object.fromEntries(formData.entries());

  showLoadingIndicator('Generating content...');

  fetch('/api/generate', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(data)
  })
  .then(response => response.json())
  .then(result => {
    hideLoadingIndicator();
    if (result.success) {
      displayGeneratedContent(result.content);
    } else {
      showNotification(result.error || 'Failed to generate content', 'error');
    }
  })
  .catch(error => {
    hideLoadingIndicator();
    showNotification('Network error occurred', 'error');
    console.error('Generation error:', error);
  });
}

function displayGeneratedContent(content) {
  const resultContainer = document.getElementById('result-container');
  if (!resultContainer) return;

  resultContainer.innerHTML = `
    <div class="generated-content">
      <h3>Generated Content</h3>
      <div class="content-body">${formatContent(content)}</div>
      <div class="content-actions">
        <button class="btn btn-primary" onclick="copyToClipboard('${escapeHtml(content)}')">
          Copy
        </button>
        <button class="btn btn-secondary" onclick="downloadContent('${escapeHtml(content)}')">
          Download
        </button>
      </div>
    </div>
  `;

  resultContainer.classList.remove('hidden');
  resultContainer.scrollIntoView({ behavior: 'smooth' });
}

function formatContent(content) {
  if (typeof content === 'object') {
    // Handle multiple platform content
    return Object.entries(content).map(([platform, text]) => 
      `<div class="platform-content">
        <h4>${platform}</h4>
        <p>${escapeHtml(text)}</p>
      </div>`
    ).join('');
  }

  return `<p>${escapeHtml(content)}</p>`;
}

function showLoadingIndicator(message) {
  let indicator = document.querySelector('.loading-indicator');

  if (!indicator) {
    indicator = document.createElement('div');
    indicator.className = 'loading-indicator';
    indicator.innerHTML = `
      <div class="spinner"></div>
      <div class="loading-message">${message}</div>
    `;
    document.body.appendChild(indicator);
  }

  indicator.querySelector('.loading-message').textContent = message;
  indicator.classList.add('visible');
}

function hideLoadingIndicator() {
  const indicator = document.querySelector('.loading-indicator');
  if (indicator) {
    indicator.classList.remove('visible');
    setTimeout(() => {
      if (indicator.parentNode) {
        indicator.parentNode.removeChild(indicator);
      }
    }, 300);
  }
}

function showNotification(message, type = 'info') {
  const notification = document.createElement('div');
  notification.className = `notification notification-${type}`;
  notification.innerHTML = `
    <div class="notification-content">${message}</div>
    <button class="notification-close">×</button>
  `;

  // Add to container or body
  let container = document.querySelector('.notifications-container');
  if (!container) {
    container = document.createElement('div');
    container.className = 'notifications-container';
    document.body.appendChild(container);
  }

  container.appendChild(notification);

  // Auto-remove after 5 seconds
  setTimeout(() => {
    if (notification.parentNode) {
      notification.classList.add('fade-out');
      setTimeout(() => {
        if (notification.parentNode) {
          notification.parentNode.removeChild(notification);
        }
      }, 300);
    }
  }, 5000);

  // Close button
  notification.querySelector('.notification-close').addEventListener('click', () => {
    notification.classList.add('fade-out');
    setTimeout(() => {
      if (notification.parentNode) {
        notification.parentNode.removeChild(notification);
      }
    }, 300);
  });
}

function removeLoadingScreen() {
  const loadingScreen = document.getElementById('loading-screen');
  if (loadingScreen) {
    setTimeout(() => {
      loadingScreen.classList.add('fade-out');
      setTimeout(() => {
        loadingScreen.style.display = 'none';
      }, 500);
    }, 800);
  }
}

// Utility functions
function debounce(func, wait) {
  let timeout;
  return function executedFunction(...args) {
    const later = () => {
      clearTimeout(timeout);
      func(...args);
    };
    clearTimeout(timeout);
    timeout = setTimeout(later, wait);
  };
}

function isValidEmail(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

function formatFileSize(bytes) {
  if (bytes === 0) return '0 Bytes';
  const k = 1024;
  const sizes = ['Bytes', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

function escapeHtml(unsafe) {
  return unsafe
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function copyToClipboard(text) {
  navigator.clipboard.writeText(text).then(() => {
    showNotification('Content copied to clipboard', 'success');
  }).catch(() => {
    // Fallback for older browsers
    const textarea = document.createElement('textarea');
    textarea.value = text;
    document.body.appendChild(textarea);
    textarea.select();
    document.execCommand('copy');
    document.body.removeChild(textarea);
    showNotification('Content copied to clipboard', 'success');
  });
}

function downloadContent(content) {
  const blob = new Blob([content], { type: 'text/plain' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `content-${Date.now()}.txt`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

function trackEvent(eventName, data) {
  performanceMetrics.interactions.push({
    event: eventName,
    data,
    timestamp: Date.now()
  });

  // Limit array size
  if (performanceMetrics.interactions.length > 100) {
    performanceMetrics.interactions.splice(0, 50);
  }
}

function cleanupCache() {
  const now = Date.now();
  for (const [key, value] of cache.entries()) {
    if (value.timestamp && (now - value.timestamp) > config.cacheTTL) {
      cache.delete(key);
    }
  }
}

// Global API for external access
window.ViralCraft = {
  showNotification,
  trackEvent,
  cache
};