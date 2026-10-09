const router = require("express").Router();
const auth = require("../middleware/auth");
const {
  searchTitleAndAuthor,
  searchReferenceBooks,
} = require("../controllers/searchBooksController");

router.get("/title-author", auth, searchTitleAndAuthor);
router.get("/reference-books", auth, searchReferenceBooks);

module.exports = router;
