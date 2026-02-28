const jwt = require("jsonwebtoken");
const { OAuth2Client } = require("google-auth-library");
const User = require("../models/User.model");
const { jwtSecret, jwtExpire } = require("../config/constants");

const googleClient = new OAuth2Client(
  process.env.GOOGLE_CLIENT_ID ||
    "1052308984014-ej9fggc7q9gv569enie1rtd0untt4ho1.apps.googleusercontent.com",
);

const generateToken = (userId) =>
  jwt.sign({ id: userId }, jwtSecret, { expiresIn: jwtExpire });

exports.register = async (req, res, next) => {
  try {
    const { name, email, password } = req.body;

    const existingUser = await User.findOne({ email });
    if (existingUser)
      return res
        .status(400)
        .json({ success: false, message: "Email already in use" });

    const user = await User.create({ name, email, password });
    const token = generateToken(user._id);

    res.status(201).json({ success: true, token, user });
  } catch (err) {
    next(err);
  }
};

exports.login = async (req, res, next) => {
  try {
    const { email, password } = req.body;

    const user = await User.findOne({ email }).select("+password");
    if (!user || !(await user.comparePassword(password))) {
      return res
        .status(401)
        .json({ success: false, message: "Invalid credentials" });
    }

    const token = generateToken(user._id);
    res.json({ success: true, token, user });
  } catch (err) {
    next(err);
  }
};

exports.getMe = async (req, res, next) => {
  try {
    const user = await User.findById(req.user.id);
    res.json({ success: true, user });
  } catch (err) {
    next(err);
  }
};

exports.googleLogin = async (req, res, next) => {
  try {
    const { credential } = req.body;
    if (!credential) {
      return res
        .status(400)
        .json({ success: false, message: "Google credential is required" });
    }

    const ticket = await googleClient.verifyIdToken({
      idToken: credential,
      audience:
        process.env.GOOGLE_CLIENT_ID ||
        "1052308984014-ej9fggc7q9gv569enie1rtd0untt4ho1.apps.googleusercontent.com",
    });
    const { email, name, picture, sub: googleId } = ticket.getPayload();

    let user = await User.findOne({ email });
    if (!user) {
      const randomPassword =
        Math.random().toString(36).slice(-12) +
        Math.random().toString(36).slice(-12);
      user = await User.create({
        name,
        email,
        password: randomPassword,
        avatar: picture || "",
        googleId,
      });
    } else if (!user.googleId) {
      user.googleId = googleId;
      if (picture && !user.avatar) user.avatar = picture;
      await user.save();
    }

    const token = generateToken(user._id);
    res.json({ success: true, token, user });
  } catch (err) {
    console.error("Google login error:", err.message);
    next(err);
  }
};

exports.refreshToken = async (req, res, next) => {
  try {
    const user = await User.findById(req.user.id);
    if (!user) {
      return res
        .status(401)
        .json({ success: false, message: "User not found" });
    }
    const token = generateToken(user._id);
    res.json({ success: true, token });
  } catch (err) {
    next(err);
  }
};
