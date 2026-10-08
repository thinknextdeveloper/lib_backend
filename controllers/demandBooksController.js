const { withRetry } = require("../config/db");

// GET /api/demand-books/colleges
exports.getColleges = async (req, res) => {
  try {
    const { userName, collegeName } = req.user || {};

    let userColleges = [];
    if (userName) {
      const userRes = await withRetry((pool) =>
        pool
          .request()
          .input("userName", String(userName).trim())
          .query(`
            SELECT DISTINCT CollegeName 
            FROM dbo.UserMaster 
            WHERE LTRIM(RTRIM(CAST(UserName AS VARCHAR(100)))) = @userName
              AND CollegeName IS NOT NULL
              AND RTRIM(LTRIM(CAST(CollegeName AS VARCHAR(200)))) <> ''
          `)
      );
      userColleges = (userRes.recordset || [])
        .map((r) => String(r.CollegeName || "").trim())
        .filter(Boolean);
    }

    if (collegeName && !userColleges.includes(String(collegeName).trim())) {
      userColleges.push(String(collegeName).trim());
    }

    let colleges = [];
    if (userColleges.length > 0) {
      const courseRes = await withRetry((pool) => {
        const request = pool.request();
        const paramNames = userColleges.map((c, i) => {
          const param = `col_${i}`;
          request.input(param, c);
          return `@${param}`;
        });
        return request.query(`
          SELECT DISTINCT CollegeName 
          FROM dbo.MasterCourse 
          WHERE CollegeName IN (${paramNames.join(",")})
          ORDER BY CollegeName ASC
        `);
      });
      colleges = courseRes.recordset
        .map((r) => String(r.CollegeName || "").trim())
        .filter(Boolean);
    }

    // If no match in MasterCourse for these user colleges, use userColleges directly
    if (colleges.length === 0 && userColleges.length > 0) {
      colleges = userColleges;
    }

    // Fallback 1: Query all distinct colleges from MasterCourse
    if (colleges.length === 0) {
      const fallbackRes = await withRetry((pool) =>
        pool.request().query(`
          SELECT DISTINCT CollegeName 
          FROM dbo.MasterCourse 
          WHERE CollegeName IS NOT NULL AND RTRIM(LTRIM(CAST(CollegeName AS VARCHAR(200)))) <> ''
          ORDER BY CollegeName ASC
        `)
      );
      colleges = fallbackRes.recordset
        .map((r) => String(r.CollegeName || "").trim())
        .filter(Boolean);
    }

    // Fallback 2: Query all distinct colleges from UserMaster
    if (colleges.length === 0) {
      const fallbackUserRes = await withRetry((pool) =>
        pool.request().query(`
          SELECT DISTINCT CollegeName 
          FROM dbo.UserMaster 
          WHERE CollegeName IS NOT NULL AND RTRIM(LTRIM(CAST(CollegeName AS VARCHAR(200)))) <> ''
          ORDER BY CollegeName ASC
        `)
      );
      colleges = fallbackUserRes.recordset
        .map((r) => String(r.CollegeName || "").trim())
        .filter(Boolean);
    }

    // Fallback 3: Query all distinct colleges from DemandBooks
    if (colleges.length === 0) {
      const fallbackDemandRes = await withRetry((pool) =>
        pool.request().query(`
          SELECT DISTINCT CollegeName 
          FROM dbo.DemandBooks 
          WHERE CollegeName IS NOT NULL AND RTRIM(LTRIM(CAST(CollegeName AS VARCHAR(200)))) <> ''
          ORDER BY CollegeName ASC
        `)
      );
      colleges = fallbackDemandRes.recordset
        .map((r) => String(r.CollegeName || "").trim())
        .filter(Boolean);
    }

    const uniqueColleges = Array.from(new Set(colleges)).filter(Boolean);
    return res.json({ success: true, data: uniqueColleges });
  } catch (err) {
    console.error("Error fetching colleges:", err.message);
    return res.status(500).json({ success: false, message: "Server error fetching colleges" });
  }
};

// GET /api/demand-books/max-srno?collegeName=...
exports.getMaxSrNo = async (req, res) => {
  try {
    const collegeName = String(req.query.collegeName || "").trim();
    if (!collegeName || collegeName === "Select") {
      return res.json({ success: true, data: { maxSrNo: 1 } });
    }

    const result = await withRetry((pool) =>
      pool
        .request()
        .input("collegeName", collegeName)
        .query(`
          SELECT MAX(CAST(SerialNo AS INT)) AS maxSrNo 
          FROM dbo.DemandBooks 
          WHERE CollegeName = @collegeName AND ISNUMERIC(SerialNo) = 1
        `)
    );

    const val = result.recordset?.[0]?.maxSrNo;
    const nextSrNo = val != null && !isNaN(val) ? Number(val) + 1 : 1;

    return res.json({ success: true, data: { maxSrNo: nextSrNo } });
  } catch (err) {
    console.error("Error fetching max SrNo:", err.message);
    return res.status(500).json({ success: false, message: "Server error calculating SrNo" });
  }
};

// GET /api/demand-books/list?collegeName=...
exports.getDemandBooksList = async (req, res) => {
  try {
    const collegeName = String(req.query.collegeName || "").trim();
    if (!collegeName || collegeName === "Select") {
      return res.json({ success: true, data: [] });
    }

    const result = await withRetry((pool) =>
      pool
        .request()
        .input("collegeName", collegeName)
        .query(`
          SELECT 
            SerialNo, 
            IDNo, 
            Date, 
            Title, 
            Author, 
            Edition, 
            Publisher, 
            Price, 
            Category, 
            DemandType, 
            Name,
            CollegeName
          FROM dbo.DemandBooks 
          WHERE CollegeName = @collegeName 
          ORDER BY CASE WHEN ISNUMERIC(SerialNo) = 1 THEN CAST(SerialNo AS INT) ELSE 0 END DESC
        `)
    );

    return res.json({ success: true, data: result.recordset || [] });
  } catch (err) {
    console.error("Error fetching demand books list:", err.message);
    return res.status(500).json({ success: false, message: "Server error fetching list" });
  }
};

// POST /api/demand-books
exports.addDemandBook = async (req, res) => {
  try {
    const {
      collegeName,
      srNo,
      date,
      title,
      author,
      edition,
      publisher,
      price,
      category,
      demandType,
      idNo,
      name,
    } = req.body;

    if (!collegeName || collegeName === "Select") {
      return res.status(400).json({ success: false, message: "Select College Name" });
    }
    if (!srNo) {
      return res.status(400).json({ success: false, message: "Invalid Serial No." });
    }
    if (!title || !String(title).trim()) {
      return res.status(400).json({ success: false, message: "Enter Title" });
    }

    const parsedDate = date ? new Date(date) : new Date();

    await withRetry((pool) =>
      pool
        .request()
        .input("CollegeName", collegeName)
        .input("SerialNo", String(srNo))
        .input("Date", parsedDate)
        .input("Title", String(title).trim())
        .input("Author", author ? String(author).trim() : null)
        .input("Edition", edition ? String(edition).trim() : null)
        .input("Publisher", publisher && publisher !== "Select" ? String(publisher).trim() : null)
        .input("Price", price ? String(price).trim() : null)
        .input("Category", category ? String(category).trim() : null)
        .input("DemandType", demandType ? String(demandType).trim() : "Staff")
        .input("IDNo", idNo ? String(idNo).trim() : null)
        .input("Name", name ? String(name).trim() : null)
        .query(`
          INSERT INTO dbo.DemandBooks (
            CollegeName, SerialNo, Date, Title, Author, Edition, Publisher, Price, Category, DemandType, IDNo, Name
          ) VALUES (
            @CollegeName, @SerialNo, @Date, @Title, @Author, @Edition, @Publisher, @Price, @Category, @DemandType, @IDNo, @Name
          )
        `)
    );

    return res.json({ success: true, message: "Added to Demand Books Successfully" });
  } catch (err) {
    console.error("Error inserting demand book:", err.message);
    return res.status(500).json({ success: false, message: "Server error adding demand book" });
  }
};

// GET /api/demand-books/publishers?collegeName=...
exports.getPublishers = async (req, res) => {
  try {
    const collegeName = String(req.query.collegeName || "").trim();
    if (!collegeName || collegeName === "Select") {
      return res.json({ success: true, data: [] });
    }

    const result = await withRetry((pool) =>
      pool
        .request()
        .input("collegeName", collegeName)
        .query(`
          SELECT DISTINCT Publisher, Address, Contact 
          FROM dbo.Publishers 
          WHERE CollegeName = @collegeName 
          ORDER BY Publisher ASC
        `)
    );

    return res.json({ success: true, data: result.recordset || [] });
  } catch (err) {
    console.error("Error fetching publishers:", err.message);
    return res.status(500).json({ success: false, message: "Server error fetching publishers" });
  }
};

// POST /api/demand-books/publishers
exports.addPublisher = async (req, res) => {
  try {
    const { collegeName, publisher, address, contact } = req.body;

    if (!collegeName || collegeName === "Select") {
      return res.status(400).json({ success: false, message: "Select College Name" });
    }
    if (!publisher || !String(publisher).trim()) {
      return res.status(400).json({ success: false, message: "Please Enter Publisher" });
    }
    if (!address || !String(address).trim()) {
      return res.status(400).json({ success: false, message: "Please Enter Address" });
    }

    const trimmedPub = String(publisher).trim();
    const trimmedAddr = String(address).trim();
    const trimmedContact = contact ? String(contact).trim() : "";

    // Check if publisher already exists
    const checkRes = await withRetry((pool) =>
      pool
        .request()
        .input("collegeName", collegeName)
        .input("publisher", trimmedPub)
        .query(`
          SELECT Publisher 
          FROM dbo.Publishers 
          WHERE CollegeName = @collegeName AND Publisher = @publisher
        `)
    );

    if (checkRes.recordset && checkRes.recordset.length > 0) {
      return res.status(400).json({ success: false, message: "This Publisher Already Exist." });
    }

    await withRetry((pool) =>
      pool
        .request()
        .input("collegeName", collegeName)
        .input("publisher", trimmedPub)
        .input("address", trimmedAddr)
        .input("contact", trimmedContact)
        .query(`
          INSERT INTO dbo.Publishers (CollegeName, Publisher, Address, Contact)
          VALUES (@collegeName, @publisher, @address, @contact)
        `)
    );

    return res.json({ success: true, message: "Added Successfully" });
  } catch (err) {
    console.error("Error adding publisher:", err.message);
    return res.status(500).json({ success: false, message: "Server error adding publisher" });
  }
};

// DELETE /api/demand-books/publishers
exports.deletePublisher = async (req, res) => {
  try {
    const { collegeName, publisher } = req.body;

    if (!collegeName || !publisher) {
      return res.status(400).json({ success: false, message: "College and Publisher required" });
    }

    // Check if used in StockRegister
    const checkStock = await withRetry((pool) =>
      pool
        .request()
        .input("collegeName", collegeName)
        .input("publisher", publisher)
        .query(`
          SELECT TOP 1 Publisher 
          FROM dbo.StockRegister 
          WHERE CollegeName = @collegeName AND Publisher = @publisher
        `)
    );

    if (checkStock.recordset && checkStock.recordset.length > 0) {
      return res.status(400).json({
        success: false,
        message: "This Publisher is already being used in another books. Therefore it can't Delete.",
      });
    }

    await withRetry((pool) =>
      pool
        .request()
        .input("collegeName", collegeName)
        .input("publisher", publisher)
        .query(`
          DELETE FROM dbo.Publishers 
          WHERE CollegeName = @collegeName AND Publisher = @publisher
        `)
    );

    return res.json({ success: true, message: "Deleted Successfully" });
  } catch (err) {
    console.error("Error deleting publisher:", err.message);
    return res.status(500).json({ success: false, message: "Server error deleting publisher" });
  }
};

// PUT /api/demand-books/publishers/replace
exports.replacePublisher = async (req, res) => {
  try {
    const { collegeName, find, replaceWith } = req.body;

    if (!collegeName || !find || !replaceWith) {
      return res.status(400).json({ success: false, message: "Find and Replace With values are required" });
    }

    await withRetry((pool) =>
      pool
        .request()
        .input("collegeName", collegeName)
        .input("find", String(find).trim())
        .input("replaceWith", String(replaceWith).trim())
        .query(`
          UPDATE dbo.Publishers 
          SET Publisher = @replaceWith 
          WHERE CollegeName = @collegeName AND Publisher = @find
        `)
    );

    return res.json({ success: true, message: "Replace Successfully" });
  } catch (err) {
    console.error("Error replacing publisher:", err.message);
    return res.status(500).json({ success: false, message: "Server error replacing publisher" });
  }
};
