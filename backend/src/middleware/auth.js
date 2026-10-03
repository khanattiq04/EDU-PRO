import { readToken } from '../services/auth.js';
import { one } from '../db.js';

export function auth(requiredRole) {
  return async (req, res, next) => {
    const token = req.headers.authorization?.replace(/^Bearer\s+/i, '');
    const session = readToken(token);
    if (!session || (requiredRole && session.role !== requiredRole)) {
      return res.status(401).json({ error: 'Authentication required' });
    }
    try {
      if (session.role === 'student') {
        const active = await one('SELECT session_id FROM student_sessions WHERE student_id = ?', [session.studentId]);
        if (!active || active.session_id !== session.sessionId) {
          return res.status(401).json({ error: 'Session ended because this account signed in on another device.' });
        }
      }
      req.session = session;
      next();
    } catch (error) {
      next(error);
    }
  };
}
