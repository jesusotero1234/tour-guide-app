import { Request, Response, NextFunction } from 'express';
import { ValidationChain, validationResult, body } from 'express-validator';
import { env } from '../config/env';
import { KokoroLanguage } from '../types/api';

export function validate(validations: ValidationChain[]) {
  return async (req: Request, res: Response, next: NextFunction) => {
    await Promise.all(validations.map(validation => validation.run(req)));

    const errors = validationResult(req);
    if (errors.isEmpty()) {
      return next();
    }

    return res.status(400).json({
      success: false,
      errors: errors.array().map(error => ({
        field: error.type === 'field' ? error.path : undefined,
        message: error.msg
      }))
    });
  };
}

/**
 * TTS request validation middleware
 */
export const validateTTSRequest = validate([
  body('text')
    .isString()
    .notEmpty()
    .withMessage('Text is required')
    .trim(),
  body('language')
    .optional()
    .isString()
    .notEmpty()
    .custom((value: string): boolean => 
      Object.keys(env.supportedLanguages).includes(value as KokoroLanguage)
    )
    .withMessage(`Language must be one of: ${Object.keys(env.supportedLanguages).join(', ')}`),
  body('voice')
    .optional()
    .isString()
    .notEmpty()
    .matches(/^[a-z]{1,2}[fm]_[a-z]+$/)
    .withMessage('Invalid voice format'),
  body('speed')
    .optional()
    .isFloat({ min: 0.5, max: 2.0 })
    .withMessage('Speed must be between 0.5 and 2.0')
    .toFloat(),
  body('format')
    .optional()
    .isIn(['wav', 'mp3'])
    .withMessage('Format must be either wav or mp3')
]);
