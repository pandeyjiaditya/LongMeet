module.exports = {
  jwtSecret: process.env.JWT_SECRET || "longmeet_jwt_secret_dev",
  jwtExpire: process.env.JWT_EXPIRE || "7d",
};
