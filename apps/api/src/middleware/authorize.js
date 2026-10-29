/**
 * Middleware factory to authorize requests based on user role.
 * @param {...string} roles - Allowed roles (e.g., 'ADMIN', 'PURCHASING', 'SUPPLIER')
 */
export const authorize = (...roles) => {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({ message: 'Unauthorized: Not authenticated.' });
    }

    if (!roles.includes(req.user.role)) {
      return res.status(403).json({
        message: `Forbidden: Role '${req.user.role}' does not have access to this resource.`,
      });
    }

    next();
  };
};
