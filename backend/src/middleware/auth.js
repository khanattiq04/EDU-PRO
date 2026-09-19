import { readToken } from '../services/auth.js';

export function auth(requiredRole) {
  return (req, res, next) => {
    const token = req.headers.authorization?.replace(/^Bearer\s+/i, '');
    const session = readToken(token);
    if (!session || (requiredRole && session.role !== requiredRole)) {
      return res.status(401).json({ error: 'Authentication required' });
    }
    req.session = session;
    next();
  };
}
