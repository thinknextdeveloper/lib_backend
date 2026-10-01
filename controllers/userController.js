const jwt = require("jsonwebtoken");
const { withRetry } = require("../config/db");

// Only users of this application may log in
const APPLICATION_NAME = "Library";

const signTokens = (u) => ({
  accessToken: jwt.sign(
    {
      userName: u.UserName,
      collegeId: u.collegeId,
      rightsLevel: u.RightsLevel,
      loginType: u.LoginType,
    },
    process.env.JWT_SECRET,
    { expiresIn: "15m" }
  ),
  refreshToken: jwt.sign(
    {
      userName: u.UserName,
      collegeId: u.collegeId,
      loginType: u.LoginType,
    },
    process.env.JWT_REFRESH_SECRET,
    { expiresIn: "7d" }
  ),
});

const publicUser = (u) => ({
  userName: u.UserName,
  collegeId: u.collegeId,
  collegeName: u.CollegeName,
  applicationName: u.ApplicationName,
  rightsLevel: u.RightsLevel,
  loginType: u.LoginType,
});

exports.login = async (req, res) => {
  try {
    const userName = String(req.body.userName || "").trim();
    const password = String(req.body.password || "");
    const type = String(req.body.type || "").trim();

    if (!userName || !password || !type) {
      return res.status(400).json({
        message: "Username, password and type are required",
      });
    }

    const result = await withRetry((pool) =>
      pool
        .request()
        .input("userName", userName)
        .input("applicationName", APPLICATION_NAME)
        .query(`
          SELECT 
            UserName,
            Password,
            LoginType,
            ApplicationName,
            CollegeName,
            RightsLevel
          FROM dbo.UserMaster
          WHERE UserName = @userName
            AND ApplicationName = @applicationName
          ORDER BY ApplicationName
        `)
    );

    // User not found
    if (!result.recordset || result.recordset.length === 0) {
      return res.status(404).json({
        message: "User not found",
      });
    }

    // Check LoginType
    const user = result.recordset.find(
      (r) =>
        String(r.LoginType ?? "").trim().toLowerCase() ===
        type.toLowerCase()
    );

    // User exists but selected type is wrong
    if (!user) {
      return res.status(401).json({
        message: "Invalid login type",
      });
    }

    // Check password
    if (String(user.Password ?? "").trim() !== password) {
      return res.status(401).json({
        message: "Wrong password",
      });
    }

    // Login successful
    return res.json({
      message: "Login successful",
      data: {
        user: publicUser(user),
        ...signTokens(user),
      },
    });
  } catch (err) {
    console.error(err.message);

    return res.status(500).json({
      message: "Server error",
    });
  }
};

// POST /api/user/refresh-token   body: { refreshToken }
exports.refreshToken = async (req, res) => {
  try {
    const decoded = jwt.verify(
      req.body.refreshToken,
      process.env.JWT_REFRESH_SECRET
    );

    // refresh tokens issued before loginType was added must login again
    if (!decoded.loginType) {
      return res.status(401).json({ message: "Please login again" });
    }

    const result = await withRetry((pool) =>
      pool
        .request()
        .input("userName", decoded.userName)
        .input("collegeId", decoded.collegeId ?? null)
        .input("loginType", decoded.loginType)
        .input("applicationName", APPLICATION_NAME)
        .query(`
          SELECT TOP (1) UserName, RightsLevel, collegeId, LoginType
          FROM dbo.UserMaster
          WHERE UserName = @userName
            AND LoginType = @loginType
            AND (collegeId = @collegeId OR (collegeId IS NULL AND @collegeId IS NULL))
            AND ApplicationName = @applicationName
        `)
    );

    const user = result.recordset[0];
    if (!user) return res.status(401).json({ message: "User not found" });

    res.json({ data: { accessToken: signTokens(user).accessToken } });
  } catch {
    res.status(401).json({ message: "Invalid refresh token" });
  }
};

// GET /api/user/me   (needs Authorization: Bearer <accessToken>)
exports.me = (req, res) => {
  res.json({ data: req.user });
};