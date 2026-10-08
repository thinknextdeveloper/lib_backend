const { withRetry } = require("../config/db");

// GET /api/search-books/title-author?title=...&author=...&collegeName=...
exports.searchTitleAndAuthor = async (req, res) => {
  try {
    const title = String(req.query.title || "").trim();
    const author = String(req.query.author || "").trim();
    const collegeName = String(req.query.collegeName || "").trim();

    if (!collegeName || collegeName === "Select") {
      return res.status(400).json({ success: false, message: "Select College Name" });
    }

    const titlePattern = `%${title}%`;
    const authorPattern = `%${author}%`;

    // 1. Search Issued Books
    const issuedResult = await withRetry((pool) =>
      pool
        .request()
        .input("CollegeName", collegeName)
        .input("Title", titlePattern)
        .input("Author", authorPattern)
        .query(`
          SELECT 
            CONVERT(varchar(20), IssueRegister.IssueDate, 111) AS IssueDate,
            IssueRegister.AccessionNo,
            IssueRegister.Title,
            IssueRegister.IDNo,
            IssueRegister.WhomIssued,
            IssueRegister.Discipline,
            IssueRegister.Author,
            CONVERT(varchar(20), IssueRegister.LastReturnDate, 111) AS LastReturnDate,
            IssueRegister.Condition,
            StockRegister.Publisher,
            StockRegister.Edition,
            StockRegister.Year,
            StockRegister.Pages,
            StockRegister.Source,
            StockRegister.Type,
            StockRegister.Category,
            StockRegister.BillNo,
            CONVERT(varchar(20), StockRegister.BillDate, 111) AS BillDate,
            StockRegister.Price,
            StockRegister.ClassNo,
            StockRegister.BookNo,
            StockRegister.Location 
          FROM dbo.IssueRegister 
          INNER JOIN dbo.StockRegister 
            ON IssueRegister.CollegeName = StockRegister.CollegeName 
           AND IssueRegister.AccessionNo = StockRegister.AccessionNo 
          WHERE IssueRegister.CollegeName = @CollegeName 
            AND IssueRegister.Title LIKE @Title 
            AND IssueRegister.Author LIKE @Author
          ORDER BY IssueRegister.IssueDate DESC
        `)
    );

    // 2. Search UnIssued Books
    const unissuedResult = await withRetry((pool) =>
      pool
        .request()
        .input("CollegeName", collegeName)
        .input("Title", titlePattern)
        .input("Author", authorPattern)
        .query(`
          SELECT 
            StockRegister.AccessionNo, 
            StockRegister.Title, 
            StockRegister.Author, 
            StockRegister.Location, 
            StockRegister.Publisher, 
            StockRegister.Edition, 
            StockRegister.ClassNo, 
            StockRegister.BookNo 
          FROM dbo.StockRegister 
          WHERE StockRegister.CollegeName = @CollegeName 
            AND StockRegister.AccessionNo NOT IN (
              SELECT IssueRegister.AccessionNo 
              FROM dbo.IssueRegister 
              WHERE CollegeName = @CollegeName
            ) 
            AND StockRegister.Title LIKE @Title 
            AND StockRegister.Author LIKE @Author
          ORDER BY StockRegister.AccessionNo ASC
        `)
    );

    const issuedBooks = issuedResult.recordset || [];
    const unissuedBooks = unissuedResult.recordset || [];

    const hasRecords = issuedBooks.length > 0 || unissuedBooks.length > 0;

    return res.json({
      success: true,
      data: {
        issuedBooks,
        unissuedBooks,
        totalIssued: issuedBooks.length,
        totalUnissued: unissuedBooks.length,
      },
      message: hasRecords ? "" : "_No Record Found_",
    });
  } catch (err) {
    console.error("Error searching title and author books:", err.message);
    return res.status(500).json({ success: false, message: "Server error searching books" });
  }
};

// GET /api/search-books/reference-books?category=...&keyword=...&collegeName=...
exports.searchReferenceBooks = async (req, res) => {
  try {
    const category = String(req.query.category || "Title").trim();
    const keyword = String(req.query.keyword || "").trim();
    const collegeName = String(req.query.collegeName || "").trim();

    if (!collegeName || collegeName === "Select") {
      return res.status(400).json({ success: false, message: "Select College Name" });
    }
    if (!category || category === "Select") {
      return res.status(400).json({ success: false, message: "Select Category" });
    }

    const pattern = `%${keyword}%`;

    let sql = "";
    if (category.toLowerCase() === "title") {
      sql = `
        SELECT Title, AccessionNo, Author, Publisher, Edition, BookNo, Year, Type, Pages, Price, NetPrice, Location 
        FROM dbo.StockRegister 
        WHERE CollegeName = @CollegeName AND Title LIKE @Keyword AND Type = 'Reference'
        ORDER BY Title ASC
      `;
    } else if (category.toLowerCase() === "author") {
      sql = `
        SELECT Title, AccessionNo, Author, Publisher, Edition, BookNo, Year, Type, Pages, Price, NetPrice, Location 
        FROM dbo.StockRegister 
        WHERE CollegeName = @CollegeName AND Author LIKE @Keyword AND Type = 'Reference'
        ORDER BY Author ASC
      `;
    } else if (category.toLowerCase() === "publisher") {
      sql = `
        SELECT Title, AccessionNo, Author, Publisher, Edition, BookNo, Year, Type, Pages, Price, NetPrice, Location 
        FROM dbo.StockRegister 
        WHERE CollegeName = @CollegeName AND Publisher LIKE @Keyword AND Type = 'Reference'
        ORDER BY Publisher ASC
      `;
    } else if (category.toLowerCase() === "edition") {
      sql = `
        SELECT Title, AccessionNo, Author, Publisher, Edition, BookNo, Year, Type, Pages, Price, NetPrice, Location 
        FROM dbo.StockRegister 
        WHERE CollegeName = @CollegeName AND Edition LIKE @Keyword AND Type = 'Reference'
        ORDER BY Edition ASC
      `;
    } else {
      sql = `
        SELECT Title, AccessionNo, Author, Publisher, Edition, BookNo, Year, Type, Pages, Price, NetPrice, Location 
        FROM dbo.StockRegister 
        WHERE CollegeName = @CollegeName AND Title LIKE @Keyword AND Type = 'Reference'
        ORDER BY Title ASC
      `;
    }

    const result = await withRetry((pool) =>
      pool
        .request()
        .input("CollegeName", collegeName)
        .input("Keyword", pattern)
        .query(sql)
    );

    const rows = result.recordset || [];
    return res.json({
      success: true,
      data: rows,
      totalRecords: rows.length,
      message: rows.length > 0 ? "" : "_No Record Found_",
    });
  } catch (err) {
    console.error("Error searching reference books:", err.message);
    return res.status(500).json({ success: false, message: "Server error searching reference books" });
  }
};
