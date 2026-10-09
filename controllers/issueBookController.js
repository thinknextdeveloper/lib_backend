// controllers/issueBookController.js
// Port of legacy VB.NET frmBackIssueBook.
// ASSUMPTIONS (adjust to your project):
//   - ../config/db exports { sql, withRetry } and withRetry(async (pool) => ...) hands you a connected mssql pool
//   - JWT middleware sets req.user = { userName, loginName, colleges?: string[] }
const { sql, withRetry } = require("../config/db");

const DEFAULT_DAYS = {
  Student: Number(process.env.STUDENT_ISSUE_DAYS || 15), // StudBookIssueDays
  Staff: Number(process.env.STAFF_ISSUE_DAYS || 30), // StaffBookIssueDays
};

// ---------- helpers ----------
const httpError = (status, message, code) => Object.assign(new Error(message), { status, code });

const wrap = (fn) => async (req, res) => {
  try {
    await fn(req, res);
  } catch (e) {
    if (!e.status) console.error("[issueBook]", e);
    res
      .status(e.status || 500)
      .json({ message: e.status ? e.message : "Server error", code: e.code });
  }
};

// GetAssignedCollegeName1
async function assignedColleges(pool, req) {
  if (Array.isArray(req.user?.colleges) && req.user.colleges.length) return req.user.colleges;
  const r = await pool.request().query("SELECT DISTINCT CollegeName FROM MasterIssueLimit");
  return r.recordset.map((x) => x.CollegeName);
}

// builds "@c0,@c1,..." and binds the values (IN (NULL) matches nothing)
function inClause(request, values) {
  if (!values.length) return "NULL";
  return values
    .map((v, i) => {
      request.input(`c${i}`, sql.NVarChar, v);
      return `@c${i}`;
    })
    .join(",");
}

async function findPerson(pool, req, type, idNo) {
  const colleges = await assignedColleges(pool, req);
  const rq = pool.request().input("idNo", sql.VarChar, idNo);
  const list = inClause(rq, colleges);

  // Staff: Designation + Department, Student: Course + Batch (same as the Renew page)
  const q =
    type === "Staff"
      ? `SELECT CollegeName, Snap, Name AS PersonName, Designation AS Course, Department AS Batch
         FROM Staff WHERE IDNO=@idNo AND CollegeName IN (${list})`
      : `SELECT CollegeName, Snap, StudentName AS PersonName, Course, Batch
         FROM Admissions WHERE IDNO=@idNo AND CollegeName IN (${list})`;

  const { recordset } = await rq.query(q);
  const r = recordset[0];
  if (!r) return null;

  return {
    type,
    collegeName: r.CollegeName,
    name: r.PersonName || "",
    course: r.Course || "",
    batch: r.Batch || "",
    univRollNo: "", // add your roll-no column here if you have one
    photo: r.Snap ? `data:image/jpeg;base64,${Buffer.from(r.Snap).toString("base64")}` : null,
  };
}

async function findBook(pool, req, accessionNo) {
  const colleges = await assignedColleges(pool, req);
  const rq = pool.request().input("acc", sql.VarChar, accessionNo);
  const list = inClause(rq, colleges);
  const { recordset } = await rq.query(
    `SELECT CollegeName, Title, Author, Category FROM StockRegister
     WHERE AccessionNo=@acc AND CollegeName IN (${list})`
  );
  const r = recordset[0];
  if (!r) return null;
  return {
    collegeName: r.CollegeName,
    accessionNo,
    title: r.Title || "",
    author: r.Author || "",
    category: r.Category || "",
  };
}

// "Already Book Issued" grid + total fine
async function loadIssued(pool, idNo) {
  const { recordset } = await pool.request().input("idNo", sql.VarChar, idNo).query(`
    SELECT r.CollegeName, CONVERT(varchar(10), r.IssueDate, 103) AS IssueDate, r.IDNo, r.Title, r.Author,
           r.AccessionNo, CONVERT(varchar(10), r.LastReturnDate, 103) AS LastReturnDate,
           r.Discipline, r.Remarks, r.WhomIssued, r.Type,
           CASE WHEN DATEDIFF(day, r.LastReturnDate, GETDATE()) > 0
                THEN DATEDIFF(day, r.LastReturnDate, GETDATE()) ELSE 0 END AS Days,
           CASE WHEN DATEDIFF(day, r.LastReturnDate, GETDATE()) > 0
                THEN DATEDIFF(day, r.LastReturnDate, GETDATE()) * ISNULL(f.FinePerDay, 0) ELSE 0 END AS Fine
    FROM IssueRegister r
    LEFT JOIN MasterFine f ON f.CollegeName = r.CollegeName
    WHERE r.IDNo = @idNo
    ORDER BY r.IssueDate DESC`);

  const issued = recordset.map((r) => ({
    collegeName: r.CollegeName,
    issueDate: r.IssueDate,
    idNo: r.IDNo,
    title: r.Title || "",
    author: r.Author || "",
    accessionNo: r.AccessionNo,
    lastReturnDate: r.LastReturnDate,
    course: r.Discipline || "",
    remarks: r.Remarks || "",
    whomIssued: r.WhomIssued || "",
    type: r.Type || "",
    days: Number(r.Days) || 0,
    fine: Number(r.Fine) || 0,
  }));

  return { issued, totalFine: issued.reduce((s, r) => s + r.fine, 0) };
}

// replace with the same check your Renew controller uses if it differs
async function checkSignature(pool, req, signature) {
  const r = await pool
    .request()
    .input("u", sql.VarChar, req.user.userName)
    .input("p", sql.VarChar, signature)
    .query("SELECT 1 AS ok FROM UserMaster WHERE UserName=@u AND Password=@p");
  return r.recordset.length > 0;
}

// Transactions log row (Issue / Return). Runs inside the caller's transaction.
async function insertTransaction(tx, req, t) {
  const { recordset } = await new sql.Request(tx).query(
    "SELECT ISNULL(MAX(ID), 0) + 1 AS id FROM Transactions WITH (UPDLOCK, HOLDLOCK)"
  );
  await new sql.Request(tx)
    .input("id", sql.BigInt, recordset[0].id)
    .input("college", sql.NVarChar, t.collegeName)
    .input("tdate", sql.Date, new Date())
    .input("ttime", sql.DateTime, new Date())
    .input("tname", sql.VarChar, t.name) // Issue | Return
    .input("type", sql.VarChar, "Book")
    .input("acc", sql.VarChar, t.accessionNo)
    .input("title", sql.NVarChar, t.title)
    .input("idNo", sql.VarChar, t.idNo)
    .input("person", sql.NVarChar, t.personName)
    .input("ptype", sql.VarChar, t.personType)
    .input("uid", sql.VarChar, req.user.userName)
    .input("uname", sql.VarChar, req.user.loginName)
    .query(`INSERT INTO Transactions
      (ID, CollegeName, TransactionDate, TransactionTime, TransactionName, Type, AccessionNo, Title, IDNo,
       PersonName, PersonType, UserID, UserName)
      VALUES (@id, @college, @tdate, @ttime, @tname, @type, @acc, @title, @idNo, @person, @ptype, @uid, @uname)`);
}

const startOfToday = () => {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
};

// ---------- handlers ----------

// GET /api/issue-book/init
exports.init = wrap(async (req, res) => {
  const colleges = await withRetry((pool) => assignedColleges(pool, req));
  res.json({
    colleges,
    studentDays: DEFAULT_DAYS.Student,
    staffDays: DEFAULT_DAYS.Staff,
  });
});

// GET /api/issue-book/person?type=Student|Staff&idNo=...
exports.person = wrap(async (req, res) => {
  const { type, idNo } = req.query;
  if (!["Student", "Staff"].includes(type) || !idNo) throw httpError(400, "Invalid ID No.");

  const out = await withRetry(async (pool) => {
    const person = await findPerson(pool, req, type, String(idNo));
    if (!person) return null;
    return { person, ...(await loadIssued(pool, String(idNo))) };
  });

  if (!out) throw httpError(404, "Invalid ID No.");
  res.json(out);
});

// GET /api/issue-book/book?accessionNo=...
exports.book = wrap(async (req, res) => {
  const { accessionNo } = req.query;
  if (!accessionNo) throw httpError(400, "Enter Accession No.");
  const book = await withRetry((pool) => findBook(pool, req, String(accessionNo)));
  if (!book) throw httpError(404, "Invalid Accession No.");
  res.json(book);
});

// POST /api/issue-book/issue
exports.issue = wrap(async (req, res) => {
  const { type, idNo, accessionNo, lastReturnDate, remarks, signature, force } = req.body;

  if (!["Student", "Staff"].includes(type)) throw httpError(400, "Select Category");
  if (!idNo) throw httpError(400, "Enter ID No.");
  if (!accessionNo) throw httpError(400, "Enter Accession No.");

  const ret = new Date(lastReturnDate);
  if (Number.isNaN(ret.getTime()) || ret < startOfToday())
    throw httpError(400, "Return Date can not less than Date of Issue.");

  const out = await withRetry(async (pool) => {
    const person = await findPerson(pool, req, type, String(idNo));
    if (!person) throw httpError(400, "Invalid ID No.");

    const book = await findBook(pool, req, String(accessionNo));
    if (!book) throw httpError(400, "Invalid Accession No.");

    if (!(await checkSignature(pool, req, signature || "")))
      throw httpError(400, "Signature doesn't match");

    const dup = await pool
      .request()
      .input("acc", sql.VarChar, String(accessionNo))
      .input("college", sql.NVarChar, person.collegeName)
      .query("SELECT 1 AS x FROM IssueRegister WHERE AccessionNo=@acc AND CollegeName=@college");
    if (dup.recordset.length) throw httpError(400, "This Book is already Issued");

    // issue limit (UI asks for confirmation, then resends with force=true)
    const lim = await pool
      .request()
      .input("college", sql.NVarChar, person.collegeName)
      .input("ptype", sql.VarChar, type)
      .query("SELECT IssueLimit FROM MasterIssueLimit WHERE CollegeName=@college AND PersonType=@ptype");
    const cnt = await pool
      .request()
      .input("idNo", sql.VarChar, String(idNo))
      .query("SELECT COUNT(*) AS n FROM IssueRegister WHERE IDNo=@idNo");

    if (lim.recordset.length && !force && cnt.recordset[0].n >= Number(lim.recordset[0].IssueLimit))
      throw httpError(
        409,
        "Maximum issue Book limit is Crossed. Do you want to issue this Book?",
        "LIMIT_REACHED"
      );

    const tx = new sql.Transaction(pool);
    await tx.begin();
    try {
      await new sql.Request(tx)
        .input("college", sql.NVarChar, person.collegeName)
        .input("idNo", sql.VarChar, String(idNo))
        .input("title", sql.NVarChar, book.title || null)
        .input("author", sql.NVarChar, book.author || null)
        .input("acc", sql.VarChar, String(accessionNo))
        .input("whom", sql.NVarChar, person.name || null)
        .input("ret", sql.Date, ret)
        .input("disc", sql.NVarChar, person.course || null)
        .input("type", sql.VarChar, type)
        .input("cat", sql.NVarChar, book.category || null)
        .input("rem", sql.NVarChar, remarks || null)
        .input("uid", sql.VarChar, req.user.userName)
        .query(`INSERT INTO IssueRegister
          (CollegeName, IssueDate, IDNo, Title, Author, AccessionNo, WhomIssued, LastReturnDate,
           Discipline, Type, Category, Remarks, UserID)
          VALUES (@college, CAST(GETDATE() AS date), @idNo, @title, @author, @acc, @whom, @ret,
                  @disc, @type, @cat, @rem, @uid)`);

      await insertTransaction(tx, req, {
        name: "Issue",
        collegeName: person.collegeName,
        accessionNo: String(accessionNo),
        title: book.title,
        idNo: String(idNo),
        personName: person.name,
        personType: type,
      });

      await tx.commit();
    } catch (e) {
      await tx.rollback();
      throw e;
    }

    return loadIssued(pool, String(idNo));
  });

  res.json({ message: "Issued Successfully", ...out });
});

// POST /api/issue-book/return
exports.returnBook = wrap(async (req, res) => {
  const { idNo, accessionNo, collegeName } = req.body;
  if (!idNo || !accessionNo || !collegeName) throw httpError(400, "Select a book to return");

  const out = await withRetry(async (pool) => {
    const found = await pool
      .request()
      .input("idNo", sql.VarChar, String(idNo))
      .input("acc", sql.VarChar, String(accessionNo))
      .input("college", sql.NVarChar, collegeName)
      .query(
        `SELECT Title, WhomIssued, Type FROM IssueRegister
         WHERE IDNo=@idNo AND AccessionNo=@acc AND CollegeName=@college`
      );
    const row = found.recordset[0];
    if (!row) throw httpError(404, "Book is not issued");

    const tx = new sql.Transaction(pool);
    await tx.begin();
    try {
      await new sql.Request(tx)
        .input("idNo", sql.VarChar, String(idNo))
        .input("acc", sql.VarChar, String(accessionNo))
        .input("college", sql.NVarChar, collegeName)
        .query("DELETE FROM IssueRegister WHERE IDNo=@idNo AND AccessionNo=@acc AND CollegeName=@college");

      await insertTransaction(tx, req, {
        name: "Return",
        collegeName,
        accessionNo: String(accessionNo),
        title: row.Title,
        idNo: String(idNo),
        personName: row.WhomIssued,
        personType: row.Type,
      });

      await tx.commit();
    } catch (e) {
      await tx.rollback();
      throw e;
    }

    return loadIssued(pool, String(idNo));
  });

  res.json({ message: "Book returned Successfully", ...out });
});