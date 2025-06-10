// routes/contentRoutes.js
const express = require('express');
const router = express.Router();
const contentRepository = require('../repositories/contentRepository');
const textAnalysisService = require('../services/textAnalysisService');
const ErrorHandler = require('../middleware/errorHandler');
const { body, param, validationResult } = require('express-validator');

/**
 * @route   GET /api/content
 * @desc    Obter todos os conteúdos
 * @access  Public
 */
router.get('/', async (req, res, next) => {
  try {
    const { platform, status, limit = 20, offset = 0 } = req.query;
    
    // Construir filtros baseados nos parâmetros
    const filters = {};
    if (platform) filters.platform = platform;
    if (status) filters.status = status;
    
    // Opções de paginação
    const options = { limit: parseInt(limit), offset: parseInt(offset) };
    
    const contents = await contentRepository.findAll(filters, options);
    res.json({ 
      success: true, 
      count: contents.length,
      data: contents 
    });
  } catch (error) {
    next(error);
  }
});

/**
 * @route   GET /api/content/:id
 * @desc    Obter conteúdo por ID
 * @access  Public
 */
router.get('/:id', 
  param('id').isUUID().withMessage('ID inválido'),
  async (req, res, next) => {
    try {
      // Validar parâmetros
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({ 
          success: false, 
          errors: errors.array() 
        });
      }
      
      const content = await contentRepository.findById(req.params.id);
      
      if (!content) {
        return next(ErrorHandler.createError('Conteúdo não encontrado', 404));
      }
      
      res.json({ success: true, data: content });
    } catch (error) {
      next(error);
    }
  }
);

/**
 * @route   POST /api/content
 * @desc    Criar novo conteúdo
 * @access  Public
 */
router.post('/',
  // Validação de campos
  body('title').notEmpty().withMessage('Título é obrigatório'),
  body('type').notEmpty().withMessage('Tipo é obrigatório'),
  body('platform').notEmpty().withMessage('Plataforma é obrigatória'),
  body('content').notEmpty().withMessage('Conteúdo é obrigatório'),
  async (req, res, next) => {
    try {
      // Validar corpo da requisição
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({ 
          success: false, 
          errors: errors.array() 
        });
      }
      
      // Analisar conteúdo antes de salvar
      const analysis = textAnalysisService.analyzeContent(
        typeof req.body.content === 'string' ? req.body.content : JSON.stringify(req.body.content),
        req.body.platform
      );
      
      // Adicionar metadados da análise
      const contentData = {
        ...req.body,
        metadata: {
          ...req.body.metadata,
          analysis
        },
        viralScore: analysis.viralScore
      };
      
      const newContent = await contentRepository.create(contentData);
      res.status(201).json({ 
        success: true, 
        data: newContent,
        analysis
      });
    } catch (error) {
      next(error);
    }
  }
);

/**
 * @route   PUT /api/content/:id
 * @desc    Atualizar conteúdo existente
 * @access  Public
 */
router.put('/:id',
  param('id').isUUID().withMessage('ID inválido'),
  body('title').optional().notEmpty().withMessage('Título não pode ser vazio'),
  body('content').optional().notEmpty().withMessage('Conteúdo não pode ser vazio'),
  async (req, res, next) => {
    try {
      // Validar parâmetros e corpo
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({ 
          success: false, 
          errors: errors.array() 
        });
      }
      
      // Se o conteúdo foi atualizado, reanalisar
      let updates = req.body;
      
      if (req.body.content && req.body.platform) {
        const analysis = textAnalysisService.analyzeContent(
          typeof req.body.content === 'string' ? req.body.content : JSON.stringify(req.body.content),
          req.body.platform
        );
        
        updates = {
          ...updates,
          metadata: {
            ...updates.metadata,
            analysis
          },
          viralScore: analysis.viralScore
        };
      }
      
      const updatedContent = await contentRepository.update(req.params.id, updates);
      
      if (!updatedContent) {
        return next(ErrorHandler.createError('Conteúdo não encontrado', 404));
      }
      
      res.json({ success: true, data: updatedContent });
    } catch (error) {
      next(error);
    }
  }
);

/**
 * @route   DELETE /api/content/:id
 * @desc    Remover conteúdo
 * @access  Public
 */
router.delete('/:id',
  param('id').isUUID().withMessage('ID inválido'),
  async (req, res, next) => {
    try {
      // Validar parâmetros
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({ 
          success: false, 
          errors: errors.array() 
        });
      }
      
      const deleted = await contentRepository.delete(req.params.id);
      
      if (!deleted) {
        return next(ErrorHandler.createError('Conteúdo não encontrado', 404));
      }
      
      res.json({ 
        success: true, 
        message: 'Conteúdo removido com sucesso' 
      });
    } catch (error) {
      next(error);
    }
  }
);

/**
 * @route   GET /api/content/platform/:platform
 * @desc    Buscar conteúdos por plataforma
 * @access  Public
 */
router.get('/platform/:platform', async (req, res, next) => {
  try {
    const contents = await contentRepository.findByPlatform(req.params.platform);
    res.json({ 
      success: true, 
      count: contents.length,
      data: contents 
    });
  } catch (error) {
    next(error);
  }
});

/**
 * @route   GET /api/content/search/:query
 * @desc    Buscar conteúdos por texto
 * @access  Public
 */
router.get('/search/:query', async (req, res, next) => {
  try {
    const contents = await contentRepository.search(req.params.query);
    res.json({ 
      success: true, 
      count: contents.length,
      data: contents 
    });
  } catch (error) {
    next(error);
  }
});

/**
 * @route   POST /api/content/:id/analyze
 * @desc    Analisar conteúdo existente
 * @access  Public
 */
router.post('/:id/analyze',
  param('id').isUUID().withMessage('ID inválido'),
  async (req, res, next) => {
    try {
      const content = await contentRepository.findById(req.params.id);
      
      if (!content) {
        return next(ErrorHandler.createError('Conteúdo não encontrado', 404));
      }
      
      const contentText = typeof content.content === 'string' 
        ? content.content 
        : JSON.stringify(content.content);
      
      const analysis = textAnalysisService.analyzeContent(
        contentText,
        content.platform
      );
      
      // Atualizar metadados com a nova análise
      await contentRepository.update(req.params.id, {
        metadata: {
          ...content.metadata,
          analysis
        },
        viralScore: analysis.viralScore
      });
      
      res.json({ 
        success: true, 
        data: analysis 
      });
    } catch (error) {
      next(error);
    }
  }
);

module.exports = router;
