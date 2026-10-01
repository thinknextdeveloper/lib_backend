const { withRetry } = require("../config/db");

const APPLICATION_NAME = "Library";

// GET /api/menu   (needs Authorization: Bearer <accessToken>)
// Same logic as VB LoadMenuItems: permitted items (LibMenuPERMS) + all their parents
exports.getMenu = async (req, res) => {
  try {
    const { userName, loginType } = req.user;

    if (!userName || !loginType) {
      return res.status(401).json({ message: "Please login again" });
    }

    // 1) every Library menu item (used to find parents)
    
    const allResult = await withRetry((pool) =>
      pool
        .request()
        .input("applicationName", APPLICATION_NAME)
        .query(`
          SELECT ID_ITEM, HIERAR, [TEXT], [DESC], FUNC
          FROM dbo.LibMenuITems
          WHERE ApplicationName = @applicationName
        `)
    );

    // 2) items this user has rights to (same join as VB EnterOK)
    const permResult = await withRetry((pool) =>
      pool
        .request()
        .input("userName", String(userName))
        .input("loginType", loginType)
        .input("applicationName", APPLICATION_NAME)
        .query(`
          SELECT i.ID_ITEM
          FROM dbo.LibMenuITems i
          INNER JOIN dbo.LibMenuPERMS p
            ON p.ID_ITEM = i.ID_ITEM
           AND p.ApplicationName = i.ApplicationName
          WHERE LTRIM(RTRIM(CAST(p.ID_USER AS VARCHAR(50)))) = @userName
            AND p.LoginType = @loginType
            AND i.ApplicationName = @applicationName
        `)
    );

    const permittedIds = new Set(permResult.recordset.map((r) => r.ID_ITEM));
    const byHierar = new Map(
      allResult.recordset.map((r) => [String(r.HIERAR).trim(), r])
    );

    // 3) permitted items + all parents (cut HIERAR at the last ".")
    const keep = new Map();
    for (const r of allResult.recordset) {
      if (!permittedIds.has(r.ID_ITEM)) continue;

      let h = String(r.HIERAR).trim();
      keep.set(h, r);

      while (h.includes(".")) {
        h = h.slice(0, h.lastIndexOf("."));
        const parent = byHierar.get(h);
        if (parent) keep.set(h, parent);
      }
    }

    // FUNC is "No" (or empty) for parent items that open no page
    const cleanFunc = (f) => {
      const v = String(f ?? "").trim();
      return !v || v.toLowerCase() === "no" ? null : v;
    };

    const data = [...keep.entries()].map(([hierar, r]) => ({
      id: r.ID_ITEM,
      hierar,
      text: r.TEXT,
      desc: r.DESC,
      func: cleanFunc(r.FUNC),
      allowed: true,
    }));

    return res.json({ data });
  } catch (err) {
    console.error(err.message);
    return res.status(500).json({ message: "Server error" });
  }
};