const express = require("express");
const router = express.Router();
const { getProfile, updateProfile } = require("../controllers/user.controller");
const auth = require("../middleware/auth.middleware");

router.get("/:id", auth, getProfile);
router.put("/profile", auth, updateProfile);

module.exports = router;
