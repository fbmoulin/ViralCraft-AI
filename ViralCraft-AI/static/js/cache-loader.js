// Implementação de cache e lazy loading para o frontend
document.addEventListener('DOMContentLoaded', function () {
  // Cache para requisições de API
  const apiCache = new Map();
  const API_CACHE_TTL = 30 * 60 * 1000; // 30 minutos em milissegundos

  // Configuração de lazy loading para imagens
  setupLazyLoading();

  // Inicialização de componentes sob demanda
  setupLazyComponentLoading();

  // Interceptar requisições fetch para implementar cache
  const originalFetch = window.fetch;
  window.fetch = async function (url, options = {}) {
    // Não aplicar cache para métodos não-GET ou requisições não cacheáveis
    if ((options.method && options.method !== 'GET') || !isCacheableRequest(url)) {
      return originalFetch(url, options);
    }

    const cacheKey = generateCacheKey(url, options);
    const cachedResponse = getCachedResponse(cacheKey);

    if (cachedResponse) {
      console.log(`🔄 Usando resposta em cache para: ${url}`);
      return Promise.resolve(
        new Response(new Blob([JSON.stringify(cachedResponse.data)]), {
          status: 200,
          headers: { 'Content-Type': 'application/json' }
        })
      );
    }

    try {
      const response = await originalFetch(url, options);
      const clone = response.clone();

      // Só armazenar em cache se a resposta for bem-sucedida
      if (response.ok) {
        clone
          .json()
          .then((data) => {
            setCachedResponse(cacheKey, {
              data,
              timestamp: Date.now()
            });
          })
          .catch((err) => console.warn('Erro ao processar resposta para cache:', err));
      }

      return response;
    } catch (error) {
      console.error('Erro na requisição:', error);
      throw error;
    }
  };

  // Funções auxiliares para cache
  function generateCacheKey(url, options) {
    const body = options.body ? JSON.stringify(options.body) : '';
    return `${url}|${body}`;
  }

  function isCacheableRequest(url) {
    // Determinar quais endpoints são cacheáveis
    const cacheableEndpoints = ['/api/health', '/api/suggest'];

    return cacheableEndpoints.some((endpoint) => url.includes(endpoint));
  }

  function getCachedResponse(key) {
    const cached = apiCache.get(key);
    if (!cached) return null;

    // Verificar se o cache expirou
    if (Date.now() - cached.timestamp > API_CACHE_TTL) {
      apiCache.delete(key);
      return null;
    }

    return cached;
  }

  function setCachedResponse(key, response) {
    apiCache.set(key, response);

    // Limpar cache antigo periodicamente
    if (apiCache.size > 100) {
      const keysToDelete = [];
      const now = Date.now();

      apiCache.forEach((value, key) => {
        if (now - value.timestamp > API_CACHE_TTL) {
          keysToDelete.push(key);
        }
      });

      keysToDelete.forEach((key) => apiCache.delete(key));
    }
  }

  // Implementação de lazy loading para imagens
  function setupLazyLoading() {
    // Verificar se o navegador suporta IntersectionObserver
    if ('IntersectionObserver' in window) {
      const lazyImages = document.querySelectorAll('img[data-src]');

      const imageObserver = new IntersectionObserver((entries, observer) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            const img = entry.target;
            img.src = img.dataset.src;

            // Remover data-src após carregar
            img.addEventListener('load', () => {
              img.removeAttribute('data-src');
              img.classList.add('loaded');
            });

            // Parar de observar após carregar
            observer.unobserve(img);
          }
        });
      });

      lazyImages.forEach((img) => {
        imageObserver.observe(img);
      });
    } else {
      // Fallback para navegadores que não suportam IntersectionObserver
      const lazyImages = document.querySelectorAll('img[data-src]');

      function lazyLoad() {
        const scrollTop = window.pageYOffset;

        lazyImages.forEach((img) => {
          if (!img.dataset.src) return;

          const rect = img.getBoundingClientRect();
          const isVisible = rect.top <= window.innerHeight && rect.bottom >= 0;

          if (isVisible) {
            img.src = img.dataset.src;
            img.addEventListener('load', () => {
              img.removeAttribute('data-src');
              img.classList.add('loaded');
            });
          }
        });
      }

      // Carregar imagens visíveis inicialmente
      lazyLoad();

      // Adicionar evento de scroll com throttle
      let scrollTimeout;
      window.addEventListener('scroll', function () {
        if (scrollTimeout) {
          clearTimeout(scrollTimeout);
        }

        scrollTimeout = setTimeout(lazyLoad, 200);
      });
    }
  }

  // Implementação de carregamento sob demanda para componentes pesados
  function setupLazyComponentLoading() {
    // Carregar componentes apenas quando necessários
    const lazyComponents = document.querySelectorAll('[data-component]');

    if ('IntersectionObserver' in window) {
      const componentObserver = new IntersectionObserver(
        (entries, observer) => {
          entries.forEach((entry) => {
            if (entry.isIntersecting) {
              const component = entry.target;
              const componentName = component.dataset.component;

              loadComponent(componentName, component);
              observer.unobserve(component);
            }
          });
        },
        {
          rootMargin: '200px' // Pré-carregar quando estiver a 200px de distância
        }
      );

      lazyComponents.forEach((component) => {
        componentObserver.observe(component);
      });
    } else {
      // Carregar componentes imediatamente em navegadores sem suporte
      lazyComponents.forEach((component) => {
        const componentName = component.dataset.component;
        loadComponent(componentName, component);
      });
    }
  }

  function loadComponent(componentName, container) {
    console.log(`🔄 Carregando componente: ${componentName}`);

    // Mapeamento de componentes para funções de inicialização
    const componentLoaders = {
      'result-viewer': initResultViewer,
      'suggestion-panel': initSuggestionPanel,
      'file-uploader': initFileUploader
    };

    if (componentLoaders[componentName]) {
      componentLoaders[componentName](container);
    } else {
      console.warn(`Componente desconhecido: ${componentName}`);
    }
  }

  // Funções de inicialização de componentes
  function initResultViewer(container) {
    // Implementação do visualizador de resultados
    container.innerHTML = `
      <div class="result-content"></div>
      <div class="result-actions">
        <button class="btn btn-secondary copy-btn">
          <span>📋</span> Copiar
        </button>
        <button class="btn btn-secondary download-btn">
          <span>💾</span> Baixar
        </button>
      </div>
    `;

    // Adicionar event listeners
    const copyBtn = container.querySelector('.copy-btn');
    const downloadBtn = container.querySelector('.download-btn');

    copyBtn.addEventListener('click', () => {
      const content = container.querySelector('.result-content').innerText;
      navigator.clipboard
        .writeText(content)
        .then(() => showNotification('Conteúdo copiado para a área de transferência!', 'success'))
        .catch((err) => showNotification('Erro ao copiar conteúdo', 'error'));
    });

    downloadBtn.addEventListener('click', () => {
      const content = container.querySelector('.result-content').innerText;
      const title = document.querySelector('input[name="topic"]')?.value.trim() || 'conteudo';
      const filename = title.toLowerCase().replace(/\s+/g, '-') + '.md';

      const blob = new Blob([content], { type: 'text/markdown' });
      const url = URL.createObjectURL(blob);

      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();

      setTimeout(() => {
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
      }, 100);

      showNotification('Conteúdo baixado como ' + filename, 'success');
    });
  }

  function initSuggestionPanel(container) {
    // Implementação do painel de sugestões
    container.innerHTML = `
      <div class="card">
        <div class="card-header">
          <h3 class="card-title">💡 Sugestão de Conteúdo</h3>
        </div>
        <div class="suggestion-content">
          <p class="loading-text">Carregando sugestões...</p>
        </div>
      </div>
    `;
  }

  function initFileUploader(container) {
    // Implementação do uploader de arquivos
    container.innerHTML = `
      <div class="file-upload">
        <input type="file" class="file-input" accept=".pdf,.docx,.txt,image/*">
        <div class="file-upload-button">
          <span>📁</span> Clique para selecionar arquivo
        </div>
        <div class="file-preview"></div>
      </div>
    `;

    const input = container.querySelector('.file-input');
    const button = container.querySelector('.file-upload-button');
    const preview = container.querySelector('.file-preview');

    button.addEventListener('click', () => {
      input.click();
    });

    input.addEventListener('change', () => {
      if (input.files.length > 0) {
        const file = input.files[0];
        updateFilePreview(file, preview, button);
      }
    });
  }

  function updateFilePreview(file, previewContainer, button) {
    if (!previewContainer) return;

    // Limpar preview anterior
    previewContainer.innerHTML = '';
    previewContainer.style.display = 'block';

    // Atualizar texto do botão
    if (button) {
      button.textContent = file.name;
    }

    // Criar preview baseado no tipo de arquivo
    if (file.type.startsWith('image/')) {
      const img = document.createElement('img');
      img.style.maxWidth = '100%';
      img.style.maxHeight = '150px';
      img.style.borderRadius = 'var(--border-radius-sm)';
      img.style.marginTop = 'var(--spacing-sm)';

      const reader = new FileReader();
      reader.onload = (e) => {
        img.src = e.target.result;
      };
      reader.readAsDataURL(file);

      previewContainer.appendChild(img);
    } else {
      // Para outros tipos de arquivo, mostrar ícone e nome
      const fileInfo = document.createElement('div');
      fileInfo.className = 'file-info';
      fileInfo.style.display = 'flex';
      fileInfo.style.alignItems = 'center';
      fileInfo.style.gap = 'var(--spacing-sm)';
      fileInfo.style.marginTop = 'var(--spacing-sm)';

      const icon = document.createElement('span');
      icon.textContent = getFileIcon(file.type);
      icon.style.fontSize = '1.5rem';

      const name = document.createElement('span');
      name.textContent = file.name;
      name.style.wordBreak = 'break-all';

      fileInfo.appendChild(icon);
      fileInfo.appendChild(name);
      previewContainer.appendChild(fileInfo);
    }
  }

  function getFileIcon(fileType) {
    if (fileType.startsWith('image/')) return '🖼️';
    if (fileType === 'application/pdf') return '📄';
    if (fileType.includes('word')) return '📝';
    if (fileType.includes('excel') || fileType.includes('spreadsheet')) return '📊';
    if (fileType.includes('text/')) return '📃';
    return '📎';
  }

  // Sistema de notificações
  window.showNotification = function (message, type = 'info') {
    // Remover notificações existentes
    const existingNotifications = document.querySelectorAll('.notification');
    existingNotifications.forEach((notification) => {
      notification.remove();
    });

    // Criar nova notificação
    const notification = document.createElement('div');
    notification.className = `notification notification-${type}`;

    // Ícone baseado no tipo
    let icon = '💬';
    if (type === 'success') icon = '✅';
    if (type === 'error') icon = '❌';
    if (type === 'info') icon = 'ℹ️';

    notification.innerHTML = `
      <div class="notification-icon">${icon}</div>
      <div class="notification-message">${message}</div>
    `;

    // Adicionar ao DOM
    document.body.appendChild(notification);

    // Remover após alguns segundos
    setTimeout(() => {
      notification.style.opacity = '0';
      setTimeout(() => {
        notification.remove();
      }, 300);
    }, 3000);
  };
});
