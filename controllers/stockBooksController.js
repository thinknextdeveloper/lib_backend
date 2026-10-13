const { withRetry } = require("../config/db");

// 1. GET /api/stock-books/list?collegeName=... (For frmstatusstockbooks)
exports.getStockOfBooks = async (req, res) => {
  try {
    const collegeName = String(req.query.collegeName || "").trim();

    if (!collegeName || collegeName === "Select") {
      return res.status(400).json({ success: false, message: "Select College Name" });
    }

    // Ultra-fast single batch query with NOLOCK
    const result = await withRetry((pool) =>
      pool
        .request()
        .input("CollegeName", collegeName)
        .query(`
          SET NOCOUNT ON;

          -- 1. Main Stock Records (37 columns)
          SELECT 
            CONVERT(varchar(20), DateEntry, 103) AS DateEntry,
            AccessionNo,
            Title,
            Author,
            Edition,
            Publisher,
            Year,
            Pages,
            Volume,
            Source,
            Price,
            NetPrice,
            Discount,
            Type,
            Category,
            BillNo,
            ClassNo,
            CONVERT(varchar(20), BillDate, 103) AS BillDate,
            BookNo,
            Remarks,
            Location,
            FirstName,
            SirName,
            FirstAuthorForeName,
            FirstAuthorSirName,
            SecondAuthorForeName,
            SecondAuthorSirName,
            ThirdAuthorForeName,
            ThirdAuthorSirName,
            MoreThanThreeAuthors,
            SubTitle,
            ISBN,
            Place,
            Series,
            BookSize,
            Subject1,
            Subject2 
          FROM dbo.StockRegister WITH (NOLOCK)
          WHERE CollegeName = @CollegeName 
          ORDER BY AccessionNo ASC;

          -- 2. Stats Counts
          SELECT 
            (SELECT COUNT(1) FROM dbo.StockRegister WITH (NOLOCK) WHERE CollegeName = @CollegeName) AS totalBooks,
            (SELECT COUNT(1) FROM (SELECT Title, Author FROM dbo.StockRegister WITH (NOLOCK) WHERE CollegeName = @CollegeName GROUP BY Title, Author) AS t) AS totalTitles,
            (SELECT COUNT(1) FROM dbo.IssueRegister WITH (NOLOCK) WHERE CollegeName = @CollegeName) AS totalIssued;
        `)
    );

    const books = result.recordsets?.[0] || [];
    const statsRow = result.recordsets?.[1]?.[0] || {};

    const totalBooks = statsRow.totalBooks != null ? Number(statsRow.totalBooks) : books.length;
    const totalTitles = statsRow.totalTitles != null ? Number(statsRow.totalTitles) : 0;
    const totalIssued = statsRow.totalIssued != null ? Number(statsRow.totalIssued) : 0;
    const totalUnissued = Math.max(0, totalBooks - totalIssued);

    return res.json({
      success: true,
      data: {
        books,
        totalBooks,
        totalTitles,
        totalUnissued,
      },
      message: books.length > 0 ? "" : "_No Record Found_",
    });
  } catch (err) {
    console.error("Error fetching stock of books:", err.message);
    return res.status(500).json({ success: false, message: "Server error fetching stock books" });
  }
};

// 2. GET /api/stock-books/issued-list?collegeName=... (For frmstatusissueregister)
exports.getIssuedBooks = async (req, res) => {
  try {
    const collegeName = String(req.query.collegeName || "").trim();

    if (!collegeName || collegeName === "Select") {
      return res.status(400).json({ success: false, message: "Select College Name" });
    }

    // Ultra-fast single batch query with NOLOCK
    const result = await withRetry((pool) =>
      pool
        .request()
        .input("CollegeName", collegeName)
        .query(`
          SET NOCOUNT ON;

          -- 1. Main Issued Books Records from IssueRegister
          SELECT 
            CONVERT(varchar(20), IssueDate, 102) AS IssueDate,
            IDNo,
            WhomIssued,
            Discipline,
            AccessionNo,
            Title,
            Author,
            LastReturnDate,
            Condition,
            Type,
            Category,
            ReceiveDate,
            Remarks,
            CollegeName,
            Signature,
            UserID,
            IssueTime
          FROM dbo.IssueRegister WITH (NOLOCK)
          WHERE CollegeName = @CollegeName 
          ORDER BY IssueTime DESC;

          -- 2. Stats Counts
          SELECT 
            (SELECT COUNT(1) FROM dbo.StockRegister WITH (NOLOCK) WHERE CollegeName = @CollegeName) AS totalBooks,
            (SELECT COUNT(1) FROM dbo.IssueRegister WITH (NOLOCK) WHERE CollegeName = @CollegeName) AS totalIssuedBooks;
        `)
    );

    const books = result.recordsets?.[0] || [];
    const statsRow = result.recordsets?.[1]?.[0] || {};

    const totalBooks = statsRow.totalBooks != null ? Number(statsRow.totalBooks) : 0;
    const totalIssuedBooks = statsRow.totalIssuedBooks != null ? Number(statsRow.totalIssuedBooks) : books.length;
    const totalUnissuedBooks = Math.max(0, totalBooks - totalIssuedBooks);

    return res.json({
      success: true,
      data: {
        books,
        totalBooks,
        totalIssuedBooks,
        totalUnissuedBooks,
      },
      message: books.length > 0 ? "" : "_No Record Found_",
    });
  } catch (err) {
    console.error("Error fetching issued books status:", err.message);
    return res.status(500).json({ success: false, message: "Server error fetching issued books" });
  }
};

// 3. GET /api/stock-books/reference-list?collegeName=... (For frmstatusreferencebooks)
exports.getReferenceBooks = async (req, res) => {
  try {
    const collegeName = String(req.query.collegeName || "").trim();

    if (!collegeName || collegeName === "Select") {
      return res.status(400).json({ success: false, message: "Select College Name" });
    }

    // Ultra-fast single batch query with NOLOCK
    const result = await withRetry((pool) =>
      pool
        .request()
        .input("CollegeName", collegeName)
        .query(`
          SET NOCOUNT ON;

         
          SELECT 
            CONVERT(varchar(20), DateEntry, 103) AS DateEntry,
            AccessionNo,
            Title,
            Author,
            Edition,
            Publisher,
            Year,
            Pages,
            Volume,
            Source,
            Price,
            NetPrice,
            Discount,
            Type,
            Category,
            BillNo,
            ClassNo,
            CONVERT(varchar(20), BillDate, 103) AS BillDate,
            BookNo,
            Remarks,
            Location,
            FirstName,
            SirName,
            FirstAuthorForeName,
            FirstAuthorSirName,
            SecondAuthorForeName,
            SecondAuthorSirName,
            ThirdAuthorForeName,
            ThirdAuthorSirName,
            MoreThanThreeAuthors,
            SubTitle,
            ISBN,
            Place,
            Series,
            BookSize,
            Subject1,
            Subject2 
          FROM dbo.StockRegister WITH (NOLOCK)
          WHERE CollegeName = @CollegeName AND Type = 'Reference'
          ORDER BY AccessionNo ASC;

          -- 2. Total Reference Books Count
          SELECT COUNT(1) AS totalRefBooks
          FROM dbo.StockRegister WITH (NOLOCK)
          WHERE CollegeName = @CollegeName AND Type = 'Reference';
        `)
    );

    const books = result.recordsets?.[0] || [];
    const statsRow = result.recordsets?.[1]?.[0] || {};
    const totalRefBooks = statsRow.totalRefBooks != null ? Number(statsRow.totalRefBooks) : books.length;

    return res.json({
      success: true,
      data: {
        books,
        totalRefBooks,
      },
      message: books.length > 0 ? "" : "_No Record Found_",
    });
  } catch (err) {
    console.error("Error fetching reference books status:", err.message);
    return res.status(500).json({ success: false, message: "Server error fetching reference books" });
  }
};
