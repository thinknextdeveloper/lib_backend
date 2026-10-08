const router = require("express").Router();
const auth = require("../middleware/auth");
const {
  getColleges,
  getMaxSrNo,
  getDemandBooksList,
  addDemandBook,
  getPublishers,
  addPublisher,
  deletePublisher,
  replacePublisher,
} = require("../controllers/demandBooksController");

router.get("/colleges", auth, getColleges);
router.get("/max-srno", auth, getMaxSrNo);
router.get("/list", auth, getDemandBooksList);
router.post("/", auth, addDemandBook);
router.get("/publishers", auth, getPublishers);
router.post("/publishers", auth, addPublisher);
router.delete("/publishers", auth, deletePublisher);
router.put("/publishers/replace", auth, replacePublisher);

module.exports = router;
