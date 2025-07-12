const Joi = require('joi');
const logger = require('./logger');

// Validation schemas
const schemas = {
  addBook: Joi.object({
    title: Joi.string().required().min(1).max(500),
    author_name: Joi.string().required().min(1).max(200),
    goodreads_id: Joi.string().optional(),
    isbn: Joi.string().optional(),
    status: Joi.string().valid('TBR', 'Reading', 'Read', 'Finished', 'DNF', 'Archived').default('TBR'),
    user_rating: Joi.number().integer().min(1).max(5).optional(),
    genres: Joi.array().items(Joi.string()).optional(),
    subgenres: Joi.array().items(Joi.string()).optional(),
    tropes: Joi.array().items(Joi.string()).optional(),
    spice_level: Joi.string().optional()
  }),

  updateBook: Joi.object({
    id: Joi.string().required(),
    title: Joi.string().min(1).max(500).optional(),
    author_name: Joi.string().min(1).max(200).optional(),
    status: Joi.string().valid('TBR', 'Reading', 'Read', 'Finished', 'DNF', 'Archived').optional(),
    user_rating: Joi.number().integer().min(1).max(5).optional(),
    genres: Joi.array().items(Joi.string()).optional(),
    subgenres: Joi.array().items(Joi.string()).optional(),
    tropes: Joi.array().items(Joi.string()).optional(),
    spice_level: Joi.string().optional(),
    notes: Joi.string().max(2000).optional()
  }),

  classifyBook: Joi.object({
    title: Joi.string().required(),
    author: Joi.string().required(),
    description: Joi.string().optional(),
    genres: Joi.array().items(Joi.string()).optional(),
    subgenres: Joi.array().items(Joi.string()).optional(),
    tropes: Joi.array().items(Joi.string()).optional()
  }),

  queueReorder: Joi.object({
    bookId: Joi.string().required(),
    newPosition: Joi.number().integer().min(1).required()
  }),

  batchAvailability: Joi.object({
    bookIds: Joi.array().items(Joi.string()).min(1).max(100).required()
  })
};

// Validation middleware factory
function validateRequest(schemaName) {
  return (req, res, next) => {
    const schema = schemas[schemaName];
    if (!schema) {
      logger.error('Invalid schema name for validation', { schemaName });
      return res.status(500).json({ error: 'Internal validation error' });
    }

    const { error, value } = schema.validate(req.body, {
      abortEarly: false,
      stripUnknown: true,
      allowUnknown: false
    });

    if (error) {
      const validationErrors = error.details.map(detail => ({
        field: detail.path.join('.'),
        message: detail.message,
        value: detail.context?.value
      }));

      logger.security('Request validation failed', {
        path: req.path,
        method: req.method,
        errors: validationErrors,
        ip: req.ip
      });

      return res.status(400).json({
        error: 'Validation failed',
        details: validationErrors
      });
    }

    // Replace req.body with validated and sanitized data
    req.body = value;
    next();
  };
}

// Query parameter validation
function validateQuery(schema) {
  return (req, res, next) => {
    const { error, value } = schema.validate(req.query, {
      abortEarly: false,
      stripUnknown: true
    });

    if (error) {
      const validationErrors = error.details.map(detail => ({
        field: detail.path.join('.'),
        message: detail.message
      }));

      logger.security('Query parameter validation failed', {
        path: req.path,
        method: req.method,
        errors: validationErrors,
        ip: req.ip
      });

      return res.status(400).json({
        error: 'Invalid query parameters',
        details: validationErrors
      });
    }

    req.query = value;
    next();
  };
}

// Common query schemas
const querySchemas = {
  pagination: Joi.object({
    page: Joi.number().integer().min(1).default(1),
    limit: Joi.number().integer().min(1).max(100).default(20)
  }),

  search: Joi.object({
    q: Joi.string().min(1).max(200).optional(),
    status: Joi.string().valid('TBR', 'Reading', 'Read', 'Finished', 'DNF', 'Archived').optional(),
    genre: Joi.string().optional(),
    author: Joi.string().optional()
  })
};

module.exports = {
  validateRequest,
  validateQuery,
  schemas,
  querySchemas
};