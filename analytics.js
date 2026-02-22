const mongoose = require("mongoose");

const mongodbUrl = process.env.mongodbUrl;
const token = process.env.token;

mongoose
  .connect(mongodbUrl)
  .then(() => console.log("database connected"))
  .catch((err) => console.error("MongoDB connection error:", err));

const statsSchema = new mongoose.Schema({
  date: { type: String, unique: true },
  visitors: { type: Number, default: 0 },
});

const Stats = mongoose.model("Stats", statsSchema);

const visitors = async (req, res, next) => {
  const today = new Date().toISOString().split("T")[0];

  const isAsset = req.path.match(
    /\.(css|js|png|jpg|jpeg|gif|ico|svg|woff|woff2)$/,
  );
  const isStats = req.path === "/api/v1/stats";

  //fire and forget no await

  if (!isAsset && !isStats) {
    Stats.findOneAndUpdate(
      { date: today },
      { $inc: { visitors: 1 } },
      { upsert: true },
    ).catch(console.error);
  }

  next();
};

const getStats = async (req, res) => {
  const authHeader = req.headers["authorization"];
  if (authHeader !== token) {
    return res.status(401).json({ error: "Unauthorized" });
  }
  const stats = await Stats.find().sort({ date: -1 }).limit(30);
  res.json(stats);
};

module.exports = { visitors, getStats };
