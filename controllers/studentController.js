const { withRetry } = require("../config/db");

// GET /api/student/search?studentName=...&collegeName=...
exports.searchStudentName = async (req, res) => {
  try {
    const studentName = String(req.query.studentName || "").trim();
    const collegeName = String(req.query.collegeName || "").trim();

    if (!collegeName || collegeName === "Select") {
      return res.status(400).json({ success: false, message: "Select College Name" });
    }

    const pattern = `%${studentName}%`;

    const result = await withRetry((pool) =>
      pool
        .request()
        .input("CollegeName", collegeName)
        .input("StudentNamePattern", pattern)
        .query(`
          SELECT 
            StudentName AS [Student Name],
            IDNo AS [ID No],
            Course,
            ClassRollNo AS [Class Roll No],
            FatherName AS [Father Name],
            PermanentAddress AS [Permanent Address],
            PhoneNo 
          FROM dbo.Admissions 
          WHERE CollegeName = @CollegeName 
            AND StudentName LIKE @StudentNamePattern
          ORDER BY StudentName ASC
        `)
    );

    const rows = result.recordset || [];
    if (rows.length === 0) {
      return res.json({
        success: true,
        data: [],
        message: "No students found matching the search criteria.",
      });
    }

    return res.json({
      success: true,
      data: rows,
      message: "",
    });
  } catch (err) {
    console.error("Error searching student name:", err.message);
    return res.status(500).json({ success: false, message: "Server error searching student records" });
  }
};
