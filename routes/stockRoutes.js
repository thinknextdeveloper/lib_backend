const router = require("express").Router();
const auth = require("../middleware/auth"); // your JWT middleware
const c = require("../controllers/stockController");

router.use(auth);

router.get("/colleges", c.getColleges);
router.get("/lookups", c.getLookups);            // publishers, sources, categories
router.get("/next-accession", c.nextAccession);
router.get("/suggest", c.suggest);               // autocomplete
router.get("/by-accession", c.getByAccession);   // Enter in Accession No.
router.post("/", c.addBooks);
router.put("/:accessionNo", c.updateBook);
router.post("/write-off", c.addWriteOff);
router.post("/master", c.addMaster);             // the "..." buttons

module.exports = router;