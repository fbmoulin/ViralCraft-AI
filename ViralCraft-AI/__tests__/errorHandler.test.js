const { createError, handleAsync } = require('../utils/error-handler');

describe('error-handler utilities', () => {
  describe('createError', () => {
    it('produces an Error with statusCode and details', () => {
      const err = createError('boom', 418, { foo: 'bar' });
      expect(err).toBeInstanceOf(Error);
      expect(err.message).toBe('boom');
      expect(err.statusCode).toBe(418);
      expect(err.details).toEqual({ foo: 'bar' });
    });

    it('defaults statusCode to 500 and details to null', () => {
      const err = createError('boom');
      expect(err.statusCode).toBe(500);
      expect(err.details).toBeNull();
    });
  });

  describe('handleAsync', () => {
    it('forwards resolved values without calling next', async () => {
      const handler = handleAsync(async (req, res) => {
        res.sentValue = 'ok';
      });
      const next = jest.fn();
      const res = {};
      await handler({}, res, next);
      expect(res.sentValue).toBe('ok');
      expect(next).not.toHaveBeenCalled();
    });

    it('forwards rejected errors to next', async () => {
      const boom = new Error('async failure');
      const handler = handleAsync(async () => {
        throw boom;
      });
      const next = jest.fn();
      await handler({}, {}, next);
      expect(next).toHaveBeenCalledWith(boom);
    });
  });
});
