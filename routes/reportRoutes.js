const router = require("express").Router();
const auth = require("../middleware/auth");
const c = require("../controllers/reportController");

router.get("/student-issue", auth, c.studentIssue);
router.get("/staff-issue", auth, c.staffIssue);

module.exports = router;