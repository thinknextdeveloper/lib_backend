const router = require("express").Router();
const auth = require("../middleware/auth");
const { searchAccessionNo } = require("../controllers/accessionController");

router.get("/search", auth, searchAccessionNo);

module.exports = router;
