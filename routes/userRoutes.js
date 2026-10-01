const router = require("express").Router();
const auth = require("../middleware/auth");
const { login, refreshToken, me } = require("../controllers/userController");

router.post("/login", login);
router.post("/refresh-token", refreshToken);
router.get("/me", auth, me);

module.exports = router;