# Backend changes to match the Next.js frontend

1. Install packages
   npm i bcryptjs jsonwebtoken

2. Copy these files into your backend (replace routes/bookRoutes.js):
   models/User.js, middleware/auth.js, routes/userRoutes.js, routes/bookRoutes.js

3. Add to backend/.env
   JWT_SECRET=change_me_access
   JWT_REFRESH_SECRET=change_me_refresh

4. In server.js
   - CORS origin must be the Next.js dev URL:
       app.use(cors({ origin: "http://localhost:3000" }));
   - Mount the user routes:
       app.use("/api/user", require("./routes/userRoutes"));
   - Books stays at:
       app.use("/api/books", require("./routes/bookRoutes"));

5. Add `timestamps: true` to the Book schema (bookRoutes sorts by createdAt).

Response convention used by the frontend: { message?, data }.
