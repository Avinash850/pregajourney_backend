import jwt from "jsonwebtoken";

const authMiddleware = (req, res, next) => {
  try {
    let token = req.headers.authorization;

    if (!token)
      return res.status(401).json({ success: false, message: "No token provided" });

    // Authorization header format: "Bearer <token>"
    if (token.startsWith("Bearer ")) {
      token = token.split(" ")[1];
    }

    // Verify token
    const decoded = jwt.verify(token, process.env.JWT_SECRET);

    req.user = { id: decoded.id }; // Attach user ID to request

    next(); // Continue to controller
  } catch (error) {
    console.error("Auth Error:", error);
    return res.status(401).json({ success: false, message: "Invalid or expired token" });
  }
};

export default authMiddleware;
