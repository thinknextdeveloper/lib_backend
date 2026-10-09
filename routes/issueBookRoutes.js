// routes/issueBookRoutes.js
const router = require("express").Router();
const auth = require("../middleware/auth"); // your JWT middleware (adjust path/name)
const c = require("../controllers/issueBookController");

router.use(auth);

router.get("/init", c.init);
router.get("/person", c.person);
router.get("/book", c.book);
router.post("/issue", c.issue);
router.post("/return", c.returnBook);

module.exports = router;

// in server.js / app.js:
//   