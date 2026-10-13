const router = require("express").Router();
const auth = require("../middleware/auth");
const { getStockOfBooks, getIssuedBooks, getReferenceBooks } = require("../controllers/stockBooksController");

router.get("/list", auth, getStockOfBooks);
router.get("/issued-list", auth, getIssuedBooks);
router.get("/reference-list", auth, getReferenceBooks);

module.exports = router;
