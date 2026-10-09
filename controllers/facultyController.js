const { withRetry } = require("../config/db");

// GET /api/faculty/search?facultyName=...&collegeName=...&isLeft=true/false
exports.searchFacultyName = async (req, res) => {
  try {
    const facultyName = String(req.query.facultyName || "").trim();
    const collegeName = String(req.query.collegeName || "").trim();
    const isLeft = String(req.query.isLeft || "").toLowerCase() === "true";

    if (!collegeName || collegeName === "Select") {
      return res.status(400).json({ success: false, message: "Select College Name" });
    }

    const pattern = `%${facultyName}%`;
    const tableName = isLeft ? "dbo.EmployeeLeft" : "dbo.Staff";

    const result = await withRetry((pool) =>
      pool
        .request()
        .input("CollegeName", collegeName)
        .input("NamePattern", pattern)
        .query(`
          SELECT 
            IDNo, 
            Name, 
            Designation, 
            FatherName, 
            MobileNo, 
            PermanentAddress 
          FROM ${tableName} 
          WHERE CollegeName = @CollegeName 
            AND Name LIKE @NamePattern
          ORDER BY Name ASC
        `)
    );

    const rows = result.recordset || [];
    if (rows.length === 0) {
      return res.json({
        success: true,
        data: [],
        message: isLeft
          ? "No left employee records found matching the search criteria."
          : "No faculty/staff records found matching the search criteria.",
      });
    }

    return res.json({
      success: true,
      data: rows,
      message: "",
    });
  } catch (err) {
    console.error("Error searching faculty name:", err.message);
    return res.status(500).json({ success: false, message: "Server error searching faculty records" });
  }
};
