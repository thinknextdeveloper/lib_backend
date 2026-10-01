const jwt = require("jsonwebtoken");

module.exports = (req, res, next) => {
  const header = req.headers.authorization || "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : null;

  if (!token) return res.status(401).json({ message: "Not authorized" });

  try {
    req.user = jwt.verify(token, process.env.JWT_SECRET); // { userName, collegeId, rightsLevel }
    next();
  } catch {
    // the frontend sees this 401 and calls /user/refresh-token
    return res.status(401).json({ message: "Token expired or invalid" });
  }
};