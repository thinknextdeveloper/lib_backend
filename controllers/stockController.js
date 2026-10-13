const { sql, withRetry } = require("../config/db"); // adjust to your db helper

const clean = (v) =>
  v === undefined || v === null || String(v).trim() === "" ? null : String(v).trim();
const num = (v) => {
  const n = parseFloat(v);
  return Number.isFinite(n) ? n : 0;
};
const fail = (res, e) => {
  console.error(e);
  res.status(500).json({ message: e.message || "Server error" });
};

// whitelists (column names are interpolated, so never accept them raw)
const SUGGEST_COLUMNS = {
  title: "Title",
  firstForename: "FirstAuthorForeName",
  secondForename: "SecondAuthorForeName",
  thirdForename: "ThirdAuthorForeName",
  firstSurname: "FirstAuthorSirName",
  secondSurname: "SecondAuthorSirName",
  thirdSurname: "ThirdAuthorSirName",
  place: "Place",
};
const MASTER = {
  publisher: { table: "Publishers", column: "Publisher" },
  source: { table: "SourceBooks", column: "Source" },
  category: { table: "Categories", column: "Category" },
};

const NEXT_ACCESSION_SQL = `
  SELECT ISNULL(MAX(TRY_CAST(AccessionNo AS BIGINT)), 0) + 1 AS Next
  FROM StockRegister WHERE CollegeName = @CollegeName`;

const INSERT_SQL = `
  INSERT INTO StockRegister
   (CollegeName, DateEntry, AccessionNo, Author, Title, Edition, Publisher, Year, Pages,
    Source, Price, Discount, NetPrice, Type, Category, BillNo, BillDate, ClassNo, BookNo,
    Remarks, Location, FirstAuthorForeName, FirstAuthorSirName, SecondAuthorForeName,
    SecondAuthorSirName, ThirdAuthorForeName, ThirdAuthorSirName, MoreThanThreeAuthors,
    SubTitle, ISBN, Place, Series, BookSize, Subject1, Subject2, BindingBook, Attachment, Volume)
  VALUES
   (@CollegeName, @DateEntry, @AccessionNo, @Author, @Title, @Edition, @Publisher, @Year, @Pages,
    @Source, @Price, @Discount, @NetPrice, @Type, @Category, @BillNo, @BillDate, @ClassNo, @BookNo,
    @Remarks, @Location, @FirstAuthorForeName, @FirstAuthorSirName, @SecondAuthorForeName,
    @SecondAuthorSirName, @ThirdAuthorForeName, @ThirdAuthorSirName, @MoreThanThreeAuthors,
    @SubTitle, @ISBN, @Place, @Series, @BookSize, @Subject1, @Subject2, @BindingBook, @Attachment, @Volume)`;

const UPDATE_SQL = `
  UPDATE StockRegister SET
    BindingBook=@BindingBook, DateEntry=@DateEntry, Author=@Author, Title=@Title, Edition=@Edition,
    Publisher=@Publisher, Year=@Year, Pages=@Pages, Source=@Source, Price=@Price, Discount=@Discount,
    NetPrice=@NetPrice, Type=@Type, Category=@Category, BillNo=@BillNo, BillDate=@BillDate,
    ClassNo=@ClassNo, BookNo=@BookNo, Remarks=@Remarks, FirstAuthorForeName=@FirstAuthorForeName,
    FirstAuthorSirName=@FirstAuthorSirName, SecondAuthorForeName=@SecondAuthorForeName,
    SecondAuthorSirName=@SecondAuthorSirName, ThirdAuthorForeName=@ThirdAuthorForeName,
    ThirdAuthorSirName=@ThirdAuthorSirName, MoreThanThreeAuthors=@MoreThanThreeAuthors,
    SubTitle=@SubTitle, ISBN=@ISBN, Place=@Place, Series=@Series, BookSize=@BookSize,
    Subject1=@Subject1, Subject2=@Subject2, Location=@Location, Volume=@Volume, Attachment=@Attachment
  WHERE CollegeName=@CollegeName AND AccessionNo=@AccessionNo`;

function validate(b) {
  if (!clean(b.collegeName) || b.collegeName === "Select") return "Select College Name";
  if (!clean(b.accessionNo)) return "Invalid Accession No.";
  if (!clean(b.title)) return "Enter Title";
  if (!clean(b.publisher) || b.publisher === "Select") return "Select Publisher";
  if (!clean(b.source) || b.source === "Select") return "Select Source";
  if (!clean(b.edition)) return "Enter Edition";
  if (!clean(b.quantity)) return "Enter Quantity";
  if (!clean(b.price)) return "Enter Price";
  if (!clean(b.type) || b.type === "Select") return "Select Type";
  if (!clean(b.category) || b.category === "Select") return "Select Category";
  return null;
}

// binds every column except AccessionNo-specific logic
function bindBook(r, b, accessionNo) {
  const price = num(b.price);
  const discount = num(b.discount);
  const net = price - price * (discount / 100);

  r.input("CollegeName", sql.NVarChar, b.collegeName);
  r.input("DateEntry", sql.DateTime, b.dateEntry ? new Date(b.dateEntry) : new Date());
  r.input("AccessionNo", sql.BigInt, accessionNo);
  r.input("Author", sql.NVarChar, clean(b.author) || "None");
  r.input("Title", sql.NVarChar, b.title.trim());
  r.input("Edition", sql.NVarChar, clean(b.edition));
  r.input("Publisher", sql.NVarChar, b.publisher);
  r.input("Year", sql.NVarChar, clean(b.year));
  r.input("Pages", sql.NVarChar, clean(b.pages));
  r.input("Source", sql.NVarChar, b.source);
  r.input("Price", sql.Float, price);
  r.input("Discount", sql.Float, discount);
  r.input("NetPrice", sql.Float, net);
  r.input("Type", sql.NVarChar, b.type);
  r.input("Category", sql.NVarChar, clean(b.category) || "None");
  r.input("BillNo", sql.NVarChar, clean(b.billNo));
  r.input("BillDate", sql.DateTime, b.billDate ? new Date(b.billDate) : null);
  r.input("ClassNo", sql.NVarChar, clean(b.classNo));
  r.input("BookNo", sql.NVarChar, clean(b.bookNo));
  r.input("Remarks", sql.NVarChar, clean(b.remarks));
  r.input("Location", sql.NVarChar, b.location ?? "");
  r.input("FirstAuthorForeName", sql.NVarChar, b.firstForename ?? "");
  r.input("FirstAuthorSirName", sql.NVarChar, clean(b.firstSurname));
  r.input("SecondAuthorForeName", sql.NVarChar, clean(b.secondForename));
  r.input("SecondAuthorSirName", sql.NVarChar, clean(b.secondSurname));
  r.input("ThirdAuthorForeName", sql.NVarChar, clean(b.thirdForename));
  r.input("ThirdAuthorSirName", sql.NVarChar, clean(b.thirdSurname));
  r.input("MoreThanThreeAuthors", sql.NVarChar, b.andOthers ? "True" : "False");
  r.input("SubTitle", sql.NVarChar, clean(b.subtitle));
  r.input("ISBN", sql.NVarChar, clean(b.isbn));
  r.input("Place", sql.NVarChar, clean(b.place));
  r.input("Series", sql.NVarChar, clean(b.series));
  r.input("BookSize", sql.NVarChar, clean(b.size));
  r.input("Subject1", sql.NVarChar, clean(b.subject1));
  r.input("Subject2", sql.NVarChar, clean(b.subject2));
  r.input("BindingBook", sql.NVarChar, b.binding ?? "");
  r.input("Attachment", sql.NVarChar, clean(b.attachment));
  r.input("Volume", sql.NVarChar, clean(b.volume));
  return r;
}

// ---------- lookups ----------
exports.getColleges = async (req, res) => {
  try {
    const rs = await withRetry((pool) =>
      pool.request().query(`
        SELECT CollegeName FROM (
          SELECT DISTINCT CollegeName FROM StockRegister
          UNION SELECT DISTINCT CollegeName FROM Publishers
          UNION SELECT DISTINCT CollegeName FROM SourceBooks
          UNION SELECT DISTINCT CollegeName FROM Categories
        ) t
        WHERE CollegeName IS NOT NULL AND LTRIM(RTRIM(CollegeName)) <> ''
        ORDER BY CollegeName
      `)
    );
    res.json(rs.recordset.map((r) => r.CollegeName));
  } catch (e) {
    fail(res, e);
  }
};

exports.getLookups = async (req, res) => {
  try {
    const { college } = req.query;
    if (!college) return res.status(400).json({ message: "Select College Name" });
    const out = {};
    await withRetry(async (pool) => {
      for (const [key, m] of Object.entries(MASTER)) {
        const rs = await pool
          .request()
          .input("CollegeName", sql.NVarChar, college)
          .query(
            `SELECT DISTINCT ${m.column} AS v FROM ${m.table}
             WHERE CollegeName=@CollegeName ORDER BY ${m.column}`
          );
        out[key + "s"] = rs.recordset.map((r) => r.v).filter(Boolean);
      }
    });
    // keys: publishers, sources, categorys -> normalise
    res.json({
      publishers: out.publishers || [],
      sources: out.sources || [],
      categories: out.categorys || [],
    });
  } catch (e) {
    fail(res, e);
  }
};

exports.nextAccession = async (req, res) => {
  try {
    const { college } = req.query;
    if (!college) return res.status(400).json({ message: "Select College Name" });
    const rs = await withRetry((pool) =>
      pool.request().input("CollegeName", sql.NVarChar, college).query(NEXT_ACCESSION_SQL)
    );
    res.json({ next: Number(rs.recordset[0].Next) });
  } catch (e) {
    fail(res, e);
  }
};

exports.suggest = async (req, res) => {
  try {
    const { college, field, q } = req.query;
    const col = SUGGEST_COLUMNS[field];
    if (!col || !college || !q) return res.json({ items: [] });
    const rs = await withRetry((pool) =>
      pool
        .request()
        .input("CollegeName", sql.NVarChar, college)
        .input("q", sql.NVarChar, `%${String(q).trim()}%`)
        .query(
          `SELECT DISTINCT TOP 15 ${col} AS v FROM StockRegister
           WHERE CollegeName=@CollegeName AND ${col} LIKE @q AND ${col} IS NOT NULL
           ORDER BY ${col}`
        )
    );
    res.json({ items: rs.recordset.map((r) => r.v) });
  } catch (e) {
    fail(res, e);
  }
};

exports.getByAccession = async (req, res) => {
  try {
    const { college, accessionNo } = req.query;
    if (!college || !accessionNo)
      return res.status(400).json({ message: "College and Accession No. required" });
    const rs = await withRetry((pool) =>
      pool
        .request()
        .input("CollegeName", sql.NVarChar, college)
        .input("AccessionNo", sql.BigInt, accessionNo)
        .query(`SELECT * FROM StockRegister WHERE CollegeName=@CollegeName AND AccessionNo=@AccessionNo`)
    );
    if (!rs.recordset.length) return res.status(404).json({ message: "Accession No. not found" });
    res.json(rs.recordset[0]);
  } catch (e) {
    fail(res, e);
  }
};

// ---------- add ----------
exports.addBooks = async (req, res) => {
  try {
    const b = req.body;
    const err = validate(b);
    if (err) return res.status(400).json({ message: err });

    const qty = parseInt(b.quantity, 10);
    const start = parseInt(b.accessionNo, 10);
    if (!(qty > 0) || !(start > 0))
      return res.status(400).json({ message: "Invalid Quantity or Accession No." });

    const result = await withRetry(async (pool) => {
      const dup = await pool
        .request()
        .input("CollegeName", sql.NVarChar, b.collegeName)
        .input("s", sql.BigInt, start)
        .input("e", sql.BigInt, start + qty - 1)
        .query(
          `SELECT AccessionNo FROM StockRegister
           WHERE CollegeName=@CollegeName AND TRY_CAST(AccessionNo AS BIGINT) BETWEEN @s AND @e`
        );
      if (dup.recordset.length) return { duplicates: dup.recordset.map((r) => r.AccessionNo) };

      const tx = new sql.Transaction(pool);
      await tx.begin();
      try {
        for (let i = 0; i < qty; i++) {
          const r = bindBook(new sql.Request(tx), b, start + i);
          await r.query(INSERT_SQL);
        }
        await tx.commit();
      } catch (e) {
        await tx.rollback();
        throw e;
      }
      return { duplicates: [] };
    });

    if (result.duplicates.length)
      return res.status(409).json({
        message: `${result.duplicates.join(", ")} — these Accession No. already exist. Please enter another Accession No.`,
      });

    res.status(201).json({ message: "Added Successfully", from: start, to: start + qty - 1 });
  } catch (e) {
    fail(res, e);
  }
};

// ---------- update ----------
exports.updateBook = async (req, res) => {
  try {
    const b = { ...req.body, accessionNo: req.params.accessionNo };
    const err = validate(b);
    if (err) return res.status(400).json({ message: err });

    const rs = await withRetry((pool) =>
      bindBook(pool.request(), b, parseInt(b.accessionNo, 10)).query(UPDATE_SQL)
    );
    if (!rs.rowsAffected[0]) return res.status(404).json({ message: "Accession No. not found" });
    res.json({ message: "Updated Successfully" });
  } catch (e) {
    fail(res, e);
  }
};

// ---------- write off ----------
exports.addWriteOff = async (req, res) => {
  try {
    const { collegeName, accessionNo, title } = req.body;
    if (!clean(collegeName) || collegeName === "Select")
      return res.status(400).json({ message: "Select College Name" });
    if (!clean(accessionNo)) return res.status(400).json({ message: "Invalid Accession No." });
    if (!clean(title)) return res.status(400).json({ message: "Enter Title" });

    const exists = await withRetry(async (pool) => {
      const chk = await pool
        .request()
        .input("CollegeName", sql.NVarChar, collegeName)
        .input("AccessionNo", sql.BigInt, accessionNo)
        .query(`SELECT 1 AS x FROM Rightofbooks WHERE CollegeName=@CollegeName AND AccessionNo=@AccessionNo`);
      if (chk.recordset.length) return true;
      await pool
        .request()
        .input("CollegeName", sql.NVarChar, collegeName)
        .input("AccessionNo", sql.BigInt, accessionNo)
        .input("Title", sql.NVarChar, title)
        .query(`INSERT INTO Rightofbooks (CollegeName, AccessionNo, Title) VALUES (@CollegeName, @AccessionNo, @Title)`);
      return false;
    });

    if (exists)
      return res.status(409).json({ message: "Accession No. already exists in Write off" });
    res.status(201).json({ message: "Added to Write off Successfully" });
  } catch (e) {
    fail(res, e);
  }
};

// ---------- publisher / source / category ----------
exports.addMaster = async (req, res) => {
  try {
    const { type, value, collegeName } = req.body;
    const m = MASTER[type];
    if (!m) return res.status(400).json({ message: "Invalid type" });
    if (!clean(collegeName) || collegeName === "Select")
      return res.status(400).json({ message: "Select College Name" });
    if (!clean(value)) return res.status(400).json({ message: `Enter ${m.column}` });

    const exists = await withRetry(async (pool) => {
      const chk = await pool
        .request()
        .input("CollegeName", sql.NVarChar, collegeName)
        .input("v", sql.NVarChar, value.trim())
        .query(`SELECT 1 AS x FROM ${m.table} WHERE CollegeName=@CollegeName AND ${m.column}=@v`);
      if (chk.recordset.length) return true;
      await pool
        .request()
        .input("CollegeName", sql.NVarChar, collegeName)
        .input("v", sql.NVarChar, value.trim())
        .query(`INSERT INTO ${m.table} (${m.column}, CollegeName) VALUES (@v, @CollegeName)`);
      return false;
    });

    if (exists) return res.status(409).json({ message: `${m.column} already exists` });
    res.status(201).json({ message: `${m.column} added` });
  } catch (e) {
    fail(res, e);
  }
};