// routes/contentRoutes.js
const express = require('express');
const router = express.Router();
const contentRepository = require('../repositories/contentRepository');
const textAnalysisService = require('../services/textAnalysisService');
const ErrorHandler = require('../middleware/errorHandler');
const { optionalAuth, requireAuth } = require('../middleware/requireAuth');
const { body, param, validationResult } = require('express-validator');

/**
 * Build an ownership filter for content listings. Authenticated callers only
 * see their own rows (or their org's rows when the JWT carries an `org_id`);
 * anonymous reads remain allowed in development but return nothing in
 * production. Used by the canonical `GET /` listing.
 */
function ownershipFilter(req) {
  if (req.auth?.clerkUserId) {
    if (req.auth.orgId) return { orgId: req.auth.orgId };
    return { userId: req.auth.clerkUserId };
  }
  if (process.env.NODE_ENV === 'production') {
    return { userId: '__no-such-user__' };
  }
  return {};
}

/**
 * Verify that the authenticated caller owns the given content row. Throws a
 * createError-formatted 403 / 401 otherwise. Used by all routes that mutate or
 * disclose a specific :id — they MUST call this before doing anything with the
 * loaded row.
 */
function assertOwnership(req, content) {
  if (!req.auth?.clerkUserId) {
    throw ErrorHandler.createError('Authentication required', 401);
  }
  const owned = req.auth.orgId
    ? content.orgId === req.auth.orgId
    : content.userId === req.auth.clerkUserId;
  if (!owned) {
    throw ErrorHandler.createError('Forbidden', 403);
  }
}

function rejectIfValidationErrors(req, res) {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    res.status(400).json({ success: false, errors: errors.array() });
    return true;
  }
  return false;
}

/**
 * @route   GET /api/content
 * @desc    List the authenticated user's (or org's) content.
 * @access  Auth (anonymous returns empty list in production)
 */
router.get('/', optionalAuth, async (req, res, next) => {
  try {
    const { platform, status, limit = 20, offset = 0 } = req.query;

    const filters = { ...ownershipFilter(req) };
    if (platform) filters.platform = platform;
    if (status) filters.status = status;

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
 * @desc    Get a content row by id.
 * @access  Auth + ownership
 */
router.get(
  '/:id',
  optionalAuth,
  param('id').isUUID().withMessage('ID inválido'),
  async (req, res, next) => {
    try {
      if (rejectIfValidationErrors(req, res)) return;

      const content = await contentRepository.findById(req.params.id);
      if (!content) {
        return next(ErrorHandler.createError('Conteúdo não encontrado', 404));
      }

      // Ownership check — authenticated users can only see their own (or org's) content.
      assertOwnership(req, content);
      res.json({ success: true, data: content });
    } catch (error) {
      next(error);
    }
  }
);

/**
 * @route   POST /api/content
 * @desc    Create new content stamped with the caller's ownership.
 * @access  Auth required
 */
router.post(
  '/',
  requireAuth,
  body('title').notEmpty().withMessage('Título é obrigatório'),
  body('type').notEmpty().withMessage('Tipo é obrigatório'),
  body('platform').notEmpty().withMessage('Plataforma é obrigatória'),
  body('content').notEmpty().withMessage('Conteúdo é obrigatório'),
  async (req, res, next) => {
    try {
      if (rejectIfValidationErrors(req, res)) return;

      const analysis = textAnalysisService.analyzeContent(
        typeof req.body.content === 'string' ? req.body.content : JSON.stringify(req.body.content),
        req.body.platform
      );

      const contentData = {
        ...req.body,
        metadata: { ...req.body.metadata, analysis },
        viralScore: analysis.viralScore,
        userId: req.auth.clerkUserId,
        orgId: req.auth.orgId || null
      };

      const newContent = await contentRepository.create(contentData);
      res.status(201).json({ success: true, data: newContent, analysis });
    } catch (error) {
      next(error);
    }
  }
);

/**
 * @route   PUT /api/content/:id
 * @desc    Update an existing content row owned by the caller.
 * @access  Auth + ownership
 */
router.put(
  '/:id',
  requireAuth,
  param('id').isUUID().withMessage('ID inválido'),
  body('title').optional().notEmpty().withMessage('Título não pode ser vazio'),
  body('content').optional().notEmpty().withMessage('Conteúdo não pode ser vazio'),
  async (req, res, next) => {
    try {
      if (rejectIfValidationErrors(req, res)) return;

      const existing = await contentRepository.findById(req.params.id);
      if (!existing) {
        return next(ErrorHandler.createError('Conteúdo não encontrado', 404));
      }
      assertOwnership(req, existing);

      // Strip ownership fields out of the patch — they're set on create only.
      const { userId: _u, orgId: _o, ...updates } = req.body;

      let patch = updates;
      if (updates.content && updates.platform) {
        const analysis = textAnalysisService.analyzeContent(
          typeof updates.content === 'string' ? updates.content : JSON.stringify(updates.content),
          updates.platform
        );
        patch = {
          ...updates,
          metadata: { ...updates.metadata, analysis },
          viralScore: analysis.viralScore
        };
      }

      const updatedContent = await contentRepository.update(req.params.id, patch);
      res.json({ success: true, data: updatedContent });
    } catch (error) {
      next(error);
    }
  }
);

/**
 * @route   DELETE /api/content/:id
 * @desc    Remove a content row owned by the caller.
 * @access  Auth + ownership
 */
router.delete(
  '/:id',
  requireAuth,
  param('id').isUUID().withMessage('ID inválido'),
  async (req, res, next) => {
    try {
      if (rejectIfValidationErrors(req, res)) return;

      const existing = await contentRepository.findById(req.params.id);
      if (!existing) {
        return next(ErrorHandler.createError('Conteúdo não encontrado', 404));
      }
      assertOwnership(req, existing);

      await contentRepository.delete(req.params.id);
      res.json({ success: true, message: 'Conteúdo removido com sucesso' });
    } catch (error) {
      next(error);
    }
  }
);

/**
 * @route   GET /api/content/platform/:platform
 * @desc    List the caller's content for a specific platform.
 * @access  Auth (anonymous returns empty list in production)
 */
router.get('/platform/:platform', optionalAuth, async (req, res, next) => {
  try {
    const filters = { ...ownershipFilter(req), platform: req.params.platform };
    const contents = await contentRepository.findAll(filters);
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
 * @desc    Full-text-ish search across the caller's own content.
 * @access  Auth (anonymous returns empty list in production)
 */
router.get('/search/:query', optionalAuth, async (req, res, next) => {
  try {
    const contents = await contentRepository.searchScoped(req.params.query, ownershipFilter(req));
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
 * @desc    Recompute the viral analysis for an owned content row.
 * @access  Auth + ownership
 */
router.post(
  '/:id/analyze',
  requireAuth,
  param('id').isUUID().withMessage('ID inválido'),
  async (req, res, next) => {
    try {
      if (rejectIfValidationErrors(req, res)) return;

      const content = await contentRepository.findById(req.params.id);
      if (!content) {
        return next(ErrorHandler.createError('Conteúdo não encontrado', 404));
      }
      assertOwnership(req, content);

      const contentText =
        typeof content.content === 'string' ? content.content : JSON.stringify(content.content);

      const analysis = textAnalysisService.analyzeContent(contentText, content.platform);

      await contentRepository.update(req.params.id, {
        metadata: { ...content.metadata, analysis },
        viralScore: analysis.viralScore
      });

      res.json({ success: true, data: analysis });
    } catch (error) {
      next(error);
    }
  }
);

module.exports = router;
// Exported helpers so tests can exercise them directly.
module.exports.ownershipFilter = ownershipFilter;
module.exports.assertOwnership = assertOwnership;
