const router = require("express").Router();
const auth = require("../middleware/auth");
const { searchFacultyName } = require("../controllers/facultyController");

router.get("/search", auth, searchFacultyName);

module.exports = router;
