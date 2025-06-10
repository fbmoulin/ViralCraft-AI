/**
 * Otimização de carregamento e desempenho frontend - Fase 2
 * Implementa lazy loading avançado, cache de componentes e otimização de renderização
 */

// Cache para componentes e dados
const componentCache = new Map();
const dataCache = new Map();

// Configuração
const config = {
  cacheEnabled: true,
  cacheTTL: 300000, // 5 minutos em ms
  lazyLoadThreshold: 100, // ms
  renderOptimization: true,
  analyticsEnabled: true
};

// Sistema de métricas de desempenho
const performanceMetrics = {
  pageLoad: 0,
  firstInteraction: 0,
  renderTime: 0,
  apiCalls: [],
  interactions: []
};

// Inicialização com carregamento otimizado
document.addEventListener('DOMContentLoaded', () => {
  // Registrar tempo de carregamento inicial
  performanceMetrics.pageLoad = performance.now();
  
  // Inicializar componentes críticos imediatamente
  initializeCriticalComponents();
  
  // Carregar componentes não críticos de forma assíncrona
  setTimeout(() => {
    initializeNonCriticalComponents();
  }, 100);
  
  // Remover tela de carregamento com fade suave
  setTimeout(() => {
    const loadingScreen = document.getElementById('loading-screen');
    if (loadingScreen) {
      loadingScreen.classList.add('fade-out');
      setTimeout(() => {
        loadingScreen.style.display = 'none';
      }, 500);
    }
  }, 800);
  
  // Iniciar monitoramento de desempenho
  startPerformanceMonitoring();
});

/**
 * Inicializa componentes críticos para a experiência inicial
 */
function initializeCriticalComponents() {
  // Inicializar navegação por abas
  initTabNavigation();
  
  // Inicializar validação de formulário
  initFormValidation();
  
  // Inicializar indicadores de status
  updateSystemStatus();
  
  // Inicializar manipuladores de eventos principais
  document.getElementById('generate-button')?.addEventListener('click', handleContentGeneration);
  document.getElementById('suggest-button')?.addEventListener('click', handleSuggestionRequest);
}

/**
 * Inicializa componentes não críticos de forma assíncrona
 */
function initializeNonCriticalComponents() {
  // Inicializar upload de arquivos
  initFileUpload();
  
  // Inicializar visualizações avançadas
  initAdvancedViews();
  
  // Carregar recursos adicionais
  loadAdditionalResources();
}

/**
 * Inicializa navegação por abas com animações suaves
 */
function initTabNavigation() {
  // Botões de próxima aba
  document.querySelectorAll('.next-tab').forEach(button => {
    button.addEventListener('click', (e) => {
      const nextTabId = button.getAttribute('data-next');
      if (nextTabId) {
        switchToTab(nextTabId);
        updateProgressBar(nextTabId);
      }
    });
  });
  
  // Botões de aba anterior
  document.querySelectorAll('.prev-tab').forEach(button => {
    button.addEventListener('click', (e) => {
      const prevTabId = button.getAttribute('data-prev');
      if (prevTabId) {
        switchToTab(prevTabId);
        updateProgressBar(prevTabId);
      }
    });
  });
  
  // Clique nas abas
  document.querySelectorAll('.tab').forEach(tab => {
    tab.addEventListener('click', (e) => {
      const tabId = tab.getAttribute('data-tab');
      if (tabId) {
        switchToTab(tabId);
        updateProgressBar(tabId);
      }
    });
  });
}

/**
 * Alterna para a aba especificada com animação suave
 * @param {string} tabId - ID da aba para exibir
 */
function switchToTab(tabId) {
  // Registrar interação
  recordInteraction('tab_switch', { tabId });
  
  // Remover classe ativa de todas as abas
  document.querySelectorAll('.tab').forEach(tab => {
    tab.classList.remove('active');
  });
  
  // Adicionar classe ativa à aba selecionada
  document.querySelector(`.tab[data-tab="${tabId}"]`)?.classList.add('active');
  
  // Esconder todos os conteúdos de aba
  document.querySelectorAll('.tab-content').forEach(content => {
    content.classList.remove('active');
    content.classList.add('fade-out');
  });
  
  // Mostrar conteúdo da aba selecionada com animação
  const selectedContent = document.getElementById(tabId);
  if (selectedContent) {
    setTimeout(() => {
      document.querySelectorAll('.tab-content').forEach(content => {
        content.classList.remove('fade-out');
        content.style.display = 'none';
      });
      selectedContent.style.display = 'block';
      setTimeout(() => {
        selectedContent.classList.add('active');
      }, 50);
    }, 300);
  }
}

/**
 * Atualiza a barra de progresso com base na aba atual
 * @param {string} tabId - ID da aba atual
 */
function updateProgressBar(tabId) {
  const stepMap = {
    'tab-basic': 1,
    'tab-style': 2,
    'tab-references': 3,
    'tab-context': 4
  };
  
  const currentStep = stepMap[tabId] || 1;
  const progressPercentage = (currentStep / 4) * 100;
  
  // Atualizar barra de progresso com animação suave
  const progressBar = document.querySelector('.progress-bar-fill');
  if (progressBar) {
    progressBar.style.width = `${progressPercentage}%`;
  }
  
  // Atualizar indicadores de etapa
  document.querySelectorAll('.progress-step').forEach(step => {
    const stepNumber = parseInt(step.getAttribute('data-step'));
    if (stepNumber <= currentStep) {
      step.classList.add('active');
    } else {
      step.classList.remove('active');
    }
  });
}

/**
 * Inicializa validação de formulário em tempo real
 */
function initFormValidation() {
  const form = document.getElementById('content-form');
  if (!form) return;
  
  // Validar campos obrigatórios
  const requiredFields = form.querySelectorAll('[required]');
  requiredFields.forEach(field => {
    field.addEventListener('blur', () => {
      validateField(field);
    });
    
    field.addEventListener('input', () => {
      if (field.classList.contains('invalid')) {
        validateField(field);
      }
    });
  });
}

/**
 * Valida um campo de formulário e exibe feedback visual
 * @param {HTMLElement} field - Campo a ser validado
 * @returns {boolean} - Resultado da validação
 */
function validateField(field) {
  const isValid = field.checkValidity();
  
  if (isValid) {
    field.classList.remove('invalid');
    field.classList.add('valid');
    
    // Remover mensagem de erro se existir
    const errorMessage = field.parentNode.querySelector('.error-message');
    if (errorMessage) {
      errorMessage.remove();
    }
  } else {
    field.classList.remove('valid');
    field.classList.add('invalid');
    
    // Adicionar mensagem de erro se não existir
    let errorMessage = field.parentNode.querySelector('.error-message');
    if (!errorMessage) {
      errorMessage = document.createElement('div');
      errorMessage.className = 'error-message';
      field.parentNode.appendChild(errorMessage);
    }
    
    // Definir mensagem de erro apropriada
    if (field.validity.valueMissing) {
      errorMessage.textContent = 'Este campo é obrigatório';
    } else if (field.validity.typeMismatch) {
      errorMessage.textContent = 'Formato inválido';
    } else {
      errorMessage.textContent = 'Valor inválido';
    }
  }
  
  return isValid;
}

/**
 * Inicializa o sistema de upload de arquivos com preview
 */
function initFileUpload() {
  const fileInput = document.getElementById('file');
  const filePreview = document.querySelector('.file-preview');
  const fileButton = document.querySelector('.file-upload-button');
  
  if (!fileInput || !filePreview || !fileButton) return;
  
  fileButton.addEventListener('click', () => {
    fileInput.click();
  });
  
  fileInput.addEventListener('change', () => {
    if (fileInput.files && fileInput.files[0]) {
      const file = fileInput.files[0];
      
      // Limpar preview anterior
      filePreview.innerHTML = '';
      
      // Criar elemento de preview
      const preview = document.createElement('div');
      preview.className = 'file-preview-item';
      
      // Ícone baseado no tipo de arquivo
      let icon = '📄';
      if (file.type.startsWith('image/')) {
        icon = '🖼️';
      } else if (file.type === 'application/pdf') {
        icon = '📕';
      } else if (file.type.includes('word')) {
        icon = '📘';
      }
      
      // Formatar tamanho do arquivo
      const size = file.size < 1024 * 1024 
        ? `${(file.size / 1024).toFixed(1)} KB` 
        : `${(file.size / (1024 * 1024)).toFixed(1)} MB`;
      
      // Criar conteúdo do preview
      preview.innerHTML = `
        <div class="file-icon">${icon}</div>
        <div class="file-info">
          <div class="file-name">${file.name}</div>
          <div class="file-meta">${size} • ${file.type.split('/')[1]}</div>
        </div>
        <button type="button" class="file-remove">×</button>
      `;
      
      // Adicionar preview ao container
      filePreview.appendChild(preview);
      
      // Adicionar evento para remover arquivo
      preview.querySelector('.file-remove').addEventListener('click', () => {
        fileInput.value = '';
        filePreview.innerHTML = '';
      });
      
      // Se for imagem, mostrar thumbnail
      if (file.type.startsWith('image/')) {
        const reader = new FileReader();
        reader.onload = (e) => {
          const img = document.createElement('img');
          img.src = e.target.result;
          img.className = 'file-thumbnail';
          preview.insertBefore(img, preview.firstChild);
        };
        reader.readAsDataURL(file);
      }
    }
  });
}

/**
 * Inicializa visualizações avançadas e componentes interativos
 */
function initAdvancedViews() {
  // Inicializar tooltips
  document.querySelectorAll('[data-tooltip]').forEach(element => {
    const tooltipText = element.getAttribute('data-tooltip');
    if (tooltipText) {
      element.addEventListener('mouseenter', (e) => {
        const tooltip = document.createElement('div');
        tooltip.className = 'tooltip';
        tooltip.textContent = tooltipText;
        document.body.appendChild(tooltip);
        
        const rect = element.getBoundingClientRect();
        tooltip.style.left = `${rect.left + rect.width / 2 - tooltip.offsetWidth / 2}px`;
        tooltip.style.top = `${rect.top - tooltip.offsetHeight - 10}px`;
        
        setTimeout(() => {
          tooltip.classList.add('visible');
        }, 10);
        
        element.addEventListener('mouseleave', () => {
          tooltip.classList.remove('visible');
          setTimeout(() => {
            tooltip.remove();
          }, 300);
        });
      });
    }
  });
}

/**
 * Carrega recursos adicionais de forma assíncrona
 */
function loadAdditionalResources() {
  // Carregar scripts adicionais se necessário
  if (window.IntersectionObserver) {
    // Configurar lazy loading para imagens
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
    
    // Observar todas as imagens com lazy loading
    document.querySelectorAll('img[data-src]').forEach(img => {
      imageObserver.observe(img);
    });
  }
}

/**
 * Atualiza os indicadores de status do sistema
 */
function updateSystemStatus() {
  // Simular verificação de status
  fetch('/api/status')
    .then(response => response.json())
    .catch(() => {
      // Fallback para dados simulados em caso de erro
      return {
        uptime: '2h 15m 30s',
        ai: { status: 'active', color: 'var(--color-success)' },
        database: { status: 'connected', color: 'var(--color-success)' },
        server: { status: 'online', color: 'var(--color-success)' }
      };
    })
    .then(data => {
      // Atualizar uptime
      const uptimeElement = document.querySelector('[data-status="uptime"]');
      if (uptimeElement) {
        uptimeElement.textContent = data.uptime || '0h 0m 0s';
      }
      
      // Atualizar status da IA
      const aiElement = document.querySelector('[data-status="ai"]');
      if (aiElement) {
        const aiDot = aiElement.querySelector('.status-dot');
        if (aiDot) {
          aiDot.style.backgroundColor = data.ai?.color || 'var(--color-success)';
        }
        aiElement.innerHTML = `
          <span class="status-dot" style="background-color: ${data.ai?.color || 'var(--color-success)'}"></span>
          ${data.ai?.status === 'active' ? 'Ativo' : 'Inativo'}
        `;
      }
      
      // Atualizar status do banco de dados
      updateStatusElement('database', data.database);
      
      // Atualizar status do servidor
      updateStatusElement('server', data.server);
    });
    
  // Agendar próxima atualização
  setTimeout(updateSystemStatus, 60000); // Atualizar a cada minuto
}

/**
 * Atualiza um elemento de status específico
 * @param {string} key - Chave do elemento de status
 * @param {Object} data - Dados do status
 */
function updateStatusElement(key, data) {
  const element = document.querySelector(`[data-status="${key}"]`);
  if (element && data) {
    const statusDot = element.querySelector('.status-dot');
    if (statusDot) {
      statusDot.style.backgroundColor = data.color || 'var(--color-success)';
    }
    
    // Atualizar texto se fornecido
    if (data.status) {
      const statusText = data.status.charAt(0).toUpperCase() + data.status.slice(1);
      element.innerHTML = `
        <span class="status-dot" style="background-color: ${data.color || 'var(--color-success)'}"></span>
        ${statusText}
      `;
    }
  }
}

/**
 * Manipula a geração de conteúdo
 */
function handleContentGeneration() {
  // Registrar interação
  recordInteraction('generate_content');
  
  // Validar formulário antes de enviar
  const form = document.getElementById('content-form');
  if (!form) return;
  
  let isValid = true;
  form.querySelectorAll('[required]').forEach(field => {
    if (!validateField(field)) {
      isValid = false;
    }
  });
  
  if (!isValid) {
    showNotification('Por favor, preencha todos os campos obrigatórios', 'error');
    return;
  }
  
  // Mostrar indicador de carregamento
  showLoadingIndicator('Gerando conteúdo viral...');
  
  // Coletar dados do formulário
  const formData = new FormData(form);
  const data = {};
  for (const [key, value] of formData.entries()) {
    data[key] = value;
  }
  
  // Verificar cache se habilitado
  const cacheKey = `content:${JSON.stringify(data)}`;
  if (config.cacheEnabled && dataCache.has(cacheKey)) {
    const cachedData = dataCache.get(cacheKey);
    if (cachedData.timestamp > Date.now() - config.cacheTTL) {
      // Usar dados em cache
      setTimeout(() => {
        hideLoadingIndicator();
        displayGeneratedContent(cachedData.data);
      }, 500); // Pequeno atraso para UX
      return;
    }
  }
  
  // Enviar solicitação para API
  const startTime = performance.now();
  fetch('/api/generate', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(data)
  })
    .then(response => {
      if (!response.ok) {
        throw new Error('Erro ao gerar conteúdo');
      }
      return response.json();
    })
    .then(result => {
      // Registrar tempo de resposta da API
      const endTime = performance.now();
      performanceMetrics.apiCalls.push({
        endpoint: '/api/generate',
        duration: endTime - startTime,
        timestamp: Date.now()
      });
      
      // Armazenar em cache
      if (config.cacheEnabled) {
        dataCache.set(cacheKey, {
          data: result,
          timestamp: Date.now()
        });
      }
      
      // Exibir resultado
      hideLoadingIndicator();
      displayGeneratedContent(result);
    })
    .catch(error => {
      hideLoadingIndicator();
      showNotification(error.message || 'Erro ao gerar conteúdo', 'error');
      
      // Tentar usar modo de demonstração como fallback
      useDemoContent(data);
    });
}

/**
 * Exibe o conteúdo gerado na área de resultados
 * @param {Object} content - Conteúdo gerado
 */
function displayGeneratedContent(content) {
  const resultContainer = document.getElementById('result-container');
  const resultContent = document.querySelector('.result-content');
  const resultActions = document.querySelector('.result-actions');
  
  if (!resultContainer || !resultContent || !resultActions) return;
  
  // Limpar conteúdo anterior
  resultContent.innerHTML = '';
  resultActions.innerHTML = '';
  
  // Criar elemento de conteúdo
  const contentElement = document.createElement('div');
  contentElement.className = 'generated-content';
  
  // Adicionar título
  const titleElement = document.createElement('h3');
  titleElement.className = 'content-title';
  titleElement.textContent = content.title || 'Conteúdo Gerado';
  contentElement.appendChild(titleElement);
  
  // Adicionar conteúdo principal
  const mainContent = document.createElement('div');
  mainContent.className = 'content-main';
  mainContent.innerHTML = formatContent(content.content || '');
  contentElement.appendChild(mainContent);
  
  // Adicionar metadados
  if (content.metadata) {
    const metadataElement = document.createElement('div');
    metadataElement.className = 'content-metadata';
    
    // Adicionar estatísticas
    if (content.metadata.stats) {
      const statsElement = document.createElement('div');
      statsElement.className = 'content-stats';
      
      for (const [key, value] of Object.entries(content.metadata.stats)) {
        const statItem = document.createElement('div');
        statItem.className = 'stat-item';
        statItem.innerHTML = `
          <div class="stat-label">${formatStatLabel(key)}</div>
          <div class="stat-value">${value}</div>
        `;
        statsElement.appendChild(statItem);
      }
      
      metadataElement.appendChild(statsElement);
    }
    
    // Adicionar tags
    if (content.metadata.tags && content.metadata.tags.length > 0) {
      const tagsElement = document.createElement('div');
      tagsElement.className = 'content-tags';
      
      content.metadata.tags.forEach(tag => {
        const tagElement = document.createElement('span');
        tagElement.className = 'tag';
        tagElement.textContent = tag;
        tagsElement.appendChild(tagElement);
      });
      
      metadataElement.appendChild(tagsElement);
    }
    
    contentElement.appendChild(metadataElement);
  }
  
  // Adicionar ao container de resultado
  resultContent.appendChild(contentElement);
  
  // Adicionar botões de ação
  const copyButton = document.createElement('button');
  copyButton.className = 'btn btn-primary';
  copyButton.innerHTML = '📋 Copiar';
  copyButton.addEventListener('click', () => {
    copyToClipboard(content.content);
    showNotification('Conteúdo copiado para a área de transferência', 'success');
  });
  resultActions.appendChild(copyButton);
  
  const downloadButton = document.createElement('button');
  downloadButton.className = 'btn btn-secondary';
  downloadButton.innerHTML = '💾 Baixar';
  downloadButton.addEventListener('click', () => {
    downloadContent(content);
  });
  resultActions.appendChild(downloadButton);
  
  const regenerateButton = document.createElement('button');
  regenerateButton.className = 'btn btn-outline';
  regenerateButton.innerHTML = '🔄 Regenerar';
  regenerateButton.addEventListener('click', handleContentGeneration);
  resultActions.appendChild(regenerateButton);
  
  // Mostrar container de resultado com animação
  resultContainer.classList.remove('hidden');
  setTimeout(() => {
    resultContainer.classList.add('fade-in');
    // Rolar para o resultado
    resultContainer.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }, 100);
}

/**
 * Formata o conteúdo gerado para exibição HTML
 * @param {string} content - Conteúdo a ser formatado
 * @returns {string} - HTML formatado
 */
function formatContent(content) {
  if (!content) return '';
  
  // Converter quebras de linha em parágrafos
  let formatted = content
    .split('\n\n')
    .map(paragraph => paragraph.trim())
    .filter(paragraph => paragraph)
    .map(paragraph => `<p>${paragraph}</p>`)
    .join('');
  
  // Formatar hashtags
  formatted = formatted.replace(/#(\w+)/g, '<span class="hashtag">#$1</span>');
  
  // Formatar links
  formatted = formatted.replace(
    /(https?:\/\/[^\s]+)/g, 
    '<a href="$1" target="_blank" rel="noopener noreferrer">$1</a>'
  );
  
  return formatted;
}

/**
 * Formata rótulos de estatísticas para exibição
 * @param {string} key - Chave da estatística
 * @returns {string} - Rótulo formatado
 */
function formatStatLabel(key) {
  const labels = {
    'readingTime': 'Tempo de Leitura',
    'wordCount': 'Palavras',
    'charCount': 'Caracteres',
    'sentenceCount': 'Sentenças',
    'paragraphCount': 'Parágrafos',
    'readabilityScore': 'Legibilidade',
    'viralityScore': 'Potencial Viral',
    'engagementScore': 'Engajamento'
  };
  
  return labels[key] || key.charAt(0).toUpperCase() + key.slice(1);
}

/**
 * Copia texto para a área de transferência
 * @param {string} text - Texto a ser copiado
 */
function copyToClipboard(text) {
  // Criar elemento temporário
  const textarea = document.createElement('textarea');
  textarea.value = text;
  textarea.setAttribute('readonly', '');
  textarea.style.position = 'absolute';
  textarea.style.left = '-9999px';
  document.body.appendChild(textarea);
  
  // Selecionar e copiar
  textarea.select();
  document.execCommand('copy');
  
  // Limpar
  document.body.removeChild(textarea);
}

/**
 * Baixa o conteúdo gerado como arquivo
 * @param {Object} content - Conteúdo a ser baixado
 */
function downloadContent(content) {
  // Criar conteúdo do arquivo
  let fileContent = `# ${content.title || 'Conteúdo Gerado'}\n\n`;
  fileContent += content.content || '';
  
  if (content.metadata) {
    fileContent += '\n\n---\n\n';
    
    if (content.metadata.stats) {
      fileContent += '## Estatísticas\n\n';
      for (const [key, value] of Object.entries(content.metadata.stats)) {
        fileContent += `- ${formatStatLabel(key)}: ${value}\n`;
      }
      fileContent += '\n';
    }
    
    if (content.metadata.tags && content.metadata.tags.length > 0) {
      fileContent += '## Tags\n\n';
      fileContent += content.metadata.tags.map(tag => `#${tag}`).join(' ') + '\n\n';
    }
    
    fileContent += `Gerado por Soulclap Content Creator em ${new Date().toLocaleString()}`;
  }
  
  // Criar blob e link de download
  const blob = new Blob([fileContent], { type: 'text/plain' });
  const url = URL.createObjectURL(blob);
  
  const a = document.createElement('a');
  a.href = url;
  a.download = `${content.title || 'conteudo'}.txt`.replace(/\s+/g, '_').toLowerCase();
  document.body.appendChild(a);
  a.click();
  
  // Limpar
  setTimeout(() => {
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }, 100);
}

/**
 * Manipula solicitações de sugestão
 */
function handleSuggestionRequest() {
  // Registrar interação
  recordInteraction('request_suggestion');
  
  // Obter tópico atual
  const topicInput = document.getElementById('topic');
  const topic = topicInput?.value || '';
  
  if (!topic) {
    showNotification('Digite um tópico para receber sugestões', 'warning');
    return;
  }
  
  // Mostrar indicador de carregamento
  showLoadingIndicator('Gerando sugestões...');
  
  // Verificar cache
  const cacheKey = `suggestions:${topic}`;
  if (config.cacheEnabled && dataCache.has(cacheKey)) {
    const cachedData = dataCache.get(cacheKey);
    if (cachedData.timestamp > Date.now() - config.cacheTTL) {
      // Usar dados em cache
      setTimeout(() => {
        hideLoadingIndicator();
        displaySuggestions(cachedData.data);
      }, 500);
      return;
    }
  }
  
  // Enviar solicitação para API
  fetch(`/api/suggestions?topic=${encodeURIComponent(topic)}`)
    .then(response => {
      if (!response.ok) {
        throw new Error('Erro ao obter sugestões');
      }
      return response.json();
    })
    .then(result => {
      // Armazenar em cache
      if (config.cacheEnabled) {
        dataCache.set(cacheKey, {
          data: result,
          timestamp: Date.now()
        });
      }
      
      // Exibir sugestões
      hideLoadingIndicator();
      displaySuggestions(result);
    })
    .catch(error => {
      hideLoadingIndicator();
      showNotification(error.message || 'Erro ao obter sugestões', 'error');
      
      // Usar dados de demonstração como fallback
      useDemoSuggestions(topic);
    });
}

/**
 * Exibe sugestões na interface
 * @param {Object} suggestions - Sugestões a serem exibidas
 */
function displaySuggestions(suggestions) {
  const suggestionContainer = document.getElementById('suggestion-container');
  if (!suggestionContainer) return;
  
  // Limpar conteúdo anterior
  suggestionContainer.innerHTML = '';
  
  // Criar cabeçalho
  const header = document.createElement('div');
  header.className = 'card-header';
  header.innerHTML = `
    <h2 class="card-title">💡 Sugestões para seu Conteúdo</h2>
    <button type="button" class="close-button" id="close-suggestions">×</button>
  `;
  suggestionContainer.appendChild(header);
  
  // Adicionar evento para fechar
  header.querySelector('#close-suggestions').addEventListener('click', () => {
    suggestionContainer.classList.remove('fade-in');
    setTimeout(() => {
      suggestionContainer.classList.add('hidden');
    }, 300);
  });
  
  // Criar lista de sugestões
  const suggestionList = document.createElement('div');
  suggestionList.className = 'suggestion-list';
  
  // Adicionar sugestões
  if (suggestions.topics && suggestions.topics.length > 0) {
    const topicsSection = document.createElement('div');
    topicsSection.className = 'suggestion-section';
    topicsSection.innerHTML = '<h3>Tópicos Relacionados</h3>';
    
    const topicsList = document.createElement('div');
    topicsList.className = 'topics-list';
    
    suggestions.topics.forEach(topic => {
      const topicItem = document.createElement('div');
      topicItem.className = 'topic-item';
      topicItem.textContent = topic;
      topicItem.addEventListener('click', () => {
        document.getElementById('topic').value = topic;
        suggestionContainer.classList.remove('fade-in');
        setTimeout(() => {
          suggestionContainer.classList.add('hidden');
        }, 300);
      });
      topicsList.appendChild(topicItem);
    });
    
    topicsSection.appendChild(topicsList);
    suggestionList.appendChild(topicsSection);
  }
  
  // Adicionar sugestões de palavras-chave
  if (suggestions.keywords && suggestions.keywords.length > 0) {
    const keywordsSection = document.createElement('div');
    keywordsSection.className = 'suggestion-section';
    keywordsSection.innerHTML = '<h3>Palavras-chave Sugeridas</h3>';
    
    const keywordsList = document.createElement('div');
    keywordsList.className = 'keywords-list';
    
    suggestions.keywords.forEach(keyword => {
      const keywordItem = document.createElement('div');
      keywordItem.className = 'keyword-item';
      keywordItem.textContent = keyword;
      keywordItem.addEventListener('click', () => {
        const keywordsInput = document.getElementById('keywords');
        if (keywordsInput) {
          const currentKeywords = keywordsInput.value.split(',').map(k => k.trim()).filter(k => k);
          if (!currentKeywords.includes(keyword)) {
            currentKeywords.push(keyword);
            keywordsInput.value = currentKeywords.join(', ');
          }
        }
      });
      keywordsList.appendChild(keywordItem);
    });
    
    keywordsSection.appendChild(keywordsList);
    suggestionList.appendChild(keywordsSection);
  }
  
  // Adicionar lista ao container
  suggestionContainer.appendChild(suggestionList);
  
  // Mostrar container com animação
  suggestionContainer.classList.remove('hidden');
  setTimeout(() => {
    suggestionContainer.classList.add('fade-in');
  }, 100);
}

/**
 * Exibe um indicador de carregamento
 * @param {string} message - Mensagem a ser exibida
 */
function showLoadingIndicator(message = 'Carregando...') {
  // Verificar se já existe um indicador
  let loadingIndicator = document.querySelector('.loading-indicator');
  
  if (!loadingIndicator) {
    // Criar novo indicador
    loadingIndicator = document.createElement('div');
    loadingIndicator.className = 'loading-indicator';
    
    const spinner = document.createElement('div');
    spinner.className = 'spinner';
    loadingIndicator.appendChild(spinner);
    
    const messageElement = document.createElement('div');
    messageElement.className = 'loading-message';
    loadingIndicator.appendChild(messageElement);
    
    document.body.appendChild(loadingIndicator);
  }
  
  // Atualizar mensagem
  const messageElement = loadingIndicator.querySelector('.loading-message');
  if (messageElement) {
    messageElement.textContent = message;
  }
  
  // Mostrar com animação
  setTimeout(() => {
    loadingIndicator.classList.add('visible');
  }, 10);
}

/**
 * Oculta o indicador de carregamento
 */
function hideLoadingIndicator() {
  const loadingIndicator = document.querySelector('.loading-indicator');
  if (loadingIndicator) {
    loadingIndicator.classList.remove('visible');
    setTimeout(() => {
      if (loadingIndicator.parentNode) {
        loadingIndicator.parentNode.removeChild(loadingIndicator);
      }
    }, 300);
  }
}

/**
 * Exibe uma notificação na interface
 * @param {string} message - Mensagem a ser exibida
 * @param {string} type - Tipo de notificação (success, error, warning, info)
 */
function showNotification(message, type = 'info') {
  // Criar elemento de notificação
  const notification = document.createElement('div');
  notification.className = `notification notification-${type}`;
  
  // Ícone baseado no tipo
  let icon = '💬';
  if (type === 'success') icon = '✅';
  else if (type === 'error') icon = '❌';
  else if (type === 'warning') icon = '⚠️';
  
  // Conteúdo da notificação
  notification.innerHTML = `
    <div class="notification-icon">${icon}</div>
    <div class="notification-message">${message}</div>
    <button class="notification-close">×</button>
  `;
  
  // Adicionar ao DOM
  const notificationsContainer = document.querySelector('.notifications-container');
  if (notificationsContainer) {
    notificationsContainer.appendChild(notification);
  } else {
    const container = document.createElement('div');
    container.className = 'notifications-container';
    container.appendChild(notification);
    document.body.appendChild(container);
  }
  
  // Adicionar evento para fechar
  notification.querySelector('.notification-close').addEventListener('click', () => {
    notification.classList.add('notification-hiding');
    setTimeout(() => {
      if (notification.parentNode) {
        notification.parentNode.removeChild(notification);
      }
    }, 300);
  });
  
  // Mostrar com animação
  setTimeout(() => {
    notification.classList.add('notification-visible');
  }, 10);
  
  // Auto-fechar após 5 segundos
  setTimeout(() => {
    if (notification.parentNode) {
      notification.classList.add('notification-hiding');
      setTimeout(() => {
        if (notification.parentNode) {
          notification.parentNode.removeChild(notification);
        }
      }, 300);
    }
  }, 5000);
}

/**
 * Usa conteúdo de demonstração como fallback
 * @param {Object} formData - Dados do formulário
 */
function useDemoContent(formData) {
  const demoContent = {
    title: formData.topic || 'Como Aumentar sua Produtividade',
    content: `Aumentar a produtividade não precisa ser complicado. Com algumas mudanças simples na sua rotina, você pode transformar completamente seus resultados diários.

Comece organizando seu espaço de trabalho. Um ambiente limpo e bem estruturado reduz distrações e ajuda a manter o foco nas tarefas importantes.

Em seguida, implemente a técnica Pomodoro: trabalhe com foco total por 25 minutos e depois faça uma pausa de 5 minutos. Este ciclo ajuda a manter alta concentração por períodos mais longos.

Priorize suas tarefas usando o método Eisenhower, separando o que é urgente e importante do que pode esperar. Assim, você garante que está sempre trabalhando no que realmente importa.

Por fim, não subestime o poder de uma boa noite de sono e alimentação adequada. Seu corpo e mente precisam de combustível de qualidade para performar no mais alto nível.

Implemente estas dicas gradualmente e observe como sua produtividade aumenta dia após dia!`,
    metadata: {
      stats: {
        readingTime: '2 min',
        wordCount: 142,
        charCount: 782,
        sentenceCount: 8,
        paragraphCount: 6,
        readabilityScore: '94/100',
        viralityScore: '87/100',
        engagementScore: '92/100'
      },
      tags: ['produtividade', 'organização', 'foco', 'técnicaPomodoro', 'trabalhoRemoto']
    }
  };
  
  // Personalizar com base nos dados do formulário
  if (formData.topic) {
    demoContent.title = formData.topic;
  }
  
  if (formData.tone) {
    // Ajustar tom do conteúdo
    const tones = {
      'inspirador': 'Você tem o poder de transformar sua produtividade! Acredite no seu potencial e comece hoje mesmo a implementar estas mudanças inspiradoras.',
      'educativo': 'Estudos mostram que a implementação destas técnicas pode aumentar a produtividade em até 37%. A ciência por trás do método Pomodoro está bem documentada em pesquisas recentes.',
      'divertido': 'Quem disse que produtividade não pode ser divertida? Transforme sua mesa em um centro de comando e declare guerra ao procrastinador que vive dentro de você!',
      'profissional': 'A otimização de processos de trabalho é fundamental para o sucesso profissional no ambiente corporativo atual. Implementar estas estratégias pode resultar em vantagem competitiva significativa.'
    };
    
    if (tones[formData.tone]) {
      demoContent.content += `\n\n${tones[formData.tone]}`;
      demoContent.metadata.stats.wordCount += tones[formData.tone].split(' ').length;
      demoContent.metadata.stats.charCount += tones[formData.tone].length;
      demoContent.metadata.stats.sentenceCount += 1;
    }
  }
  
  if (formData.keywords) {
    // Adicionar palavras-chave como tags
    const keywords = formData.keywords.split(',').map(k => k.trim()).filter(k => k);
    if (keywords.length > 0) {
      demoContent.metadata.tags = [...new Set([...demoContent.metadata.tags, ...keywords])];
    }
  }
  
  // Exibir conteúdo de demonstração
  displayGeneratedContent(demoContent);
}

/**
 * Usa sugestões de demonstração como fallback
 * @param {string} topic - Tópico para sugestões
 */
function useDemoSuggestions(topic) {
  const demoSuggestions = {
    topics: [
      `${topic} para iniciantes`,
      `Como melhorar ${topic} em 30 dias`,
      `${topic} para profissionais ocupados`,
      `${topic} - mitos e verdades`,
      `O futuro do ${topic} em 2025`
    ],
    keywords: [
      'produtividade',
      'eficiência',
      'organização',
      'foco',
      'planejamento',
      'rotina',
      'hábitos',
      'metas',
      'resultados',
      'desempenho'
    ]
  };
  
  // Exibir sugestões de demonstração
  displaySuggestions(demoSuggestions);
}

/**
 * Inicia monitoramento de desempenho
 */
function startPerformanceMonitoring() {
  // Registrar primeira interação
  document.addEventListener('click', function onFirstInteraction() {
    performanceMetrics.firstInteraction = performance.now();
    document.removeEventListener('click', onFirstInteraction);
  }, { once: true });
  
  // Monitorar tempo de renderização
  const observer = new PerformanceObserver((list) => {
    for (const entry of list.getEntries()) {
      if (entry.entryType === 'paint' && entry.name === 'first-contentful-paint') {
        performanceMetrics.renderTime = entry.startTime;
        observer.disconnect();
      }
    }
  });
  
  observer.observe({ entryTypes: ['paint'] });
  
  // Enviar métricas periodicamente
  setInterval(() => {
    if (config.analyticsEnabled) {
      sendPerformanceMetrics();
    }
  }, 60000); // A cada minuto
}

/**
 * Registra interação do usuário
 * @param {string} type - Tipo de interação
 * @param {Object} data - Dados adicionais
 */
function recordInteraction(type, data = {}) {
  performanceMetrics.interactions.push({
    type,
    data,
    timestamp: Date.now()
  });
}

/**
 * Envia métricas de desempenho para o servidor
 */
function sendPerformanceMetrics() {
  // Coletar métricas
  const metrics = {
    ...performanceMetrics,
    userAgent: navigator.userAgent,
    screenSize: `${window.innerWidth}x${window.innerHeight}`,
    timestamp: Date.now()
  };
  
  // Enviar para o servidor
  fetch('/api/metrics', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(metrics)
  }).catch(() => {
    // Silenciar erros de métricas
  });
  
  // Limpar métricas enviadas
  performanceMetrics.apiCalls = [];
  performanceMetrics.interactions = [];
}

// Exportar funções para uso global
window.ViralCraft = {
  handleContentGeneration,
  handleSuggestionRequest,
  showNotification
};
