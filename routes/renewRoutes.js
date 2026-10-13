const router = require("express").Router();
const auth = require("../middleware/auth");
const { init, lookup, renew } = require("../controllers/renewController");

router.use(auth);

router.get("/init", init);
router.get("/lookup", lookup);
router.post("/", renew);

module.exports = router;