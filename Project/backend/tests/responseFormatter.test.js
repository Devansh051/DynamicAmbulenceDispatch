import { formatSuccess, formatError } from '../src/utils/responseFormatter.js';

describe('Response Formatter', () => {
  test('formatSuccess returns valid standardized success structure', () => {
    const payload = { id: 1, name: 'Suguna Hospital' };
    const res = formatSuccess(payload, { total: 1 });

    expect(res.success).toBe(true);
    expect(res.data).toEqual(payload);
    expect(res.meta).toBeDefined();
    expect(res.meta.total).toBe(1);
    expect(typeof res.meta.timestamp).toBe('string');
  });

  test('formatError returns valid standardized error structure', () => {
    const res = formatError('Invalid patient ID', 'VALIDATION_ERROR', { field: 'patientId' });

    expect(res.success).toBe(false);
    expect(res.error).toBeDefined();
    expect(res.error.code).toBe('VALIDATION_ERROR');
    expect(res.error.message).toBe('Invalid patient ID');
    expect(res.error.details).toEqual({ field: 'patientId' });
    expect(typeof res.timestamp).toBe('string');
  });
});
