const router = require("express").Router();
const auth = require("../middleware/auth");
const { getMenu } = require("../controllers/menuController");

router.get("/", auth, getMenu);

module.exports = router;