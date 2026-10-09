const { sql, withRetry } = require("../config/db");

const APPLICATION_NAME = "Library";

const pad = (n) => String(n).padStart(2, "0");

const todayISO = () => {
  const d = new Date();
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
};

// DB date -> "YYYY-MM-DD"
const toISODate = (v) => (v instanceof Date && !isNaN(v) ? v.toISOString().slice(0, 10) : null);

const isValidISODate = (s) => {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
  const d = new Date(`${s}T00:00:00Z`);
  return !isNaN(d) && d.toISOString().slice(0, 10) === s;
};

// colleges this user is assigned to (UserMaster rows for the Library app)
const getAssignedColleges = async (pool, user) => {
  const r = await pool
    .request()
    .input("userName", user.userName)
    .input("loginType", user.loginType)
    .input("applicationName", APPLICATION_NAME)
    .query(`
      SELECT DISTINCT CollegeName
      FROM dbo.UserMaster
      WHERE UserName = @userName
        AND LoginType = @loginType
        AND ApplicationName = @applicationName
        AND CollegeName IS NOT NULL
      ORDER BY CollegeName
    `);
  return r.recordset.map((x) => String(x.CollegeName).trim());
};

// the signature is the logged-in user's password (same as the .NET checksignature)
const checkSignature = async (pool, user, signature) => {
  const r = await pool
    .request()
    .input("userName", user.userName)
    .input("loginType", user.loginType)
    .input("applicationName", APPLICATION_NAME)
    .query(`
      SELECT Password
      FROM dbo.UserMaster
      WHERE UserName = @userName
        AND LoginType = @loginType
        AND ApplicationName = @applicationName
    `);
  return r.recordset.some((row) => String(row.Password ?? "").trim() === signature);
};

// the issue record for this accession no. (the currently issued copy comes first)
const findIssue = async (pool, collegeName, accessionNo) => {
  const r = await pool
    .request()
    .input("accessionNo", sql.BigInt, Number(accessionNo))
    .input("collegeName", collegeName)
    .query(`
      SELECT TOP (1) WhomIssued, IDNo, Title, IssueDate, LastReturnDate, ReceiveDate,
             CollegeName, Type, AccessionNo, Discipline
      FROM dbo.IssueRegister
      WHERE AccessionNo = @accessionNo AND CollegeName = @collegeName
      ORDER BY CASE WHEN ReceiveDate IS NULL THEN 0 ELSE 1 END, IssueDate DESC
    `);
  return r.recordset[0] || null;
};

// course/batch (student) or designation/department (staff)
const getPerson = async (pool, idNo) => {
  const isStaff = idNo.length === 6;
  let course = "";
  let batch = "";

  try {
    const r = await pool
      .request()
      .input("idNo", idNo)
      .query(
        isStaff
          ? "SELECT TOP (1) Designation AS a, Department AS b FROM dbo.Staff WHERE IDNo = @idNo"
          : "SELECT TOP (1) Course AS a, Batch AS b FROM dbo.Admissions WHERE IDNo = @idNo"
      );
    const row = r.recordset[0];
    if (row) {
      course = String(row.a ?? "");
      batch = String(row.b ?? "");
    }
  } catch (err) {
    console.error("Person detail lookup failed:", err.message);
  }

  return { isStaff, course, batch };
};

// same rule as the .NET showphoto: 10-digit ID -> Admissions, otherwise Staff
const getPhoto = async (pool, idNo) => {
  try {
    const table = idNo.length === 10 ? "Admissions" : "Staff";
    const r = await pool
      .request()
      .input("idNo", idNo)
      .query(`SELECT TOP (1) Snap FROM dbo.${table} WHERE IDNo = @idNo`);
    const snap = r.recordset[0]?.Snap;
    return Buffer.isBuffer(snap) && snap.length
      ? `data:image/jpeg;base64,${snap.toString("base64")}`
      : null;
  } catch (err) {
    console.error("Photo lookup failed:", err.message);
    return null;
  }
};

// GET /api/renew/init
exports.init = async (req, res) => {
  try {
    if (!req.user.loginType) return res.status(401).json({ message: "Please login again" });

    const colleges = await withRetry((pool) => getAssignedColleges(pool, req.user));

    res.json({
      data: {
        colleges,
        renewDays: Number(process.env.BOOK_ISSUE_DAYS || 15),
        accessionLength: Number(process.env.ACCESSION_LENGTH || 0),
      },
    });
  } catch (err) {
    console.error(err.message);
    res.status(500).json({ message: "Server error" });
  }
};

// GET /api/renew/lookup?collegeName=...&accessionNo=...
exports.lookup = async (req, res) => {
  try {
    const accessionNo = String(req.query.accessionNo || "").trim();
    const collegeName = String(req.query.collegeName || "").trim();

    if (!/^\d{1,15}$/.test(accessionNo))
      return res.status(400).json({ message: "Enter a valid Accession No." });

    const out = await withRetry(async (pool) => {
      const colleges = await getAssignedColleges(pool, req.user);
      if (!colleges.includes(collegeName)) return { status: 403, message: "Select College Name" };

      const row = await findIssue(pool, collegeName, accessionNo);
      if (!row) return { status: 404, message: "Accession No. does not exist" };
      if (row.ReceiveDate) return { status: 409, message: "This book is not currently issued" };

      const idNo = String(row.IDNo ?? "").trim();
      const person = await getPerson(pool, idNo);
      const photo = await getPhoto(pool, idNo);

      return {
        status: 200,
        data: {
          issue: {
            collegeName: String(row.CollegeName ?? "").trim(),
            accessionNo: String(row.AccessionNo),
            name: String(row.WhomIssued ?? ""),
            idNo,
            title: String(row.Title ?? ""),
            issueDate: toISODate(row.IssueDate),
            lastReturnDate: toISODate(row.LastReturnDate),
            position: String(row.Discipline ?? ""),
            type: String(row.Type ?? ""),
          },
          person,
          photo,
        },
      };
    });

    if (out.status !== 200) return res.status(out.status).json({ message: out.message });
    res.json({ data: out.data });
  } catch (err) {
    console.error(err.message);
    res.status(500).json({ message: "Server error" });
  }
};

// POST /api/renew   body: { collegeName, accessionNo, signature, renewDate: "YYYY-MM-DD" }
exports.renew = async (req, res) => {
  try {
    const collegeName = String(req.body.collegeName || "").trim();
    const accessionNo = String(req.body.accessionNo || "").trim();
    const signature = String(req.body.signature || "");
    const renewDate = String(req.body.renewDate || "");

    if (!accessionNo) return res.status(400).json({ message: "Enter Accession No." });
    if (!/^\d{1,15}$/.test(accessionNo))
      return res.status(400).json({ message: "Enter a valid Accession No." });
    if (!signature) return res.status(400).json({ message: "Enter Signature" });
    if (!isValidISODate(renewDate))
      return res.status(400).json({ message: "Select a valid Renew Date" });
    if (renewDate < todayISO())
      return res.status(400).json({ message: "Renew Date can't be before today" });

    const out = await withRetry(async (pool) => {
      const colleges = await getAssignedColleges(pool, req.user);
      if (!colleges.includes(collegeName)) return { status: 403, message: "Select College Name" };

      const issue = await findIssue(pool, collegeName, accessionNo);
      if (!issue) return { status: 404, message: "Accession No. does not exist" };
      if (issue.ReceiveDate) return { status: 409, message: "This book is not currently issued" };

      const lastReturn = toISODate(issue.LastReturnDate);
      if (lastReturn && lastReturn < todayISO())
        return { status: 400, message: "Can't Renew the Book Because Last Return Date is Over" };

      if (!(await checkSignature(pool, req.user, signature)))
        return { status: 400, message: "Signature doesn't match" };

      // same string formats the .NET code wrote into Transactions
      const now = new Date();
      const [y, m, d] = renewDate.split("-");
      const transactionDate = `${pad(now.getMonth() + 1)}/${pad(now.getDate())}/${now.getFullYear()}`;
      const transactionTime =
        `${pad(now.getMonth() + 1)}/${pad(now.getDate())}/${String(now.getFullYear()).slice(2)} ` +
        `${pad(now.getHours())}:${pad(now.getMinutes())}:${pad(now.getSeconds())}`;

      const tx = new sql.Transaction(pool);
      await tx.begin();

      try {
        const upd = await new sql.Request(tx)
          .input("lastReturnDate", sql.DateTime, new Date(`${renewDate}T00:00:00Z`))
          .input("accessionNo", sql.BigInt, Number(accessionNo))
          .input("collegeName", collegeName)
          .query(`
            UPDATE dbo.IssueRegister
            SET LastReturnDate = @lastReturnDate
            WHERE AccessionNo = @accessionNo
              AND CollegeName = @collegeName
              AND ReceiveDate IS NULL
          `);

        if (!upd.rowsAffected[0]) {
          await tx.rollback();
          return { status: 409, message: "This book is not currently issued" };
        }

        // next id = MAX(id) + 1, locked so two renewals can't take the same id
        await new sql.Request(tx)
          .input("collegeName", collegeName)
          .input("transactionDate", transactionDate)
          .input("transactionTime", transactionTime)
          .input("accessionNo", accessionNo)
          .input("title", String(issue.Title ?? ""))
          .input("idNo", String(issue.IDNo ?? "").trim())
          .input("personName", String(issue.WhomIssued ?? ""))
          .input("personType", String(issue.Type ?? ""))
          .input("renewalDate", `${d}/${m}/${y}`)
          .input("userId", String(req.user.userName))
          .input("userName", String(req.user.userName))
          .query(`
            INSERT INTO dbo.Transactions
              (id, CollegeName, TransactionDate, TransactionTime, TransactionName, Type,
               AccessionNo, Title, IDNo, PersonName, PersonType, RenewalDate, UserID, UserName)
            SELECT ISNULL(MAX(id), 0) + 1, @collegeName, @transactionDate, @transactionTime,
                   'Renew', 'Book', @accessionNo, @title, @idNo, @personName, @personType,
                   @renewalDate, @userId, @userName
            FROM dbo.Transactions WITH (UPDLOCK, HOLDLOCK)
          `);

        await tx.commit();
      } catch (err) {
        try {
          await tx.rollback();
        } catch (e) {}
        throw err;
      }

      return { status: 200 };
    });

    if (out.status !== 200) return res.status(out.status).json({ message: out.message });

    res.json({ message: "Renewed Successfully", data: { lastReturnDate: renewDate } });
  } catch (err) {
    console.error(err.message);
    res.status(500).json({ message: "Server error" });
  }
};