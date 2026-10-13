const { sql, withRetry } = require("../config/db");

const isDigits = (s) => /^\d+$/.test(String(s || "").trim());
const isDate = (s) => /^\d{4}-\d{2}-\d{2}$/.test(String(s || ""));

// Legacy showimage(): 10-digit IDs are students (Admissions), 6-digit IDs are staff (Staff)
async function getSnap(pool, idNo) {
  const id = String(idNo || "").trim();
  const table = id.length === 10 ? "Admissions" : id.length === 6 ? "Staff" : null;
  if (!table) return null;

  const rs = await pool
    .request()
    .input("IDNo", sql.NVarChar, id)
    .query(`SELECT TOP 1 Snap FROM ${table} WHERE IDNo = @IDNo`);

  const snap = rs.recordset[0]?.Snap;
  if (!snap) return null;
  return `data:image/jpeg;base64,${Buffer.from(snap).toString("base64")}`;
}

// POST /api/gate/scan  { accessionNo }
// Looks up the book, finds who has it, and logs a gate entry if it is issued.
exports.scan = async (req, res) => {
  try {
    const accessionNo = String(req.body.accessionNo || "").trim();
    if (!isDigits(accessionNo))
      return res.status(400).json({ message: "Enter Accession No." });

    const data = await withRetry(async (pool) => {
      const stock = await pool
        .request()
        .input("AccessionNo", sql.BigInt, accessionNo)
        .query(
          `SELECT TOP 1 AccessionNo, CollegeName, Title, Author, Category, Location
           FROM StockRegister WHERE AccessionNo = @AccessionNo`
        );
      if (!stock.recordset.length) return { found: false };

      const book = stock.recordset[0];

      // legacy looked up IssueRegister by AccessionNo only; filtering by the
      // book's college as well avoids picking up another college's copy
      const issueRs = await pool
        .request()
        .input("AccessionNo", sql.BigInt, accessionNo)
        .input("CollegeName", sql.NVarChar, book.CollegeName)
        .query(
          `SELECT TOP 1 CONVERT(varchar(10), IssueDate, 103) AS IssueDate,
                  WhomIssued, IDNo, Discipline,
                  CONVERT(varchar(10), LastReturnDate, 103) AS LastReturnDate
           FROM IssueRegister
           WHERE AccessionNo = @AccessionNo AND CollegeName = @CollegeName`
        );
      if (!issueRs.recordset.length) return { found: true, book, issue: null };

      const issue = issueRs.recordset[0];
      const image = await getSnap(pool, issue.IDNo);

      // legacy SaveData(): one gate entry per scan, Purpose = Issue, GateEntry = IN
      await pool
        .request()
        .input("CollegeName", sql.NVarChar, book.CollegeName)
        .input("IDNo", sql.NVarChar, String(issue.IDNo))
        .input("PersonName", sql.NVarChar, issue.WhomIssued)
        .input("AccessionNo", sql.BigInt, book.AccessionNo)
        .query(
          `INSERT INTO LibGateEntries
             (CollegeName, DateEntry, TransactionTime, IDNo, PersonName, AccessionNo, Purpose, GateEntry)
           VALUES
             (@CollegeName, CONVERT(date, GETDATE()), GETDATE(), @IDNo, @PersonName, @AccessionNo, 'Issue', 'IN')`
        );

      return { found: true, book, issue, image, saved: true };
    });

    res.json(data);
  } catch (e) {
    console.error(e);
    res.status(500).json({ message: e.message || "Server error" });
  }
};

// GET /api/gate/entries?from=YYYY-MM-DD&to=YYYY-MM-DD&idNo=&accessionNo=
// No dates -> today's entries (legacy getdetail)
exports.entries = async (req, res) => {
  try {
    const { from, to, idNo, accessionNo } = req.query;

    const rows = await withRetry(async (pool) => {
      const r = pool.request();
      let where;
      if (isDate(from) && isDate(to)) {
        where = "CAST(DateEntry AS DATE) BETWEEN CONVERT(date, @From, 23) AND CONVERT(date, @To, 23)";
        r.input("From", sql.VarChar(10), from);
        r.input("To", sql.VarChar(10), to);
      } else {
        where = "CAST(DateEntry AS DATE) = CAST(GETDATE() AS DATE)";
      }

      if (isDigits(idNo)) {
        where += " AND CAST(IDNo AS VARCHAR(50)) = @IDNo";
        r.input("IDNo", sql.VarChar(50), String(idNo).trim());
      }
      if (isDigits(accessionNo)) {
        where += " AND CAST(AccessionNo AS VARCHAR(50)) = @AccessionNo";
        r.input("AccessionNo", sql.VarChar(50), String(accessionNo).trim());
      }

      const rs = await r.query(
        `SELECT TOP 1000
                CONVERT(varchar(10), DateEntry, 103) AS DateEntry,
                CONVERT(varchar(8), TransactionTime, 108) AS Time,
                IDNo, PersonName, AccessionNo, Purpose, GateEntry
         FROM LibGateEntries
         WHERE ${where}
         ORDER BY TransactionTime DESC`
      );
      return rs.recordset;
    });

    res.json({ rows });
  } catch (e) {
    console.error(e);
    res.status(500).json({ message: e.message || "Server error" });
  }
};