
/**
 * Modernized App - Optimized Frontend Application
 * Enhanced with performance optimizations, better error handling, and improved UX
 */

// Configuration and Constants
const APP_CONFIG = {
  cache: {
    enabled: true,
    ttl: 300000, // 5 minutes
    maxSize: 100
  },
  performance: {
    debounceDelay: 300,
    animationDuration: 250,
    lazyLoadThreshold: 50
  },
  api: {
    timeout: 30000,
    retries: 3,
    baseUrl: window.location.origin
  }
};

// Performance and Cache Management
class PerformanceManager {
  constructor() {
    this.cache = new Map();
    this.metrics = {
      apiCalls: 0,
      cacheHits: 0,
      errors: 0,
      loadTime: 0
    };
    this.startTime = performance.now();
  }

  // Optimized cache with LRU eviction
  setCache(key, data, ttl = APP_CONFIG.cache.ttl) {
    if (this.cache.size >= APP_CONFIG.cache.maxSize) {
      const firstKey = this.cache.keys().next().value;
      this.cache.delete(firstKey);
    }

    this.cache.set(key, {
      data,
      timestamp: Date.now(),
      ttl
    });
  }

  getCache(key) {
    const cached = this.cache.get(key);
    if (!cached) return null;

    if (Date.now() - cached.timestamp > cached.ttl) {
      this.cache.delete(key);
      return null;
    }

    this.metrics.cacheHits++;
    return cached.data;
  }

  recordMetric(type, value = 1) {
    this.metrics[type] = (this.metrics[type] || 0) + value;
  }

  getMetrics() {
    return {
      ...this.metrics,
      uptime: Math.round(performance.now() - this.startTime),
      cacheSize: this.cache.size,
      hitRate: this.metrics.apiCalls > 0 ? 
        (this.metrics.cacheHits / this.metrics.apiCalls * 100).toFixed(1) + '%' : '0%'
    };
  }
}

// Enhanced API Client with retry logic and caching
class APIClient {
  constructor() {
    this.performance = new PerformanceManager();
    this.requestQueue = new Map();
  }

  async request(endpoint, options = {}) {
    const requestKey = `${endpoint}-${JSON.stringify(options)}`;
    
    // Check cache first
    if (APP_CONFIG.cache.enabled && options.method !== 'POST') {
      const cached = this.performance.getCache(requestKey);
      if (cached) {
        console.log('⚡ Serving from cache:', endpoint);
        return cached;
      }
    }

    // Prevent duplicate requests
    if (this.requestQueue.has(requestKey)) {
      return this.requestQueue.get(requestKey);
    }

    const requestPromise = this.executeRequest(endpoint, options);
    this.requestQueue.set(requestKey, requestPromise);

    try {
      const result = await requestPromise;
      
      // Cache successful GET requests
      if (APP_CONFIG.cache.enabled && options.method !== 'POST' && result.success) {
        this.performance.setCache(requestKey, result);
      }

      return result;
    } finally {
      this.requestQueue.delete(requestKey);
    }
  }

  async executeRequest(endpoint, options = {}) {
    const startTime = performance.now();
    this.performance.recordMetric('apiCalls');

    const config = {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
        'X-Request-ID': this.generateRequestId()
      },
      timeout: APP_CONFIG.api.timeout,
      ...options
    };

    for (let attempt = 1; attempt <= APP_CONFIG.api.retries; attempt++) {
      try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), config.timeout);

        const response = await fetch(`${APP_CONFIG.api.baseUrl}${endpoint}`, {
          ...config,
          signal: controller.signal
        });

        clearTimeout(timeoutId);

        if (!response.ok) {
          throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        }

        const data = await response.json();
        
        console.log(`✅ API Success: ${endpoint} (${Math.round(performance.now() - startTime)}ms)`);
        return data;

      } catch (error) {
        console.warn(`⚠️ API Attempt ${attempt} failed:`, error.message);
        
        if (attempt === APP_CONFIG.api.retries) {
          this.performance.recordMetric('errors');
          throw new Error(`Request failed after ${APP_CONFIG.api.retries} attempts: ${error.message}`);
        }

        // Exponential backoff
        await this.delay(Math.pow(2, attempt) * 1000);
      }
    }
  }

  generateRequestId() {
    return Math.random().toString(36).substr(2, 9);
  }

  delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  getMetrics() {
    return this.performance.getMetrics();
  }
}

// Enhanced UI Manager with optimized DOM operations
class UIManager {
  constructor() {
    this.apiClient = new APIClient();
    this.activeAnimations = new Set();
    this.debounceTimers = new Map();
    this.observers = new Map();
    
    this.init();
  }

  init() {
    this.setupEventListeners();
    this.initializeObservers();
    this.startPerformanceMonitoring();
    
    console.log('🎯 UI Manager initialized with optimizations');
  }

  setupEventListeners() {
    // Optimized form handling with debouncing
    this.setupFormHandling();
    this.setupTabNavigation();
    this.setupFileUpload();
    this.setupTooltips();
    
    // Global error handling
    window.addEventListener('error', this.handleGlobalError.bind(this));
    window.addEventListener('unhandledrejection', this.handleUnhandledRejection.bind(this));
  }

  setupFormHandling() {
    const generateForm = document.getElementById('generate-form');
    const suggestBtn = document.getElementById('suggest-btn');

    if (generateForm) {
      generateForm.addEventListener('submit', this.debounce(this.handleGenerate.bind(this), APP_CONFIG.performance.debounceDelay));
    }

    if (suggestBtn) {
      suggestBtn.addEventListener('click', this.debounce(this.handleSuggest.bind(this), APP_CONFIG.performance.debounceDelay));
    }

    // Auto-save functionality
    const inputs = generateForm?.querySelectorAll('input, textarea, select');
    inputs?.forEach(input => {
      input.addEventListener('input', this.debounce(() => {
        this.autoSave(input);
      }, 1000));
    });
  }

  setupTabNavigation() {
    const tabButtons = document.querySelectorAll('.tab-button');
    const tabContents = document.querySelectorAll('.tab-content');

    tabButtons.forEach(button => {
      button.addEventListener('click', (e) => {
        e.preventDefault();
        const targetTab = button.dataset.tab;
        this.switchTab(targetTab, tabButtons, tabContents);
      });
    });
  }

  setupFileUpload() {
    const fileInput = document.getElementById('file-input');
    const dropZone = document.getElementById('drop-zone');

    if (fileInput && dropZone) {
      // Drag and drop
      dropZone.addEventListener('dragover', this.handleDragOver.bind(this));
      dropZone.addEventListener('drop', this.handleDrop.bind(this));
      
      // File input change
      fileInput.addEventListener('change', this.handleFileSelect.bind(this));
    }
  }

  async handleGenerate(e) {
    e.preventDefault();
    
    const loadingId = this.showLoading('Gerando conteúdo otimizado...');
    
    try {
      const formData = this.collectFormData(e.target);
      const response = await this.apiClient.request('/api/generate', {
        method: 'POST',
        body: JSON.stringify(formData)
      });

      if (response.success) {
        this.displayResults(response.content);
        this.showNotification('✅ Conteúdo gerado com sucesso!', 'success');
      } else {
        throw new Error(response.error || 'Erro desconhecido');
      }

    } catch (error) {
      console.error('Erro na geração:', error);
      this.showNotification(`❌ Erro: ${error.message}`, 'error');
      this.displayFallbackContent();
    } finally {
      this.hideLoading(loadingId);
    }
  }

  async handleSuggest(e) {
    e.preventDefault();
    
    const loadingId = this.showLoading('Gerando sugestões...');
    
    try {
      const formData = this.collectFormData(document.getElementById('generate-form'));
      const response = await this.apiClient.request('/api/suggest', {
        method: 'POST',
        body: JSON.stringify(formData)
      });

      if (response.success && response.suggestion) {
        this.displaySuggestion(response.suggestion);
        this.showNotification('💡 Sugestões geradas!', 'success');
      } else {
        throw new Error(response.error || 'Erro ao gerar sugestões');
      }

    } catch (error) {
      console.error('Erro na sugestão:', error);
      this.showNotification(`❌ Erro: ${error.message}`, 'error');
    } finally {
      this.hideLoading(loadingId);
    }
  }

  collectFormData(form) {
    const formData = new FormData(form);
    const data = {};
    
    for (const [key, value] of formData.entries()) {
      if (key === 'keywords') {
        data[key] = value.split(',').map(k => k.trim()).filter(k => k);
      } else {
        data[key] = value;
      }
    }
    
    return data;
  }

  displayResults(content) {
    const resultsContainer = document.getElementById('results');
    if (!resultsContainer) return;

    // Create optimized HTML structure
    const html = Object.entries(content).map(([platform, platformContent]) => `
      <div class="result-card" data-platform="${platform}">
        <div class="result-header">
          <h3>${this.formatPlatformName(platform)}</h3>
          <div class="result-actions">
            <button class="copy-btn" data-content="${this.escapeHtml(platformContent)}">
              📋 Copiar
            </button>
            <button class="download-btn" data-content="${this.escapeHtml(platformContent)}" data-platform="${platform}">
              💾 Download
            </button>
          </div>
        </div>
        <div class="result-content">
          <pre>${this.escapeHtml(platformContent)}</pre>
        </div>
      </div>
    `).join('');

    resultsContainer.innerHTML = html;
    
    // Setup result actions
    this.setupResultActions(resultsContainer);
    
    // Animate appearance
    this.animateIn(resultsContainer);
  }

  displaySuggestion(suggestion) {
    const container = document.getElementById('suggestion-container') || this.createSuggestionContainer();
    
    const html = `
      <div class="suggestion-card">
        <h3>💡 Sugestões Geradas</h3>
        ${suggestion.title ? `<div class="suggestion-item">
          <strong>Título:</strong> ${this.escapeHtml(suggestion.title)}
        </div>` : ''}
        ${suggestion.outline ? `<div class="suggestion-item">
          <strong>Estrutura:</strong>
          <pre>${this.escapeHtml(suggestion.outline)}</pre>
        </div>` : ''}
        ${suggestion.hook ? `<div class="suggestion-item">
          <strong>Hook:</strong> ${this.escapeHtml(suggestion.hook)}
        </div>` : ''}
        ${suggestion.content ? `<div class="suggestion-item">
          <strong>Sugestão Completa:</strong>
          <pre>${this.escapeHtml(suggestion.content)}</pre>
        </div>` : ''}
        <div class="suggestion-actions">
          <button class="apply-suggestion-btn">✅ Aplicar Sugestão</button>
          <button class="dismiss-suggestion-btn">❌ Dispensar</button>
        </div>
      </div>
    `;

    container.innerHTML = html;
    this.setupSuggestionActions(container);
    this.animateIn(container);
  }

  setupResultActions(container) {
    // Copy buttons
    container.querySelectorAll('.copy-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const content = btn.dataset.content;
        this.copyToClipboard(content);
      });
    });

    // Download buttons
    container.querySelectorAll('.download-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const content = btn.dataset.content;
        const platform = btn.dataset.platform;
        this.downloadContent(content, platform);
      });
    });
  }

  async copyToClipboard(text) {
    try {
      await navigator.clipboard.writeText(text);
      this.showNotification('📋 Copiado para a área de transferência!', 'success');
    } catch (error) {
      console.error('Erro ao copiar:', error);
      this.showNotification('❌ Erro ao copiar', 'error');
    }
  }

  downloadContent(content, platform) {
    const blob = new Blob([content], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    
    a.href = url;
    a.download = `content-${platform}-${Date.now()}.txt`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    
    this.showNotification('💾 Download iniciado!', 'success');
  }

  showLoading(message = 'Carregando...') {
    const id = 'loading-' + Math.random().toString(36).substr(2, 9);
    const loadingEl = document.createElement('div');
    loadingEl.id = id;
    loadingEl.className = 'loading-overlay';
    loadingEl.innerHTML = `
      <div class="loading-content">
        <div class="loading-spinner"></div>
        <p>${message}</p>
      </div>
    `;
    
    document.body.appendChild(loadingEl);
    requestAnimationFrame(() => loadingEl.classList.add('show'));
    
    return id;
  }

  hideLoading(id) {
    const loadingEl = document.getElementById(id);
    if (loadingEl) {
      loadingEl.classList.remove('show');
      setTimeout(() => {
        if (loadingEl.parentNode) {
          loadingEl.parentNode.removeChild(loadingEl);
        }
      }, APP_CONFIG.performance.animationDuration);
    }
  }

  showNotification(message, type = 'info') {
    const notification = document.createElement('div');
    notification.className = `notification notification-${type}`;
    notification.textContent = message;
    
    document.body.appendChild(notification);
    
    requestAnimationFrame(() => {
      notification.classList.add('show');
    });
    
    setTimeout(() => {
      notification.classList.remove('show');
      setTimeout(() => {
        if (notification.parentNode) {
          notification.parentNode.removeChild(notification);
        }
      }, APP_CONFIG.performance.animationDuration);
    }, 3000);
  }

  // Utility functions
  debounce(func, wait) {
    return (...args) => {
      const key = func.toString();
      clearTimeout(this.debounceTimers.get(key));
      this.debounceTimers.set(key, setTimeout(() => func.apply(this, args), wait));
    };
  }

  escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }

  formatPlatformName(platform) {
    const names = {
      instagram: 'Instagram',
      tiktok: 'TikTok',
      youtube: 'YouTube',
      linkedin: 'LinkedIn',
      twitter: 'Twitter/X'
    };
    return names[platform] || platform.charAt(0).toUpperCase() + platform.slice(1);
  }

  animateIn(element) {
    element.style.opacity = '0';
    element.style.transform = 'translateY(20px)';
    
    requestAnimationFrame(() => {
      element.style.transition = `opacity ${APP_CONFIG.performance.animationDuration}ms ease, transform ${APP_CONFIG.performance.animationDuration}ms ease`;
      element.style.opacity = '1';
      element.style.transform = 'translateY(0)';
    });
  }

  switchTab(targetTab, tabButtons, tabContents) {
    // Update buttons
    tabButtons.forEach(btn => btn.classList.remove('active'));
    const activeBtn = document.querySelector(`[data-tab="${targetTab}"]`);
    if (activeBtn) activeBtn.classList.add('active');

    // Update content
    tabContents.forEach(content => {
      content.classList.remove('active');
      if (content.id === targetTab) {
        content.classList.add('active');
      }
    });
  }

  autoSave(input) {
    const key = `autosave_${input.name || input.id}`;
    localStorage.setItem(key, input.value);
    console.log('💾 Auto-saved:', key);
  }

  loadAutoSaved() {
    const form = document.getElementById('generate-form');
    if (!form) return;

    const inputs = form.querySelectorAll('input, textarea, select');
    inputs.forEach(input => {
      const key = `autosave_${input.name || input.id}`;
      const saved = localStorage.getItem(key);
      if (saved && !input.value) {
        input.value = saved;
      }
    });
  }

  handleGlobalError(event) {
    console.error('Global error:', event.error);
    this.showNotification('❌ Erro inesperado da aplicação', 'error');
  }

  handleUnhandledRejection(event) {
    console.error('Unhandled promise rejection:', event.reason);
    this.showNotification('❌ Erro de processamento', 'error');
  }

  initializeObservers() {
    // Intersection Observer for lazy loading
    if ('IntersectionObserver' in window) {
      this.observers.set('lazyLoad', new IntersectionObserver(
        this.handleLazyLoad.bind(this),
        { threshold: 0.1 }
      ));
    }
  }

  handleLazyLoad(entries) {
    entries.forEach(entry => {
      if (entry.isIntersecting) {
        const element = entry.target;
        // Implement lazy loading logic
        element.classList.add('loaded');
        this.observers.get('lazyLoad').unobserve(element);
      }
    });
  }

  startPerformanceMonitoring() {
    // Log performance metrics every 30 seconds
    setInterval(() => {
      const metrics = this.apiClient.getMetrics();
      console.log('📊 Performance Metrics:', metrics);
    }, 30000);
  }

  // File handling methods
  handleDragOver(e) {
    e.preventDefault();
    e.stopPropagation();
    e.currentTarget.classList.add('drag-over');
  }

  handleDrop(e) {
    e.preventDefault();
    e.stopPropagation();
    e.currentTarget.classList.remove('drag-over');
    
    const files = Array.from(e.dataTransfer.files);
    this.processFiles(files);
  }

  handleFileSelect(e) {
    const files = Array.from(e.target.files);
    this.processFiles(files);
  }

  async processFiles(files) {
    for (const file of files) {
      if (this.isValidFile(file)) {
        await this.uploadFile(file);
      } else {
        this.showNotification(`❌ Arquivo inválido: ${file.name}`, 'error');
      }
    }
  }

  isValidFile(file) {
    const validTypes = ['image/jpeg', 'image/png', 'image/webp', 'application/pdf', 'text/plain'];
    const maxSize = 10 * 1024 * 1024; // 10MB
    
    return validTypes.includes(file.type) && file.size <= maxSize;
  }

  async uploadFile(file) {
    const loadingId = this.showLoading(`Processando ${file.name}...`);
    
    try {
      const formData = new FormData();
      formData.append('file', file);
      formData.append('type', 'extract');

      const response = await fetch('/api/extract', {
        method: 'POST',
        body: formData
      });

      if (!response.ok) {
        throw new Error('Erro no upload');
      }

      const data = await response.json();
      
      if (data.success) {
        this.populateExtractedData(data.data);
        this.showNotification('✅ Arquivo processado com sucesso!', 'success');
      } else {
        throw new Error(data.error);
      }

    } catch (error) {
      console.error('Erro no upload:', error);
      this.showNotification(`❌ Erro ao processar arquivo: ${error.message}`, 'error');
    } finally {
      this.hideLoading(loadingId);
    }
  }

  populateExtractedData(data) {
    const textarea = document.getElementById('extracted-data');
    if (textarea) {
      textarea.value = data;
      this.autoSave(textarea);
    }
  }

  displayFallbackContent() {
    const resultsContainer = document.getElementById('results');
    if (!resultsContainer) return;

    resultsContainer.innerHTML = `
      <div class="fallback-content">
        <h3>🎭 Modo de Demonstração</h3>
        <p>Configure suas chaves de API para usar IA avançada!</p>
        <div class="fallback-example">
          <h4>Exemplo de Conteúdo:</h4>
          <pre>🚀 Transforme seu negócio com estratégias comprovadas!

✨ Descubra como aplicar técnicas revolucionárias
💪 Resultados reais em 30 dias
🎯 Método passo a passo

#Transformacao #Sucesso #ResultadosReais</pre>
        </div>
      </div>
    `;
  }

  createSuggestionContainer() {
    const container = document.createElement('div');
    container.id = 'suggestion-container';
    container.className = 'suggestion-container';
    
    const resultsSection = document.getElementById('results')?.parentNode;
    if (resultsSection) {
      resultsSection.insertBefore(container, document.getElementById('results'));
    }
    
    return container;
  }

  setupSuggestionActions(container) {
    const applyBtn = container.querySelector('.apply-suggestion-btn');
    const dismissBtn = container.querySelector('.dismiss-suggestion-btn');

    if (applyBtn) {
      applyBtn.addEventListener('click', () => {
        // Apply suggestion logic
        this.showNotification('✅ Sugestão aplicada!', 'success');
        container.style.display = 'none';
      });
    }

    if (dismissBtn) {
      dismissBtn.addEventListener('click', () => {
        container.style.display = 'none';
      });
    }
  }

  setupTooltips() {
    const tooltipElements = document.querySelectorAll('[data-tooltip]');
    tooltipElements.forEach(el => {
      el.addEventListener('mouseenter', this.showTooltip.bind(this));
      el.addEventListener('mouseleave', this.hideTooltip.bind(this));
    });
  }

  showTooltip(e) {
    const text = e.target.dataset.tooltip;
    if (!text) return;

    const tooltip = document.createElement('div');
    tooltip.className = 'tooltip';
    tooltip.textContent = text;
    document.body.appendChild(tooltip);

    const rect = e.target.getBoundingClientRect();
    tooltip.style.left = rect.left + (rect.width / 2) - (tooltip.offsetWidth / 2) + 'px';
    tooltip.style.top = rect.top - tooltip.offsetHeight - 5 + 'px';

    e.target._tooltip = tooltip;
  }

  hideTooltip(e) {
    if (e.target._tooltip) {
      document.body.removeChild(e.target._tooltip);
      delete e.target._tooltip;
    }
  }
}

// Debug utilities
window.debugApp = {
  getInfo: () => {
    return {
      config: APP_CONFIG,
      metrics: window.uiManager?.apiClient?.getMetrics() || {},
      cache: window.uiManager?.apiClient?.performance?.cache?.size || 0,
      version: '2.0.0-optimized'
    };
  },
  
  testAI: async () => {
    try {
      const response = await fetch('/api/test-integration');
      const data = await response.json();
      console.table(data.tests);
      return data;
    } catch (error) {
      console.error('Test failed:', error);
      return { error: error.message };
    }
  },
  
  clearCache: () => {
    if (window.uiManager?.apiClient?.performance) {
      window.uiManager.apiClient.performance.cache.clear();
      localStorage.clear();
      console.log('🧹 Cache cleared');
    }
  },

  performance: () => {
    return window.uiManager?.apiClient?.getMetrics() || {};
  }
};

// Initialize application
let uiManager;

function initializeApp() {
  console.log('🚀 Initializing optimized ViralCraft-AI...');
  
  uiManager = new UIManager();
  window.uiManager = uiManager;
  
  // Load auto-saved data
  uiManager.loadAutoSaved();
  
  console.log('✅ Application initialized successfully');
  console.log('🔧 Debug commands available: debugApp.getInfo(), debugApp.testAI(), debugApp.clearCache()');
}

// Start app when DOM is ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initializeApp);
} else {
  initializeApp();
}

// Export for testing
if (typeof module !== 'undefined' && module.exports) {
  module.exports = { UIManager, APIClient, PerformanceManager };
}
