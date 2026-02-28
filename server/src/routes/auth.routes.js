const express = require("express");
const router = express.Router();
const {
  register,
  login,
  getMe,
  refreshToken,
  googleLogin,
} = require("../controllers/auth.controller");
const auth = require("../middleware/auth.middleware");

router.post("/register", register);
router.post("/login", login);
router.post("/google", googleLogin);
router.get("/me", auth, getMe);
router.post("/refresh-token", auth, refreshToken);

module.exports = router;
