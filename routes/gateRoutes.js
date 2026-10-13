const router = require("express").Router();
const auth = require("../middleware/auth");
const c = require("../controllers/gateController");

router.post("/scan", auth, c.scan);
router.get("/entries", auth, c.entries);

module.exports = router;