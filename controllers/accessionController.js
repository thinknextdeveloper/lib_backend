const { withRetry } = require("../config/db");

// GET /api/accession/search?accessionNo=...&collegeName=...
exports.searchAccessionNo = async (req, res) => {
  try {
    const accessionNo = String(req.query.accessionNo || "").trim();
    const collegeName = String(req.query.collegeName || "").trim();

    if (!collegeName || collegeName === "Select") {
      return res.status(400).json({ success: false, message: "Select College Name" });
    }

    if (!accessionNo) {
      return res.status(400).json({ success: false, message: "Enter Accession No." });
    }

    const result = await withRetry((pool) =>
      pool
        .request()
        .input("AccessionNo", accessionNo)
        .input("CollegeName", collegeName)
        .query(`
          SELECT 
            CONVERT(varchar(20), TransactionDate, 111) AS TransactionDate, 
            CONVERT(varchar, TransactionTime, 108) AS TransactionTime, 
            TransactionName, 
            Title, 
            IDNo, 
            PersonName, 
            PersonType, 
            RenewalDate, 
            UserID 
          FROM dbo.Transactions 
          WHERE AccessionNo = @AccessionNo 
            AND CollegeName = @CollegeName 
          ORDER BY TransactionDate DESC
        `)
    );

    const rows = result.recordset || [];
    if (rows.length === 0) {
      return res.json({
        success: true,
        data: [],
        message: "No any transactions found against this Accession No.",
      });
    }

    return res.json({
      success: true,
      data: rows,
      message: "",
    });
  } catch (err) {
    console.error("Error searching accession no transactions:", err.message);
    return res.status(500).json({ success: false, message: "Server error searching accession details" });
  }
};
