// Modernização do frontend do ViralCraft-AI
// Este script implementa melhorias de UX/UI e interatividade

document.addEventListener('DOMContentLoaded', function() {
  // Referências aos elementos principais
  const loadingScreen = document.getElementById('loading-screen');
  const mainContent = document.getElementById('main-content');
  const statusContainer = document.getElementById('status-container');
  const formContainer = document.getElementById('form-container');
  const resultContainer = document.getElementById('result-container');

  // Inicialização da aplicação
  initApp();

  // Função principal de inicialização
  function initApp() {
    // Mostrar tela de carregamento
    showLoadingScreen();

    // Verificar status do sistema
    checkSystemStatus()
      .then(() => {
        // Inicializar componentes da UI
        initTabs();
        initFormValidation();
        initFileUpload();
        setupFormSubmission();

        // Esconder tela de carregamento após inicialização
        setTimeout(hideLoadingScreen, 1500);
      })
      .catch(error => {
        showNotification('Erro ao inicializar aplicação: ' + error.message, 'error');
        hideLoadingScreen();
      });
  }

  // Gerenciamento da tela de carregamento
  function showLoadingScreen() {
    if (loadingScreen) {
      loadingScreen.classList.remove('fade-out');
      loadingScreen.style.display = 'flex';
    }
  }

  function hideLoadingScreen() {
    if (loadingScreen) {
      loadingScreen.classList.add('fade-out');
      setTimeout(() => {
        loadingScreen.style.display = 'none';
      }, 500);
    }
  }

  // Verificar status do sistema
  async function checkSystemStatus() {
    try {
      const response = await fetch('/api/health');
      const data = await response.json();
      
      if (statusContainer) {
        updateStatusDisplay(data);
      }
      
      return data;
    } catch (error) {
      throw new Error('Failed to check system status');
    }
  }

  function updateStatusDisplay(data) {
    const uptimeElement = document.querySelector('.status-value[data-status="uptime"]');
    if (uptimeElement) {
      uptimeElement.textContent = data.uptime || '0s';
    }

    const aiElement = document.querySelector('.status-value[data-status="ai"]');
    if (aiElement) {
      const hasAI = data.services?.openai?.configured || data.services?.anthropic?.configured;
      aiElement.innerHTML = hasAI ? 
        '<span class="status-dot"></span> Ativo' : 
        '<span class="status-dot" style="background-color: var(--color-error)"></span> Inativo';
    }

    const dbElement = document.querySelector('.status-value[data-status="database"]');
    if (dbElement) {
      const dbConnected = data.services?.database?.connected;
      dbElement.innerHTML = dbConnected ? 
        '<span class="status-dot"></span> Conectado' : 
        '<span class="status-dot" style="background-color: var(--color-error)"></span> Desconectado';
    }

    const serverElement = document.querySelector('.status-value[data-status="server"]');
    if (serverElement) {
      serverElement.innerHTML = '<span class="status-dot"></span> Online';
    }

    showNotification('Status atualizado!', 'info');
  }

  // Inicializar abas
  function initTabs() {
    const tabButtons = document.querySelectorAll('.tab-button');
    const tabContents = document.querySelectorAll('.tab-content');

    tabButtons.forEach(button => {
      button.addEventListener('click', () => {
        const targetTab = button.dataset.tab;
        
        // Remove active class from all tabs
        tabButtons.forEach(btn => btn.classList.remove('active'));
        tabContents.forEach(content => content.classList.remove('active'));
        
        // Add active class to clicked tab
        button.classList.add('active');
        const targetContent = document.getElementById(targetTab);
        if (targetContent) {
          targetContent.classList.add('active');
        }
      });
    });
  }

  // Inicializar validação de formulário
  function initFormValidation() {
    const forms = document.querySelectorAll('form');
    
    forms.forEach(form => {
      form.addEventListener('submit', validateForm);
    });
  }

  function validateForm(event) {
    const form = event.target;
    const requiredFields = form.querySelectorAll('[required]');
    let isValid = true;

    requiredFields.forEach(field => {
      if (!field.value.trim()) {
        isValid = false;
        field.classList.add('error');
        showNotification(`Campo ${field.name || 'obrigatório'} não preenchido`, 'error');
      } else {
        field.classList.remove('error');
      }
    });

    if (!isValid) {
      event.preventDefault();
    }
  }

  // Inicializar upload de arquivo
  function initFileUpload() {
    const fileInput = document.getElementById('file-input');
    const dropZone = document.querySelector('.file-drop-zone');

    if (fileInput && dropZone) {
      dropZone.addEventListener('dragover', (e) => {
        e.preventDefault();
        dropZone.classList.add('dragover');
      });

      dropZone.addEventListener('dragleave', () => {
        dropZone.classList.remove('dragover');
      });

      dropZone.addEventListener('drop', (e) => {
        e.preventDefault();
        dropZone.classList.remove('dragover');
        
        const files = e.dataTransfer.files;
        if (files.length > 0) {
          fileInput.files = files;
          handleFileUpload(files[0]);
        }
      });

      fileInput.addEventListener('change', (e) => {
        if (e.target.files.length > 0) {
          handleFileUpload(e.target.files[0]);
        }
      });
    }
  }

  function handleFileUpload(file) {
    const allowedTypes = ['image/jpeg', 'image/png', 'image/webp', 'application/pdf', 'text/plain'];
    
    if (!allowedTypes.includes(file.type)) {
      showNotification('Tipo de arquivo não suportado', 'error');
      return;
    }

    if (file.size > 10 * 1024 * 1024) { // 10MB
      showNotification('Arquivo muito grande (máximo 10MB)', 'error');
      return;
    }

    showNotification(`Arquivo ${file.name} carregado com sucesso`, 'success');
  }

  // Configurar envio de formulário
  function setupFormSubmission() {
    const generateForm = document.getElementById('generate-form');
    
    if (generateForm) {
      generateForm.addEventListener('submit', handleFormSubmission);
    }
  }

  async function handleFormSubmission(event) {
    event.preventDefault();
    
    const form = event.target;
    const formData = new FormData(form);
    const submitButton = form.querySelector('button[type="submit"]');
    
    // Adicionar estado de loading
    if (submitButton) {
      submitButton.disabled = true;
      submitButton.classList.add('loading');
      submitButton.textContent = 'Gerando...';
    }

    try {
      const response = await fetch('/api/generate', {
        method: 'POST',
        body: formData
      });

      const data = await response.json();

      if (data.success) {
        displayResults(data);
        showNotification('Conteúdo gerado com sucesso!', 'success');
      } else {
        showNotification(data.error || 'Erro ao gerar conteúdo', 'error');
      }
    } catch (error) {
      showNotification('Erro de conexão: ' + error.message, 'error');
    } finally {
      // Remover estado de loading
      if (submitButton) {
        submitButton.disabled = false;
        submitButton.classList.remove('loading');
        submitButton.textContent = 'Gerar Conteúdo';
      }
    }
  }

  function displayResults(data) {
    if (resultContainer) {
      resultContainer.innerHTML = `
        <div class="result-content">
          <h3>Conteúdo Gerado</h3>
          <div class="content-output">
            ${Object.entries(data.content).map(([platform, content]) => `
              <div class="platform-content">
                <h4>${platform.charAt(0).toUpperCase() + platform.slice(1)}</h4>
                <div class="content-text">${content}</div>
                <div class="content-actions">
                  <button onclick="copyToClipboard('${content.replace(/'/g, "\\'")}')">Copiar</button>
                  <button onclick="downloadContent('${content.replace(/'/g, "\\'")}')">Download</button>
                </div>
              </div>
            `).join('')}
          </div>
        </div>
      `;
      resultContainer.style.display = 'block';
    }
  }

  // Função de notificação
  function showNotification(message, type = 'info') {
    const notification = document.createElement('div');
    notification.className = `notification notification-${type}`;
    notification.textContent = message;
    
    document.body.appendChild(notification);
    
    setTimeout(() => {
      notification.classList.add('show');
    }, 100);
    
    setTimeout(() => {
      notification.classList.remove('show');
      setTimeout(() => {
        document.body.removeChild(notification);
      }, 300);
    }, 3000);
  }

  // Funções utilitárias globais
  window.copyToClipboard = function(text) {
    navigator.clipboard.writeText(text).then(() => {
      showNotification('Conteúdo copiado!', 'success');
    }).catch(() => {
      // Fallback
      const textarea = document.createElement('textarea');
      textarea.value = text;
      document.body.appendChild(textarea);
      textarea.select();
      document.execCommand('copy');
      document.body.removeChild(textarea);
      showNotification('Conteúdo copiado!', 'success');
    });
  };

  window.downloadContent = function(content) {
    const blob = new Blob([content], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `content-${Date.now()}.txt`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };
});out');
    }
  }

  function hideLoadingScreen() {
    if (loadingScreen) {
      loadingScreen.classList.add('fade-out');
      setTimeout(() => {
        loadingScreen.style.display = 'none';
      }, 500);
    }
  }

  // Verificação de status do sistema
  async function checkSystemStatus() {
    try {
      const response = await fetch('/api/health', {
        method: 'GET',
        headers: {
          'Accept': 'application/json',
          'Content-Type': 'application/json'
        },
        timeout: 10000
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      const data = await response.json();

      if (statusContainer) {
        updateSystemStatus(data);
      }

      return data;
    } catch (error) {
      console.error('Erro ao verificar status:', error);
      showNotification('Não foi possível conectar ao servidor', 'error');

      // Fallback status for offline mode
      return {
        status: 'offline',
        services: {
          database: { connected: false },
          openai: { configured: false },
          anthropic: { configured: false }
        }
      };
    }
  }

  // Atualização visual do status do sistema
  function updateSystemStatus(data) {
    // Atualizar uptime
    const uptimeEl = document.querySelector('.status-value[data-status="uptime"]');
    if (uptimeEl) {
      uptimeEl.textContent = data.uptime || '0s';
    }

    // Atualizar status da IA
    const aiStatusEl = document.querySelector('.status-value[data-status="ai"]');
    if (aiStatusEl) {
      const aiConfigured = data.services?.openai?.configured || data.services?.anthropic?.configured;
      aiStatusEl.innerHTML = aiConfigured 
        ? '<span class="status-dot"></span> Ativo' 
        : '<span class="status-dot" style="background-color: var(--color-error)"></span> Inativo';
    }

    // Atualizar status do banco de dados
    const dbStatusEl = document.querySelector('.status-value[data-status="database"]');
    if (dbStatusEl) {
      const dbConnected = data.services?.database?.connected;
      dbStatusEl.innerHTML = dbConnected 
        ? '<span class="status-dot"></span> Conectado' 
        : '<span class="status-dot" style="background-color: var(--color-error)"></span> Desconectado';
    }

    // Atualizar status do servidor
    const serverStatusEl = document.querySelector('.status-value[data-status="server"]');
    if (serverStatusEl) {
      serverStatusEl.innerHTML = '<span class="status-dot"></span> Online';
    }

    // Mostrar notificação de status
    showNotification('Status atualizado!', 'info');
  }

  // Sistema de abas para organização do formulário
  function initTabs() {
    const tabs = document.querySelectorAll('.tab');
    const tabContents = document.querySelectorAll('.tab-content');

    if (tabs.length === 0 || tabContents.length === 0) return;

    tabs.forEach(tab => {
      tab.addEventListener('click', () => {
        // Remover classe ativa de todas as abas
        tabs.forEach(t => t.classList.remove('active'));
        tabContents.forEach(c => c.classList.remove('active'));

        // Adicionar classe ativa à aba clicada
        tab.classList.add('active');

        // Mostrar conteúdo correspondente
        const targetId = tab.getAttribute('data-tab');
        const targetContent = document.getElementById(targetId);
        if (targetContent) {
          targetContent.classList.add('active');
        }

        // Atualizar barra de progresso
        updateProgressBar();
      });
    });

    // Ativar primeira aba por padrão
    tabs[0].click();
  }

  // Barra de progresso para navegação entre etapas
  function updateProgressBar() {
    const progressBar = document.querySelector('.progress-bar-fill');
    const tabs = document.querySelectorAll('.tab');
    const activeTabIndex = Array.from(tabs).findIndex(tab => tab.classList.contains('active'));

    if (progressBar && activeTabIndex !== -1) {
      const progress = (activeTabIndex / (tabs.length - 1)) * 100;
      progressBar.style.width = `${progress}%`;

      // Atualizar status das etapas
      const steps = document.querySelectorAll('.progress-step');
      steps.forEach((step, index) => {
        if (index < activeTabIndex) {
          step.classList.add('completed');
          step.classList.remove('active');
        } else if (index === activeTabIndex) {
          step.classList.add('active');
          step.classList.remove('completed');
        } else {
          step.classList.remove('active', 'completed');
        }
      });
    }
  }

  // Validação de formulário em tempo real
  function initFormValidation() {
    const formInputs = document.querySelectorAll('.form-input, .form-select, .form-textarea');

    formInputs.forEach(input => {
      input.addEventListener('blur', () => {
        validateInput(input);
      });

      input.addEventListener('input', () => {
        // Remover mensagens de erro ao digitar
        const errorMessage = input.parentElement.querySelector('.error-message');
        if (errorMessage) {
          errorMessage.remove();
        }
        input.classList.remove('error');
      });
    });
  }

  function validateInput(input) {
    const value = input.value.trim();
    const isRequired = input.hasAttribute('required');

    // Remover mensagem de erro anterior
    const existingError = input.parentElement.querySelector('.error-message');
    if (existingError) {
      existingError.remove();
    }

    // Validar campo obrigatório
    if (isRequired && value === '') {
      showInputError(input, 'Este campo é obrigatório');
      return false;
    }

    // Validações específicas por tipo
    if (input.type === 'email' && value !== '') {
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (!emailRegex.test(value)) {
        showInputError(input, 'Email inválido');
        return false;
      }
    }

    // Validação de URL
    if (input.type === 'url' && value !== '') {
      try {
        new URL(value);
      } catch (e) {
        showInputError(input, 'URL inválida');
        return false;
      }
    }

    return true;
  }

  function showInputError(input, message) {
    input.classList.add('error');

    const errorElement = document.createElement('div');
    errorElement.className = 'error-message';
    errorElement.style.color = 'var(--color-error)';
    errorElement.style.fontSize = '0.75rem';
    errorElement.style.marginTop = '0.25rem';
    errorElement.textContent = message;

    input.parentElement.appendChild(errorElement);
  }

  // Upload de arquivos com preview
  function initFileUpload() {
    const fileInputs = document.querySelectorAll('input[type="file"]');

    fileInputs.forEach(input => {
      const button = input.parentElement.querySelector('.file-upload-button');
      const previewContainer = input.parentElement.querySelector('.file-preview');

      if (button) {
        button.addEventListener('click', () => {
          input.click();
        });
      }

      input.addEventListener('change', () => {
        if (input.files.length > 0) {
          const file = input.files[0];
          updateFilePreview(file, previewContainer, button);
        }
      });
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
      reader.onload = e => {
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

  // Configuração do envio do formulário
  function setupFormSubmission() {
    const form = document.getElementById('content-form');
    const generateButton = document.getElementById('generate-button');
    const suggestButton = document.getElementById('suggest-button');

    if (!form) return;

    if (generateButton) {
      generateButton.addEventListener('click', async (e) => {
        e.preventDefault();

        // Validar formulário antes de enviar
        if (!validateForm(form)) {
          showNotification('Por favor, corrija os erros no formulário', 'error');
          return;
        }

        // Mostrar estado de carregamento
        generateButton.disabled = true;
        generateButton.innerHTML = '<span class="spinner"></span> Gerando...';

        try {
          await generateContent(form);
          generateButton.disabled = false;
          generateButton.innerHTML = '✨ Gerar Conteúdo';
        } catch (error) {
          generateButton.disabled = false;
          generateButton.innerHTML = '✨ Gerar Conteúdo';
          showNotification('Erro ao gerar conteúdo: ' + error.message, 'error');
        }
      });
    }

    if (suggestButton) {
      suggestButton.addEventListener('click', async (e) => {
        e.preventDefault();

        // Validar campos básicos
        const topicInput = form.querySelector('input[name="topic"]');
        if (!topicInput || !topicInput.value.trim()) {
          showInputError(topicInput, 'Informe um tópico para receber sugestões');
          showNotification('Informe um tópico para receber sugestões', 'error');
          return;
        }

        // Mostrar estado de carregamento
        suggestButton.disabled = true;
        suggestButton.innerHTML = '<span class="spinner"></span> Sugerindo...';

        try {
          await suggestContent(form);
          suggestButton.disabled = false;
          suggestButton.innerHTML = '💡 Sugerir Ideias';
        } catch (error) {
          suggestButton.disabled = false;
          suggestButton.innerHTML = '💡 Sugerir Ideias';
          showNotification('Erro ao sugerir conteúdo: ' + error.message, 'error');
        }
      });
    }
  }

  function validateForm(form) {
    const requiredInputs = form.querySelectorAll('[required]');
    let isValid = true;

    requiredInputs.forEach(input => {
      if (!validateInput(input)) {
        isValid = false;
      }
    });

    return isValid;
  }

  // Geração de conteúdo
  async function generateContent(form) {
    const formData = new FormData(form);
    const payload = {};

    // Converter FormData para objeto
    for (const [key, value] of formData.entries()) {
      if (key === 'keywords') {
        // Converter keywords para array
        payload[key] = value.split(',').map(k => k.trim()).filter(k => k);
      } else if (key === 'file') {
        // Ignorar arquivo vazio
        if (value.size > 0) {
          payload.file = value;
        }
      } else {
        payload[key] = value;
      }
    }

    // Processar upload de arquivo se existir
    if (payload.file) {
      try {
        const extractedData = await extractFileContent(payload.file);
        payload.extractedData = extractedData;
      } catch (error) {
        console.error('Erro ao extrair conteúdo do arquivo:', error);
        showNotification('Não foi possível processar o arquivo', 'error');
      }
    }

    // Enviar requisição para gerar conteúdo
    try {
      const response = await fetch('/api/generate', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(payload)
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Erro ao gerar conteúdo');
      }

      const data = await response.json();
      displayGeneratedContent(data);
      showNotification('Conteúdo gerado com sucesso!', 'success');

      // Scroll para o resultado
      if (resultContainer) {
        resultContainer.scrollIntoView({ behavior: 'smooth' });
      }
    } catch (error) {
      console.error('Erro na geração:', error);
      let errorMessage = 'Erro na geração de conteúdo';

      if (error.response) {
        errorMessage = error.response.data?.error || errorMessage;
      } else if (error.message) {
        errorMessage = error.message;
      }

      showNotification(errorMessage, 'error');
      return null;
    }
  }

  // Sugestão de conteúdo
  async function suggestContent(form) {
    const formData = new FormData(form);
    const payload = {};

    // Converter FormData para objeto
    for (const [key, value] of formData.entries()) {
      if (key === 'keywords') {
        // Converter keywords para array
        payload[key] = value.split(',').map(k => k.trim()).filter(k => k);
      } else {
        payload[key] = value;
      }
    }

    // Enviar requisição para sugerir conteúdo
    try {
      const response = await fetch('/api/suggest', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(payload)
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Erro ao sugerir conteúdo');
      }

      const data = await response.json();
      displaySuggestion(data);
      showNotification('Sugestão gerada com sucesso!', 'success');
    } catch (error) {
      console.error('Erro na sugestão:', error);
      throw error;
    }
  }

  // Extração de conteúdo de arquivo
  async function extractFileContent(file) {
    const formData = new FormData();
    formData.append('file', file);
    formData.append('type', file.type);

    try {
      const response = await fetch('/api/extract', {
        method: 'POST',
        body: formData
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Erro ao extrair conteúdo');
      }

      const data = await response.json();
      return data.data;
    } catch (error) {
      console.error('Erro na extração:', error);
      throw error;
    }
  }

  // Exibição de conteúdo gerado
  function displayGeneratedContent(data) {
    if (!resultContainer) return;

    // Mostrar container de resultado
    resultContainer.classList.remove('hidden');

    // Obter plataforma selecionada
    const platform = document.querySelector('select[name="platform"]').value;
    const content = data.content[platform];

    // Converter markdown para HTML
    const htmlContent = convertMarkdownToHtml(content);

    // Atualizar conteúdo
    const resultContent = resultContainer.querySelector('.result-content');
    if (resultContent) {
      resultContent.innerHTML = htmlContent;
    }

    // Adicionar botões de ação
    const actionButtons = resultContainer.querySelector('.result-actions');
    if (actionButtons) {
      actionButtons.innerHTML = `
        <button class="btn btn-secondary" onclick="copyToClipboard()">
          <span>📋</span> Copiar
        </button>
        <button class="btn btn-secondary" onclick="downloadContent()">
          <span>💾</span> Baixar
        </button>
      `;
    }
  }

  // Exibição de sugestão
  function displaySuggestion(data) {
    const suggestion = data.suggestion;

    // Preencher campos com sugestão
    const titleInput = document.querySelector('input[name="topic"]');
    if (titleInput && suggestion.title) {
      titleInput.value = suggestion.title;
    }

    // Mostrar sugestão em modal ou área dedicada
    const suggestionContainer = document.getElementById('suggestion-container');
    if (suggestionContainer) {
      suggestionContainer.classList.remove('hidden');
      suggestionContainer.innerHTML = `
        <div class="card">
          <div class="card-header">
            <h3 class="card-title">💡 Sugestão de Conteúdo</h3>
          </div>
          <div class="suggestion-content">
            <h4>Título Sugerido</h4>
            <p>${suggestion.title || 'Sem sugestão de título'}</p>

            <h4 class="mt-4">Estrutura Sugerida</h4>
            <div>${convertMarkdownToHtml(suggestion.outline || 'Sem sugestão de estrutura')}</div>

            <h4 class="mt-4">Hook Sugerido</h4>
            <p><em>${suggestion.hook || 'Sem sugestão de hook'}</em></p>

            <div class="mt-6 text-center">
              <button class="btn btn-primary" onclick="applyContentSuggestion()">
                Aplicar Sugestão
              </button>
            </div>
          </div>
        </div>
      `;
    }
  }

  // Converter markdown para HTML (versão simplificada)
  function convertMarkdownToHtml(markdown) {
    if (!markdown) return '';

    // Substituições básicas de markdown
    let html = markdown
      // Headers
      .replace(/^### (.*$)/gim, '<h3>$1</h3>')
      .replace(/^## (.*$)/gim, '<h2>$1</h2>')
      .replace(/^# (.*$)/gim, '<h1>$1</h1>')
      // Bold
      .replace(/\*\*(.*?)\*\*/gim, '<strong>$1</strong>')
      // Italic
      .replace(/\*(.*?)\*/gim, '<em>$1</em>')
      // Lists
      .replace(/^\s*\n\* (.*)/gim, '<ul>\n<li>$1</li>')
      .replace(/^\* (.*)/gim, '<li>$1</li>')
      .replace(/^\s*\n- (.*)/gim, '<ul>\n<li>$1</li>')
      .replace(/^- (.*)/gim, '<li>$1</li>')
      .replace(/^\s*\n\d+\. (.*)/gim, '<ol>\n<li>$1</li>')
      .replace(/^\d+\. (.*)/gim, '<li>$1</li>')
      // Blockquote
      .replace(/^\> (.*$)/gim, '<blockquote>$1</blockquote>')
      // Links
      .replace(/\[([^\]]+)\]\(([^)]+)\)/gim, '<a href="$2" target="_blank" rel="noopener noreferrer">$1</a>')
      // Line breaks
      .replace(/\n/gim, '<br>');

    // Fechar listas
    html = html
      .replace(/<\/li>\s*<li>/gim, '</li>\n<li>')
      .replace(/<\/li>\s*<\/ul>/gim, '</li>\n</ul>')
      .replace(/<\/li>\s*<\/ol>/gim, '</li>\n</ol>');

    return html;
  }

  // Sistema de notificações
  function showNotification(message, type = 'info') {
    // Remover notificações existentes
    const existingNotifications = document.querySelectorAll('.notification');
    existingNotifications.forEach(notification => {
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
  }

  // Funções globais (expostas para uso em HTML)
  window.copyToClipboard = function() {
    const content = document.querySelector('.result-content').innerText;
    navigator.clipboard.writeText(content)
      .then(() => {
        showNotification('Conteúdo copiado para a área de transferência!', 'success');
      })
      .catch(err => {
        showNotification('Erro ao copiar conteúdo', 'error');
        console.error('Erro ao copiar:', err);
      });
  };

  window.downloadContent = function() {
    const content = document.querySelector('.result-content').innerText;
    const title = document.querySelector('input[name="topic"]').value.trim() || 'conteudo';
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
  };

  window.applyContentSuggestion = function() {
    const suggestionContainer = document.getElementById('suggestion-container');
    if (!suggestionContainer) return;

    // Obter título sugerido
    const titleElement = suggestionContainer.querySelector('h4 + p');
    if (titleElement) {
      const titleInput = document.querySelector('input[name="topic"]');
      if (titleInput) {
        titleInput.value = titleElement.textContent;
      }
    }

    // Obter hook sugerido
    const hookElement = suggestionContainer.querySelector('h4 + p em');
    if (hookElement) {
      const contextInput = document.querySelector('textarea[name="additionalContext"]');
      if (contextInput) {
        contextInput.value = hookElement.textContent;
      }
    }

    // Esconder container de sugestão
    suggestionContainer.classList.add('hidden');

    showNotification('Sugestão aplicada com sucesso!', 'success');
  };
});