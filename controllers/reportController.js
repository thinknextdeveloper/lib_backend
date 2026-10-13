// const { sql, withRetry } = require("../config/db"); // same helper as stockController

// const BOOK_SQL = `
//   SELECT CollegeName, IDNo,
//          (SELECT TOP 1 CAST(ClassRollNo AS VARCHAR) FROM Admissions WHERE idno = IR.idno) AS RollNo,
//          WhomIssued, Title, AccessionNo, IssueDate, LastReturnDate
//   FROM IssueRegister IR
//   WHERE CollegeName = @CollegeName AND Type = 'Student'
//   ORDER BY IDNo ASC`;

// const CD_SQL = `
//   SELECT CollegeName, IDNo,
//          (SELECT TOP 1 CAST(ClassRollNo AS VARCHAR) FROM Admissions WHERE idno = ICD.idno) AS RollNo,
//          WhomIssued, Title, SerialNo AS AccessionNo, IssueDate, ReturnDate AS LastReturnDate
//   FROM IssueRegisterCD ICD
//   WHERE CollegeName = @CollegeName AND Type = 'Student'
//   ORDER BY IDNo ASC`;

// // Legacy: Module1.GetCollegeAddress1 / GetCollegeAddress2.
// // I can't see which table those read, so this returns blanks until you fill it in.
// async function getCollegeAddress(/* pool, college */) {
//   return { address1: "", address2: "" };
// }

// exports.studentIssue = async (req, res) => {
//   try {
//     const { college, type } = req.query;
//     if (!college || college === "Select")
//       return res.status(400).json({ message: "Select College Name" });

//     const isCD = type === "CD";
//     const data = await withRetry(async (pool) => {
//       const rs = await pool
//         .request()
//         .input("CollegeName", sql.NVarChar, college)
//         .query(isCD ? CD_SQL : BOOK_SQL);
//       const addr = await getCollegeAddress(pool, college);
//       return { rows: rs.recordset, ...addr };
//     });

//     res.json({ college, type: isCD ? "CD" : "Book", ...data });
//   } catch (e) {
//     console.error(e);
//     res.status(500).json({ message: e.message || "Server error" });
//   }
// };


const { sql, withRetry } = require("../config/db"); // same helper as stockController

// ---------- Student ----------
const BOOK_SQL = `
  SELECT CollegeName, IDNo,
         (SELECT TOP 1 CAST(ClassRollNo AS VARCHAR) FROM Admissions WHERE idno = IR.idno) AS RollNo,
         WhomIssued, Title, AccessionNo, IssueDate, LastReturnDate
  FROM IssueRegister IR
  WHERE CollegeName = @CollegeName AND Type = 'Student'
  ORDER BY IDNo ASC`;

const CD_SQL = `
  SELECT CollegeName, IDNo,
         (SELECT TOP 1 CAST(ClassRollNo AS VARCHAR) FROM Admissions WHERE idno = ICD.idno) AS RollNo,
         WhomIssued, Title, SerialNo AS AccessionNo, IssueDate, ReturnDate AS LastReturnDate
  FROM IssueRegisterCD ICD
  WHERE CollegeName = @CollegeName AND Type = 'Student'
  ORDER BY IDNo ASC`;

// ---------- Staff / Faculty ----------
const STAFF_BOOK_SQL = `
  SELECT CollegeName, IDNo, WhomIssued, Title, AccessionNo, IssueDate, LastReturnDate
  FROM IssueRegister
  WHERE CollegeName = @CollegeName AND Type = 'Staff'
  ORDER BY IDNo ASC`;

const STAFF_CD_SQL = `
  SELECT CollegeName, IDNo, WhomIssued, Title, SerialNo AS AccessionNo,
         IssueDate, ReturnDate AS LastReturnDate
  FROM IssueRegisterCD
  WHERE CollegeName = @CollegeName AND Type = 'Staff'
  ORDER BY IDNo ASC`;

// Legacy: Module1.GetCollegeAddress1 / GetCollegeAddress2.
// I can't see which table those read, so this returns blanks until you fill it in.
async function getCollegeAddress(/* pool, college */) {
  return { address1: "", address2: "" };
}

// shared by both reports
async function runIssueReport(req, res, { bookSql, cdSql }) {
  try {
    const { college, type } = req.query;
    if (!college || college === "Select")
      return res.status(400).json({ message: "Select College Name" });

    const isCD = type === "CD";
    const data = await withRetry(async (pool) => {
      const rs = await pool
        .request()
        .input("CollegeName", sql.NVarChar, college)
        .query(isCD ? cdSql : bookSql);
      const addr = await getCollegeAddress(pool, college);
      return { rows: rs.recordset, ...addr };
    });

    res.json({ college, type: isCD ? "CD" : "Book", ...data });
  } catch (e) {
    console.error(e);
    res.status(500).json({ message: e.message || "Server error" });
  }
}

exports.studentIssue = (req, res) =>
  runIssueReport(req, res, { bookSql: BOOK_SQL, cdSql: CD_SQL });

exports.staffIssue = (req, res) =>
  runIssueReport(req, res, { bookSql: STAFF_BOOK_SQL, cdSql: STAFF_CD_SQL });