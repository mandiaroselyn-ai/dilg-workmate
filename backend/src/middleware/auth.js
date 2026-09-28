import { User } from '../models/User.js';
import { verifyAuthToken } from '../utils/authToken.js';

const authenticationFailure = (res, error) => res
  .set('X-Authentication-Error', 'true')
  .status(401)
  .json({ success: false, error });

export const authenticate = async (req, res, next) => {
  try {
    const authorization = req.headers.authorization || '';
    const token = authorization.startsWith('Bearer ') ? authorization.slice(7) : null;
    const claims = verifyAuthToken(token);
    if (!claims?.email) return authenticationFailure(res, 'Authentication required.');

    const currentUser = await User.findByEmail(claims.email);
    if (!currentUser || (currentUser.accountStatus && currentUser.accountStatus.toLowerCase() !== 'active')) {
      return authenticationFailure(res, 'Authentication expired or account is inactive.');
    }

    req.user = currentUser;
    next();
  } catch (error) {
    return authenticationFailure(res, 'Invalid authentication token.');
  }
};

export const authorizeRoles = (...allowedRoles) => (req, res, next) => {
  const role = req.user?.accessLevel || 'employee';
  if (allowedRoles.includes(role)) return next();
  return res.status(403).json({ success: false, error: 'You do not have permission to perform this action.' });
};

export const authorizeSupervisor = authorizeRoles('supervisor', 'hr_admin');
export const requireAdmin = authorizeRoles('hr_admin');
