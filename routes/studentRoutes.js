const router = require("express").Router();
const auth = require("../middleware/auth");
const { searchStudentName } = require("../controllers/studentController");

router.get("/search", auth, searchStudentName);

module.exports = router;
